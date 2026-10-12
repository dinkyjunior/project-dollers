#!/usr/bin/env python3
"""Independently bind the compact catalog and every reading to exact raw sources."""
import copy
import csv
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[3]
sha = lambda data: hashlib.sha256(data).hexdigest()
index_path = ROOT / 'assets/data/game-reports.json'
index_bytes = index_path.read_bytes()
index = json.loads(index_bytes)
manifest_path = Path('/workspace/recovery-qa/game-report-current-matchup-evidence-final/source-manifest.json')
manifest = json.loads(manifest_path.read_bytes())
source_manifest = {s['id']: s for s in manifest['sources']}
games_path = ROOT / 'qa/game-report/independent/source-check/nflverse-games.csv.gz'
games_raw = gzip.decompress(games_path.read_bytes())
games = {r['game_id']: r for r in csv.DictReader(games_raw.decode().splitlines())}
raw_cache = Path('/workspace/recovery-qa/game-report-source-cache')
raws, stats, game_snapshots = {}, {}, {}
checks = 0

def require(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)

def source_body(descriptor):
    sid = descriptor['id']
    key = sid + ':' + descriptor['sha256']
    if key in raws:
        body = raws[key]
    elif sid == 'nflverse_games' and descriptor['sha256'] == '1d32c849f27b42337776295bf889c3815ba8acfd14715b7801d48bcb2c03f86d':
        body = (ROOT / 'qa/game-report/independent/source-check/old-nflverse-recovery/recovered-games.csv').read_bytes()
        raws[key] = body
    elif sid in source_manifest:
        stored = source_manifest[sid]
        archive = Path(stored['bodyPath']).read_bytes()
        require(sha(archive) == stored['archiveSha256'], 'Source archive hash ' + sid)
        body = gzip.decompress(archive)
        raws[key] = body
    elif sid.startswith('espn_game_report_'):
        body = (raw_cache / ('espn-summary-' + sid.removeprefix('espn_game_report_') + '.json')).read_bytes()
        raws[key] = body
    else:
        raise AssertionError('No actual raw source retained for ' + sid)
    require(sha(body) == descriptor['sha256'] and len(body) == descriptor['bytes'], 'Exact source reading body ' + sid)
    return body

def normalize_instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

def numeric(value):
    return float(str(value).replace(',', ''))

def reported_reading(issue, descriptor):
    sid, field, gid = descriptor['id'], issue['field'], issue['gameId']
    body = source_body(descriptor)
    if sid == 'nflverse_games':
        digest = descriptor['sha256']
        if digest not in game_snapshots:
            game_snapshots[digest] = {r['game_id']:r for r in csv.DictReader(body.decode().splitlines())}
        row = game_snapshots[digest][gid]
        if field == 'venue': return row['stadium']
        if field == 'neutralSite': return row['location'] == 'Neutral'
        if field == 'kickoffUtc':
            local = datetime.fromisoformat(row['gameday'] + 'T' + row['gametime']).replace(tzinfo=ZoneInfo('America/New_York'))
            return normalize_instant(local.isoformat())
        raise AssertionError('Unexpected games-source field ' + field)
    if sid.startswith('nflverse_player_stats'):
        if sid not in stats:
            stats[sid] = list(csv.DictReader(body.decode().splitlines()))
        rows = [r for r in stats[sid] if r.get('game_id') == gid and r.get('team', r.get('recent_team')) == issue['team']]
        require(bool(rows), 'Exact primary player cohort ' + gid)
        if issue['scope'] == 'player':
            row = next(r for r in rows if r['player_id'] == issue['playerGsisId'])
            return numeric(row['targets']) if field == 'targets' else abs(numeric(row['sack_yards_lost'])) if field == 'sackYardsLost' else numeric(row['fumbles_total']) if field == 'fumbles' else None
        net = sum(numeric(r['passing_yards'] or 0) + numeric(r['sack_yards_lost'] or 0) for r in rows)
        rush = sum(numeric(r['rushing_yards'] or 0) for r in rows)
        return net if field == 'netPassing' else net + rush if field == 'totalOffense' else sum(abs(numeric(r['sack_yards_lost'] or 0)) for r in rows) if field == 'sackYardsLost' else None
    raw = json.loads(body)
    competition = raw['header']['competitions'][0]
    if field == 'venue': return raw['gameInfo']['venue']['fullName']
    if field == 'kickoffUtc': return normalize_instant(competition['date'])
    if field == 'neutralSite': return competition['neutralSite']
    canonical = lambda abbr: {'STL':'LA', 'OAK':'LV', 'SD':'LAC'}.get(abbr, abbr)
    if issue['scope'] == 'team':
        team = next(t for t in raw['boxscore']['teams'] if canonical(t['team']['abbreviation']) == issue['team'])
        fields = {r['name']: r['displayValue'] for r in team['statistics']}
        return numeric(fields['netPassingYards']) if field == 'netPassing' else numeric(fields['totalYards']) if field == 'totalOffense' else numeric(fields['sacksYardsLost'].split('-')[1]) if field == 'sackYardsLost' else None
    category_name = {'targets':'receiving', 'sackYardsLost':'passing', 'fumbles':'fumbles'}[field]
    label = {'targets':'TGTS', 'sackYardsLost':'SACKS', 'fumbles':'FUM'}[field]
    stat_name = {'targets':'targets', 'sackYardsLost':'sacks-sackYardsLost', 'fumbles':'fumbles'}[field]
    for team in raw['boxscore']['players']:
        for category in team['statistics']:
            if category['name'] != category_name: continue
            for player in category['athletes']:
                if str(player['athlete']['id']) != issue['playerEspnId']: continue
                columns = category.get('names') or category['labels']
                key = stat_name if category.get('names') else label
                value = player['stats'][columns.index(key)]
                return numeric(value.split('-')[1]) if field == 'sackYardsLost' else numeric(value)
    raise AssertionError('Exact raw player/source field absent ' + sid)

