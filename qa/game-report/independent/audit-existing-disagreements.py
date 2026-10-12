#!/usr/bin/env python3
"""Independent reverse audit: existing source disagreements into game reports."""
import csv
import gzip
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FILES = {name: ROOT / 'assets/data' / (name + '.json') for name in ['team-details', 'matchup-breakdown', 'game-reports']}
sha = lambda data: hashlib.sha256(data).hexdigest()
raw = {name: path.read_bytes() for name, path in FILES.items()}
books = {name: json.loads(data) for name, data in raw.items()}
manifest_path = Path('/workspace/recovery-qa/game-report-current-matchup-evidence-final/source-manifest.json')
manifest = json.loads(manifest_path.read_bytes())
sources = {s['id']: s for s in manifest['sources']}

def source_body(source_id):
    source = sources[source_id]
    archive = Path(source['bodyPath']).read_bytes()
    assert sha(archive) == source['archiveSha256']
    body = gzip.decompress(archive)
    assert sha(body) == source['sha256']
    return body

primary_rows = list(csv.DictReader(source_body('nflverse_player_stats').decode().splitlines()))
results = []
for book_name in ['team-details', 'matchup-breakdown']:
    book = books[book_name]
    for issue in book.get('disagreements', []):
        gid, team, pid, field = issue.get('gameId'), issue.get('team'), issue.get('playerId'), issue['field']
        row = {'originBook': book_name, 'existingIssue': issue, 'classification': None}
        entry = books['game-reports']['games'].get(gid)
        detail = json.loads((ROOT / entry['detailUrl']).read_bytes()) if entry else None
        if not gid:
            row['classification'] = 'current-roster-only; no exact historical-game scope'
        elif not entry:
            row['classification'] = 'no completed game report; existing scheduled-event conflict remains masked'
        elif field == 'venue':
            row['classification'] = 'venue-label-disclosure-only'
            row['reportVenue'] = detail['venue']
            row['reportIssues'] = [r for r in detail.get('disagreements', []) if r['field'] == 'venue']
        elif field == 'startingQuarterback':
            # A passing category/position is not a source-confirmed starting role.
            assert all('started' not in p and 'starter' not in p and 'confirmedStarter' not in p
                       for records in detail['players'].values() for p in records)
            row['classification'] = 'starting-role-conflict; report makes no game-box starter assertion'
        elif pid:
            player = books['matchup-breakdown']['teams'][team]['players'][pid]
            espn = str(player['espnId'])
            report_player = next((p for p in detail['players'][team] if str(p['espnId']) == espn), None)
            row.update(playerEspnId=espn, playerGsisId=pid, playerName=player['name'],
                       reportValue=report_player['stats'].get(field) if report_player else None,
                       reportDetailUrl=entry['detailUrl'], reportSha256=entry['sha256'])
            matched = [r for r in detail.get('disagreements', []) if r.get('team') == team and
                       str(r.get('playerId', '')) == espn and r['field'] == 'players.' + field]
            row['reportIssues'] = matched
            row['classification'] = 'known-basic-conflict-propagated' if matched and row['reportValue'] is None else 'missing-known-basic-conflict'
            nf = next(r for r in primary_rows if r['player_id'] == pid and r['game_id'] == gid)
            # Raw fumbles_total is the provider's explicit total. Components omit
            # certain recoveries; their sum must not replace the published total.
            nf_value = int(nf['targets']) if field == 'targets' else abs(int(nf['sack_yards_lost'])) if field == 'sackYardsLost' else int(nf['fumbles_total']) if field == 'fumbles' else None
            provider_id = next(sid for sid in issue['sourceIds'] if sid.startswith('espn_'))
            provider = json.loads(source_body(provider_id))
            provider_value = None
            wanted_category = {'targets': 'receiving', 'sackYardsLost': 'passing', 'fumbles': 'fumbles'}.get(field)
            wanted_label = {'targets': 'TGTS', 'sackYardsLost': 'SACKS', 'fumbles': 'FUM'}.get(field)
            for group in provider['boxscore']['players']:
                for category in group['statistics']:
                    if category['name'] != wanted_category:
                        continue
                    for athlete in category['athletes']:
                        if str(athlete['athlete']['id']) != espn:
                            continue
                        value = athlete['stats'][category['labels'].index(wanted_label)]
                        provider_value = int(value.split('-')[1]) if field == 'sackYardsLost' else int(value)
            assert nf_value is not None and provider_value is not None and nf_value != provider_value
            assert sorted(issue['values']) == sorted([nf_value, provider_value])
            row['verifiedValuesBySource'] = {'nflverse_player_stats': nf_value, provider_id: provider_value}
            row['rawSources'] = {sid: sources[sid] for sid in issue['sourceIds']}
            row['reportMatchingSourceDescriptors'] = [s for s in detail['sources'] if s['id'] in issue['sourceIds'] or s['id'] == 'espn_game_report_' + detail['espnEventId']]
            row['note'] = 'Existing issue values are primary-first although sourceIds may be ESPN-first. Do not zip those arrays into mislabeled provider values.'
        else:
            row['classification'] = 'other exact-event issue requires owner review'
        results.append(row)

assert all(path.read_bytes() == raw[name] for name, path in FILES.items()), 'Input freeze changed during reverse source audit'
receipt = {'checkedAt': datetime.now(timezone.utc).isoformat(),
           'sourceHashes': {str(FILES[name].relative_to(ROOT)): sha(data) for name, data in raw.items()},
           'sourceManifestSha256': sha(manifest_path.read_bytes()), 'sourceStable': True,
           'existingIssuesAudited': len(results), 'classificationCounts': dict(Counter(r['classification'] for r in results)),
           'issues': results, 'status': 'fix-required' if any(r['classification'] == 'missing-known-basic-conflict' for r in results) else 'passed',
           'qualification': 'Raw checksum-verified provider responses, independently parsed. Current-roster changes are not applied retroactively to historical game-box fields; source-confirmed starter roles are separate from statistical categories.'}
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'qa/game-report/independent/reverse-disagreement-audit.json'
assert not destination.exists(), 'Immutable receipt destination must be fresh'
destination.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'path': str(destination), 'status': receipt['status'], 'counts': receipt['classificationCounts'], 'sha256': sha(destination.read_bytes())}))
