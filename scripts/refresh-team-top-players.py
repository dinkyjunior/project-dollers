#!/usr/bin/env python3
"""Publish compact current-roster NFL leaders from team-scoped regular-season rows.

Required source failures or invalid candidates leave the preceding file intact.
Shared refresh caches require their original verified URL, checksum and timestamps.
"""
import argparse
import collections
import concurrent.futures
import datetime as dt
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/data/team-top-players.json'
_spec = importlib.util.spec_from_file_location('pd_team_refresh', ROOT / 'scripts/refresh-team-details.py')
team_refresh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(team_refresh)
refresh = team_refresh.refresh
FIELDS = {key: refresh.STAT_FIELDS[key] for key in (
    'completions', 'attempts', 'passingYards', 'passingTD', 'interceptions',
    'carries', 'rushingYards', 'rushingTD', 'receptions', 'receivingYards', 'receivingTD')}


def number(value):
    try:
        result = float(value)
        return (int(result) if result.is_integer() else result) if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def total(rows, field):
    values = [number(row.get(field)) for row in rows]
    return sum(values) if values and all(value is not None for value in values) else None


def ranked(players, metric, participation, count=4):
    eligible = [p for p in players if p['seasonStats'][metric] is not None
                and p['seasonStats'][participation] is not None and p['seasonStats'][participation] > 0]
    return sorted(eligible, key=lambda p: (-p['seasonStats'][metric],
                                         -p['seasonStats'][participation], p['name'].casefold(), p['id']))[:count]