def validate(catalog):
    require(catalog['integrityCatalog']['schemaVersion'] == 1, 'Known catalog schema')
    expected_dependencies = {'teamDetailsSha256':'team-details', 'matchupBreakdownSha256':'matchup-breakdown', 'playerHistorySha256':'player-history'}
    for key, name in expected_dependencies.items():
        require(catalog['integrityCatalog']['dependencies'][key] == sha((ROOT / ('assets/data/' + name + '.json')).read_bytes()), 'Exact raw-book hash ' + key)
    issues = catalog['knownDisagreements']
    expected = {}
    for gid, entry in catalog['games'].items():
        body = (ROOT / entry['detailUrl']).read_bytes()
        require(sha(body) == entry['sha256'] and len(body) == entry['bytes'], 'Actual report identity ' + gid)
        detail = json.loads(body)
        for number, dispute in enumerate(detail.get('disagreements', [])):
            expected[f'{gid}:{number}'] = (entry, detail, dispute)
    require(len(issues) == len(expected) and len({i['id'] for i in issues}) == len(expected), 'Exact catalog closure/cardinality')
    for issue in issues:
        require(issue['id'] in expected, 'No invented catalog item')
        entry, detail, original = expected[issue['id']]
        require(issue['gameId'] == detail['id'] and issue['season'] == detail['season'] and issue['week'] == detail['week'], 'Exact issue event context')
        require(issue['reportSha256'] == entry['sha256'] and issue['detailUrl'] == entry['detailUrl'] and issue['reportRetrievedAt'] == detail['retrievedAt'], 'Exact issue report body/time')
        require(issue['field'] == original['field'].split('.')[-1] and issue['reportField'] == original['field'] and issue['values'] == original['values'] and issue['sourceIds'] == original['sourceIds'], 'Unchanged issue fields/values/source identities')
        require(issue['action'] == original['action'], 'Original honest action preserved')
        descriptors = {s['id']:s for s in issue['sources']}
        require(set(descriptors) == set(issue['sourceIds']), 'Every exact source descriptor present')
        report_sources = {s['id']:s for s in detail['sources']}
        for sid, descriptor in descriptors.items():
            require(descriptor == report_sources[sid], 'No invented source descriptor/timestamp')
        require(sorted(json.dumps(r['value'],sort_keys=True) for r in issue['readings']) == sorted(json.dumps(v,sort_keys=True) for v in issue['values']), 'Explicit readings retain every actual value')
        require(set(sid for r in issue['readings'] for sid in r['sourceIds']) == set(issue['sourceIds']), 'Every source paired explicitly with its value')
        for reading in issue['readings']:
            require(bool(reading['sourceIds']), 'Each reading is sourced')
            for sid in reading['sourceIds']:
                require(sid in descriptors, 'Reading source is exact retained descriptor')
                actual = reported_reading(issue, descriptors[sid])
                require(actual == reading['value'] and (not isinstance(reading['value'],bool) or isinstance(actual,bool)), 'Actual raw provider/value pairing ' + issue['id'] + '/' + sid)
        if issue['scope'] == 'venue':
            require(issue['resolution'] == 'disclosed-alias', 'Venue alias disclosed without speculative masking')
        elif issue['scope'] == 'event':
            require(detail[issue['field']] is None, 'Critical contested event context unavailable')
        elif issue['scope'] == 'team':
            require(detail['stats'][issue['team']][issue['field']] is None, 'Contested team metric unavailable')
        else:
            player = next(p for p in detail['players'][issue['team']] if str(p['espnId']) == issue['playerEspnId'])
            require(player['stats'][issue['field']] is None, 'Contested game-box player field unavailable')
    return len(issues)

try:
    count = validate(index)
    require(index_path.read_bytes() == index_bytes, 'Actual index stable throughout independent audit')
    status, failure = 'passed', None
except Exception as error:
    status, count, failure = 'failed', None, str(error)
out = {'checkedAt':datetime.now(timezone.utc).isoformat(), 'status':status, 'assertions':checks,
       'indexSha256':sha(index_bytes), 'catalogItems':count, 'sourceManifestSha256':sha(manifest_path.read_bytes()),
       'helperSha256':sha(Path(__file__).read_bytes()), 'rawSourceBytesRead':sum(len(v) for v in raws.values()),
       'rawSourcesRead':len(raws), 'failure':failure,
       'qualification':'Read-only exact existing sources and reports. Each explicit source/value pair independently parsed from checksum-bound raw bytes, not zipped metadata arrays or production producer output.'}
destination = Path(sys.argv[1]).resolve()
require(not destination.exists(), 'Immutable output must be fresh')
destination.write_text(json.dumps(out, indent=2)+'\n')
print(json.dumps(out))
sys.exit(0 if status == 'passed' else 1)
