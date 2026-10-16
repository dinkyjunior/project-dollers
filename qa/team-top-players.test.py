#!/usr/bin/env python3
"""Regressions for team-specific leader totals and failure-safe publication."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('leaders', ROOT / 'scripts/refresh-team-top-players.py')
leaders = importlib.util.module_from_spec(spec)
spec.loader.exec_module(leaders)


def fixture():
    def game(week):
        return {'game_id': f'2026_{week:02}_DAL_NYG', 'season': '2026', 'game_type': 'REG',
                'week': str(week), 'home_team': 'NYG', 'away_team': 'DAL', 'home_score': '21',
                'away_score': '17', 'result': '4', 'gameday': f'2026-09-{week * 7:02}', 'gametime': '13:00'}
    def roster(pid, abbr):
        return {'gsis_id': pid, 'espn_id': pid, 'full_name': f'Player {pid}', 'team': abbr,
                'season': '2026', 'status': 'ACT', 'position': 'QB'}
    def row(pid, abbr, week, attempts):
        value = {key: '0' for key in leaders.FIELDS.values()}
        value.update(player_id=pid, team=abbr, season='2026', season_type='REG', week=str(week),
                     game_id=f'2026_{week:02}_DAL_NYG', attempts=str(attempts), passing_yards=str(attempts * 10),
                     completions=str(attempts // 2), carries='2', rushing_yards='11', receptions='1', receiving_yards='8')
        return value
    data = {'nflverse_games': [game(1), game(2)],
            'nflverse_roster': [roster('1', 'DAL'), roster('2', 'NYG')],
            'nflverse_player_stats': [row('1', 'DAL', 2, 10), row('1', 'NYG', 1, 90), row('2', 'NYG', 2, 12)]}
    return {'teams': [{'abbr': 'DAL'}, {'abbr': 'NYG'}]}, data


class TeamLeaderTests(unittest.TestCase):
    def build(self, datasets, catalog=None):
        base, _ = fixture()
        return leaders.build(base, datasets, {'source': {'retrievedAt': '2026-10-16T00:00:00Z'}},
                             catalog or {}, dt.datetime(2026, 10, 16, tzinfo=dt.timezone.utc), 2026)

    def test_traded_player_keeps_only_current_team_statistics(self):
        _, data = fixture()
        player = self.build(data)['teams']['DAL']['quarterback']
        self.assertEqual(player['seasonStats']['attempts'], 10)
        self.assertEqual(player['seasonStats']['passingYards'], 100)
        self.assertEqual(player['gameIds'], ['2026_02_DAL_NYG'])

    def test_missing_cell_stays_null_and_conflict_blocks_only_affected_total(self):
        _, data = fixture()
        data['nflverse_player_stats'][0]['passing_tds'] = ''
        catalog = {'knownDisagreements': [{'scope': 'player', 'season': 2026, 'team': 'DAL',
                                         'playerGsisId': '1', 'field': 'interceptions', 'resolution': 'unavailable'}]}
        player = self.build(data, catalog)['teams']['DAL']['quarterback']
        self.assertIsNone(player['seasonStats']['passingTD'])
        self.assertIsNone(player['seasonStats']['interceptions'])
        self.assertEqual(player['seasonStats']['passingYards'], 100)

    def test_zero_participation_does_not_fill_a_fourth_rusher(self):
        _, data = fixture()
        inactive = copy.deepcopy(data['nflverse_roster'][0])
        inactive.update(gsis_id='3', espn_id='3', full_name='Non runner', position='LB')
        data['nflverse_roster'].append(inactive)
        stat = copy.deepcopy(data['nflverse_player_stats'][0])
        stat.update(player_id='3', carries='0', rushing_yards='0', receptions='0')
        data['nflverse_player_stats'].append(stat)
        self.assertEqual([p['id'] for p in self.build(data)['teams']['DAL']['rushing']], ['1'])

    def test_duplicate_or_wrong_game_team_rows_are_rejected(self):
        _, data = fixture()
        data['nflverse_player_stats'].append(copy.deepcopy(data['nflverse_player_stats'][0]))
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.build(data)
        _, data = fixture()
        data['nflverse_player_stats'][0]['team'] = 'PIT'
        with self.assertRaisesRegex(ValueError, 'does not belong'):
            self.build(data)

    def test_failed_required_fetch_retains_published_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'leaders.json'
            previous = b'{"previous":"validated snapshot"}\n'
            target.write_bytes(previous)
            with patch.object(sys, 'argv', ['refresh-team-top-players.py', '--output', str(target)]), \
                 patch.object(leaders.team_refresh, 'checked_fetch_source', side_effect=RuntimeError('Source unavailable')):
                with self.assertRaisesRegex(RuntimeError, 'Source unavailable'):
                    leaders.main()
            self.assertEqual(target.read_bytes(), previous)

    def test_unverified_cached_source_is_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            cached = Path(folder) / 'roster.csv'
            cached.write_text('arbitrary bytes')
            cached.with_suffix('.meta.json').write_text(json.dumps({'status': 'verified', 'url': 'https://wrong.example/', 'sha256': '0' * 64}))
            with self.assertRaisesRegex(RuntimeError, 'unverified cache'):
                leaders.team_refresh.checked_fetch_source(('roster', {'cache': cached.name, 'url': 'https://github.com/source.csv', 'required': True}), folder)


if __name__ == '__main__':
    unittest.main()