def build(base, datasets, metadata, catalog, now, season):
    expected = {item['abbr'] for item in base['teams']}
    games = {row['game_id']: row for row in datasets['nflverse_games']
             if row.get('season') == str(season) and row.get('game_type') == 'REG'}
    if {team_refresh.team_abbr(g[side]) for g in games.values() for side in ('home_team', 'away_team')} != expected:
        raise ValueError('The current regular-season schedule does not cover all expected teams')
    finals = {key: game for key, game in games.items()
              if number(game.get('home_score')) is not None and number(game.get('away_score')) is not None
              and number(game.get('result')) == number(game['home_score']) - number(game['away_score'])
              and refresh.kickoff(game) is not None and refresh.kickoff(game) <= now}
    groups = collections.defaultdict(list)
    covered = collections.defaultdict(set)
    seen = set()
    required = {'player_id', 'game_id', 'team', 'season', 'season_type', 'week', *FIELDS.values()}
    rows = datasets['nflverse_player_stats']
    if not rows or not required.issubset(rows[0]):
        raise ValueError('Required player-stat columns are unavailable')
    for row in rows:
        if row.get('season') != str(season) or row.get('season_type') != 'REG' or row.get('game_id') not in finals:
            continue
        abbr = team_refresh.team_abbr(row['team'])
        game = finals[row['game_id']]
        if abbr not in (team_refresh.team_abbr(game['home_team']), team_refresh.team_abbr(game['away_team'])):
            raise ValueError('A player-stat row does not belong to its game/team')
        if number(row['week']) != number(game['week']):
            raise ValueError('Player-stat week does not match its final game')
        key = (row['game_id'], abbr, row['player_id'])
        if key in seen:
            raise ValueError('Duplicate team/game/player statistics')
        seen.add(key)
        groups[(abbr, row['player_id'])].append(row)
        covered[abbr].add(row['game_id'])
    conflicts = collections.defaultdict(set)
    for issue in catalog.get('knownDisagreements', []):
        if issue.get('scope') == 'player' and issue.get('season') == season and issue.get('resolution') != 'disclosed-alias':
            conflicts[(issue.get('team'), str(issue.get('playerGsisId') or ''))].add(issue.get('field'))
            conflicts[(issue.get('team'), 'espn:' + str(issue.get('playerEspnId') or ''))].add(issue.get('field'))
    rosters = collections.defaultdict(dict)
    for row in datasets['nflverse_roster']:
        abbr = team_refresh.team_abbr(row.get('team'))
        if row.get('season') != str(season) or abbr not in expected or row.get('status') == 'CUT':
            continue
        player_id = row.get('gsis_id')
        if not player_id or not row.get('full_name'):
            continue
        previous = rosters[abbr].get(player_id)
        if previous and any(previous.get(k) != row.get(k) for k in ('full_name', 'espn_id', 'position')):
            raise ValueError('Ambiguous current roster identity')
        rosters[abbr][player_id] = row
    teams = {}
    for abbr in sorted(expected):
        if not covered[abbr] or not rosters[abbr]:
            raise ValueError(f'{abbr}: current roster/stat coverage is absent')
        players = []
        for player_id, row in rosters[abbr].items():
            own_rows = groups.get((abbr, player_id), [])
            if not own_rows:
                continue
            values = {field: total(own_rows, csv_field) for field, csv_field in FIELDS.items()}
            blocked = conflicts[(abbr, player_id)] | conflicts[(abbr, 'espn:' + str(row.get('espn_id') or ''))]
            for field in blocked:
                if field in values:
                    values[field] = None
            values['games'] = len(own_rows)
            players.append({'id': player_id, 'name': row['full_name'], 'espnId': row.get('espn_id') or None,
                            'headshotUrl': row.get('headshot_url') or None, 'jersey': row.get('jersey_number') or None,
                            'position': row.get('position') or None, 'seasonStats': values,
                            'team': abbr, 'gameIds': sorted(r['game_id'] for r in own_rows),
                            'sourceIds': ['nflverse_roster', 'nflverse_player_stats', 'nflverse_games'],
                            'blockedFields': sorted(blocked & set(FIELDS))})
        qbs = ranked([p for p in players if p['position'] == 'QB'], 'attempts', 'attempts', 1)
        rushing = ranked(players, 'rushingYards', 'carries')
        receiving = ranked(players, 'receivingYards', 'receptions')
        if not qbs or not rushing or not receiving:
            raise ValueError(f'{abbr}: verified QB/rusher/receiver coverage is absent')
        game_ids = sorted(covered[abbr])
        teams[abbr] = {'quarterback': qbs[0], 'rushing': rushing, 'receiving': receiving,
                       'coverage': {'status': 'verified', 'teamScoped': True, 'season': season, 'seasonType': 'REG',
                                    'throughWeek': max(int(finals[g]['week']) for g in game_ids), 'gameIds': game_ids,
                                    'candidateCounts': {'players': len(players),
                                                        'rushers': sum(p['seasonStats']['carries'] is not None and p['seasonStats']['carries'] > 0 for p in players),
                                                        'receivers': sum(p['seasonStats']['receptions'] is not None and p['seasonStats']['receptions'] > 0 for p in players)}}}
    sources = list(metadata.values())
    return {'schemaVersion': 1, 'season': season, 'seasonType': 'REG',
            'throughWeek': max(t['coverage']['throughWeek'] for t in teams.values()),
            'retrievedAt': min(s['retrievedAt'] for s in sources), 'generatedAt': refresh.iso(now),
            'sources': sources, 'teams': teams,
            'provenance': {'scope': 'Current-roster players; regular-season statistics for this team only.',
                           'quarterbackSelection': 'Most verified passing attempts among current-roster quarterbacks; not a confirmed starter claim.',
                           'ranking': 'Yards descending; participation descending; player name and ID for ties.',
                           'missingValues': 'Missing or disputed source cells stay null; no inferred zero or cross-team total.',
                           'integrityCatalogSha256': hashlib.sha256(json.dumps(catalog, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}}


def validate(data):
    if data.get('schemaVersion') != 1 or data.get('seasonType') != 'REG' or len(data.get('teams', {})) != 32:
        raise ValueError('Invalid all-team top-player schema')
    if not isinstance(data.get('season'), int) or not data.get('sources'):
        raise ValueError('Season/source metadata missing')
    dt.datetime.fromisoformat(data['retrievedAt'].replace('Z', '+00:00'))
    for source in data['sources']:
        if source.get('status') != 'verified' or len(source.get('sha256', '')) != 64 or source.get('httpStatus') != 200:
            raise ValueError('Source retrieval/checksum evidence is missing')
        dt.datetime.fromisoformat(source['retrievedAt'].replace('Z', '+00:00'))
    for abbr, team in data['teams'].items():
        cov = team['coverage']
        if cov.get('status') != 'verified' or cov.get('teamScoped') is not True or not cov.get('gameIds'):
            raise ValueError('Team-specific stat coverage is missing')
        for name, metric, participation in [('rushing', 'rushingYards', 'carries'), ('receiving', 'receivingYards', 'receptions')]:
            leaders = team[name]
            if not 1 <= len(leaders) <= 4 or len({p['id'] for p in leaders}) != len(leaders) or leaders != ranked(leaders, metric, participation):
                raise ValueError('Invalid or unsorted top-four player ranking')
        for player in [team['quarterback'], *team['rushing'], *team['receiving']]:
            if player.get('team') != abbr or not player.get('id') or not player.get('name') or not player.get('sourceIds'):
                raise ValueError('Invalid player/team identity')
            if not set(player.get('gameIds', [])).issubset(cov['gameIds']) or not player.get('gameIds'):
                raise ValueError('Player statistics escaped team coverage')
            if any(value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)) for value in player['seasonStats'].values()):
                raise ValueError('Non-numeric player statistic')
        if team['quarterback']['position'] != 'QB':
            raise ValueError('Selected quarterback identity is not a QB')
    return {'teams': 32, 'playerSlots': sum(1 + len(t['rushing']) + len(t['receiving']) for t in data['teams'].values()),
            'throughWeek': data['throughWeek'], 'retrievedAt': data['retrievedAt']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir')
    parser.add_argument('--season', type=int)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        print(json.dumps(validate(json.loads(args.output.read_text())), indent=2))
        return
    base = json.loads((ROOT / 'assets/data/current.json').read_text())
    season = args.season or int(base['season'])
    specs = refresh.source_specs(season)
    items = [(key, specs[key]) for key in ('nflverse_roster', 'nflverse_player_stats', 'nflverse_games')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda item: team_refresh.checked_fetch_source(item, args.cache_dir), items))
    datasets = {key: rows for key, rows, _ in results}
    metadata = {key: meta for key, _, meta in results}
    catalog = json.loads((ROOT / 'assets/data/game-reports.json').read_text())
    data = build(base, datasets, metadata, catalog, dt.datetime.now(dt.timezone.utc), season)
    checks = validate(data)
    if args.output.exists():
        previous = json.loads(args.output.read_text())
        if previous.get('season') == season and previous.get('retrievedAt', '') > data['retrievedAt']:
            raise ValueError('Older source retrieval refused; previous validated file retained')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    body = (json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n').encode()
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as handle:
        handle.write(body)
        pending = Path(handle.name)
    try:
        os.replace(pending, args.output)
    finally:
        pending.unlink(missing_ok=True)
    print(json.dumps({**checks, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
