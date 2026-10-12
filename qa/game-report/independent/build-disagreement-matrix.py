#!/usr/bin/env python3
"""Read-only, independently map report conflicts to every existing consumer row."""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
paths = {name: ROOT / 'assets/data' / f'{name}.json' for name in
         ['team-details', 'matchup-breakdown', 'player-history', 'game-reports']}
books = {name: json.loads(path.read_bytes()) for name, path in paths.items()}
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
rows = []

def games_in(book):
    for abbr, team in book.get('teams', {}).items():
        for key in ['games', 'headToHeadGames']:
            for i, game in enumerate(team.get(key, [])):
                yield abbr, f'teams.{abbr}.{key}[{i}]', game

def history_rows():
    for pid, player in books['player-history']['players'].items():
        for gid, game in player.get('games', {}).items():
            yield pid, f'players.{pid}.games.{gid}', game

for gid, entry in books['game-reports']['games'].items():
    detail = json.loads((ROOT / entry['detailUrl']).read_bytes())
    for conflict in detail.get('disagreements', []):
        full_field = conflict['field']
        if full_field == 'venue':
            continue
        field = full_field.split('.')[-1]
        team, espn = conflict.get('team'), conflict.get('player')
        scope = 'player' if full_field.startswith('players.') else 'team' if full_field.startswith('stats.') else 'event'
        item = {'gameId': gid, 'season': detail['season'], 'week': detail['week'],
                'scope': scope, 'team': team, 'field': field, 'reportField': full_field,
                'reportValue': None, 'values': conflict['values'],
                'sourceIds': conflict['sourceIds'],
                'sources': {sid: next(s for s in detail['sources'] if s['id'] == sid) for sid in conflict['sourceIds']},
                'detailUrl': entry['detailUrl'], 'reportSha256': entry['sha256'],
                'reportRetrievedAt': detail['retrievedAt'], 'consumers': [],
                'playerEspnId': str(espn) if espn is not None else None}
        # The producer uses playerId, not player, in the actual discrepancy schema.
        if scope == 'player':
            espn = str(conflict.get('playerId', conflict.get('player', '')))
            item['playerEspnId'] = espn
            mapped = []
            for abbr, club in books['matchup-breakdown']['teams'].items():
                for pid, player in club.get('players', {}).items():
                    if str(player.get('espnId', '')) != espn:
                        continue
                    mapped.append({'gsisId': pid, 'name': player['name'], 'club': abbr})
                    for i, game in enumerate(player.get('gameLog', [])):
                        if game.get('gameId') != gid or (team and game.get('team') != team):
                            continue
                        path = f'teams.{abbr}.players.{pid}.gameLog[{i}]'
                        consumer = {'book': 'matchup-breakdown', 'path': f'{path}.stats.{field}',
                                    'rawValue': game.get('stats', {}).get(field)}
                        if field == 'targets':
                            consumer.update(derivedTargetShare=game.get('advanced', {}).get('targetShare'),
                                            targetShareSourceIds=game.get('advancedProvenance', {}).get('fieldSources', {}).get('targetShare'),
                                            derivedPath=f'{path}.advanced.targetShare')
                        item['consumers'].append(consumer)
            item['playerMappings'] = mapped
            if mapped:
                item['playerGsisId'], item['playerName'] = mapped[0]['gsisId'], mapped[0]['name']
            for pid, path, game in history_rows():
                if game.get('gameId') == gid and any(m['gsisId'] == pid for m in mapped):
                    item['consumers'].append({'book': 'player-history', 'path': f'{path}.stats.{field}',
                                              'rawValue': game.get('stats', {}).get(field)})
            item['dependentConsumers'] = ['receiving leader targets total/per game before sumRows',
                'player game profile/allStats/history/opponent-history targets',
                'advanced.targetShare; NFLverse player numerator conflicts, PBP denominator remains separately sourced',
                'targets & snaps / receiver target share research dialogs'] if field == 'targets' else [
                f'Full game profile/allStats/history/opponent-history {field}',
                'Unrelated independently sourced passing counts, sack rate, targets and team target share remain unchanged']
        else:
            for name in ['team-details', 'matchup-breakdown']:
                for abbr, path, game in games_in(books[name]):
                    if game['id'] != gid:
                        continue
                    if scope == 'team':
                        item['consumers'].append({'book': name, 'club': abbr,
                            'path': f'{path}.stats.{team}.{field}',
                            'rawValue': game.get('stats', {}).get(team, {}).get(field),
                            'aggregateSide': 'gained' if abbr == team else 'allowed'})
                    else:
                        item['consumers'].append({'book': name, 'club': abbr,
                            'path': f'{path}.{field}', 'rawValue': game.get(field),
                            'neutralAlias': game.get('neutral') if field == 'neutralSite' else None})
            if scope == 'event':
                for abbr, club in books['matchup-breakdown']['teams'].items():
                    for pid, player in club.get('players', {}).items():
                        for i, game in enumerate(player.get('gameLog', [])):
                            if game.get('gameId') == gid:
                                alias = 'homeAway' if field == 'neutralSite' else field
                                item['consumers'].append({'book': 'matchup-breakdown',
                                    'path': f'teams.{abbr}.players.{pid}.gameLog[{i}].{alias}',
                                    'rawValue': game.get(alias)})
                for pid, path, game in history_rows():
                    if game.get('gameId') == gid:
                        alias = 'homeAway' if field == 'neutralSite' else field
                        item['consumers'].append({'book': 'player-history', 'path': f'{path}.{alias}',
                                                  'rawValue': game.get(alias)})
            item['dependentConsumers'] = ['selected game form rows / expanded game stats / H2H comparison',
                'Team yards gained AND opponent allowed totals/per-game before aggregate'] if scope == 'team' else [
                'fixture header and historical game/profile kickoff',
                'neutralSite AND neutral aliases, venueOf/venueKind and venue filters',
                'matching player gameLog homeAway classification; unknown must not enter home/away/neutral buckets']
        rows.append(item)

out = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'cross-screen-fix-required',
       'sourceHashes': {str(path.relative_to(ROOT)): sha(path) for path in paths.values()},
       'disagreements': rows, 'nonVenueConflictCount': len(rows),
       'playerHistoryConflictOverlaps': [r for r in rows if any(c['book'] == 'player-history' for c in r['consumers'])],
       'referenceFunctions': {'team-details': ['venueKind line26', 'selectedGames line28', 'aggregate line58', 'sourcesContent line153'],
                              'matchup-breakdown': ['venueOf line38', 'selectedGames line48', 'sumRows line66', 'playerSummary line70', 'sourceContent line274']},
       'note': 'Raw books preserved. Effective masks must precede aggregation; cross-provider disagreement is not resolved by choosing either source. Venue-label aliases require disclosure, not numeric/domain masks.'}
dest = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'qa/game-report/independent/cross-screen-disagreement-matrix-v2.json'
assert not dest.exists(), 'Refusing to overwrite independent immutable evidence'
dest.write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps({'path': str(dest.relative_to(ROOT)), 'conflicts': len(rows),
                  'consumerRows': sum(len(r['consumers']) for r in rows),
                  'playerHistoryOverlaps': len(out['playerHistoryConflictOverlaps']), 'sha256': sha(dest)}))
