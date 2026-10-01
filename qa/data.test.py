"""Isolated data-integrity regressions; synthetic fixtures are never published.

Run: python3 qa/data.test.py
The tests call pure snapshot construction. They never run refresh main(), use
the network, or write assets/data/current.json or its provenance manifest.
"""
import copy
import datetime as dt
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("dollar_refresh", ROOT / "scripts/refresh-data.py")
REFRESH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REFRESH)


def fixtures():
    abbreviations = "PIT ATL CLE NE ARI BAL BUF CAR CHI CIN DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NO NYG NYJ PHI SEA SF TB TEN WAS".split()
    pairs = list(zip(abbreviations[::2], abbreviations[1::2]))
    teams = [{"team_abbr": abbr, "team_conf": "AFC" if i < 16 else "NFC", "team_nick": abbr,
              "team_name": abbr, "team_division": "Test", "team_color": "#000000",
              "team_color2": "#ffffff", "team_logo_espn": "https://example.invalid/test.svg"}
             for i, abbr in enumerate(abbreviations)]
    games = []
    for week, date in [(1, "2026-09-13"), (2, "2026-09-20")]:
        for first, second in pairs:
            home, away = (first, second) if week == 1 else (second, first)
            games.append({"game_id": f"2026_{week:02d}_{away}_{home}", "season": "2026", "week": str(week),
                          "game_type": "REG", "gameday": date, "gametime": "13:00", "weekday": "Sunday",
                          "away_team": away, "home_team": home, "away_score": "10", "home_score": "20"})
    games.append({"game_id": "2026_03_PIT_CLE", "season": "2026", "week": "3", "game_type": "REG",
                  "gameday": "2026-09-27", "gametime": "13:00", "weekday": "Sunday", "away_team": "PIT",
                  "home_team": "CLE", "away_score": "", "home_score": ""})
    roster = [{"season": "2026", "team": "PIT", "status": "ACT", "gsis_id": "test-PIT-QB",
               "full_name": "Aaron Rodgers", "jersey_number": "8", "position": "QB", "espn_id": "", "week": "3"}]
    datasets = {"nflverse_games": games, "nflverse_teams": teams, "nflverse_roster": roster,
                "nflverse_player_stats": [], "nflverse_depth": [], "nflverse_injuries": []}
    now = dt.datetime(2026, 9, 21, 12, tzinfo=dt.timezone.utc)
    metadata = {key: {"id": key, "url": "https://example.invalid/test-only", "provider": "test fixture",
                      "required": key not in ("nflverse_depth", "nflverse_injuries"), "status": "verified",
                      "sha256": "test-only", "retrievedAt": REFRESH.iso(now)} for key in datasets}
    return datasets, metadata, now


def stat(team, opponent, game_id, week, position="QB", yards=0):
    row = {field: "0" for field in REFRESH.STAT_FIELDS.values()}
    row.update({"season": "2026", "season_type": "REG", "week": str(week), "game_id": game_id,
                "team": team, "opponent_team": opponent, "player_id": f"test-{team}-{position}",
                "position": position, "player_display_name": f"Test {team} {position}", "player_name": f"T.{team}"})
    row.update({"attempts": "10", "completions": "5", "passing_yards": str(yards)})
    return row


class CoverageTests(unittest.TestCase):
    def test_partial_release_uses_each_dataset_coverage_not_league_week(self):
        datasets, metadata, now = fixtures()
        datasets["nflverse_player_stats"] = [
            stat("PIT", "ATL", "2026_01_ATL_PIT", 1, yards=100),
            stat("NE", "CLE", "2026_01_NE_CLE", 1, yards=80),
            # League Week 2 exists, but PIT and CLE opponent stats have not
            # been released. The final scores must still update records.
            stat("BAL", "ARI", "2026_02_ARI_BAL", 2, yards=250),
        ]
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        REFRESH.validate(snapshot)
        self.assertEqual(snapshot["throughWeek"], 2)
        self.assertEqual(snapshot["context"]["statsThroughWeek"], 2)
        self.assertEqual(snapshot["steelers"]["record"]["record"], "1–1")
        team = snapshot["steelers"]["teamStats"]
        self.assertEqual((team["games"], team["throughWeek"], team["passingYardsPerGame"]), (1, 1, 100))
        self.assertEqual(team["pointsFor"], 20)
        self.assertEqual(team["coverageGameIds"], ["2026_01_ATL_PIT"])
        allowance = snapshot["steelers"]["matchup"]["allowances"]["QB"]
        self.assertEqual((allowance["games"], allowance["throughWeek"], allowance["passingYardsAllowedPerGame"]), (1, 1, 80))
        self.assertEqual(allowance["coverageGameIds"], ["2026_01_NE_CLE"])
        self.assertEqual(snapshot["provenance"]["teamStats"]["throughWeek"], 1)
        self.assertEqual(snapshot["provenance"]["opponentAllowances"]["throughWeek"], 1)

    def test_position_uses_shared_opponent_game_denominator(self):
        datasets, metadata, now = fixtures()
        te = stat("NE", "CLE", "2026_01_NE_CLE", 1, position="TE")
        te.update({"receiving_yards": "20", "receptions": "2", "attempts": "0", "completions": "0"})
        datasets["nflverse_player_stats"] = [stat("NE", "CLE", "2026_01_NE_CLE", 1, yards=80),
                                                stat("NE", "CLE", "2026_02_CLE_NE", 2, yards=100), te]
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        allowance = snapshot["steelers"]["matchup"]["allowances"]
        self.assertEqual(allowance["TE"]["games"], 2)
        self.assertEqual(allowance["TE"]["receivingYardsAllowedPerGame"], 10)
        self.assertEqual(allowance["QB"]["games"], allowance["TE"]["games"])
        self.assertIsNone(allowance["WR"]["receivingYardsAllowed"])
        self.assertEqual(allowance["WR"]["status"], "unavailable")

    def test_missing_column_rejects_snapshot_construction(self):
        datasets, metadata, now = fixtures()
        row = stat("PIT", "ATL", "2026_01_ATL_PIT", 1, yards=100)
        del row["passing_yards"]
        datasets["nflverse_player_stats"] = [row]
        with self.assertRaisesRegex(ValueError, "missing required columns: passing_yards"):
            REFRESH.build_snapshot(datasets, metadata, now, 2026)

    def test_future_week_recap_retains_explicit_latest_verified_week(self):
        datasets, metadata, now = fixtures()
        datasets["nflverse_games"].append({"game_id": "2026_04_ATL_PIT", "season": "2026", "week": "4", "game_type": "REG",
                                           "gameday": "2026-10-04", "gametime": "13:00", "weekday": "Sunday",
                                           "away_team": "ATL", "home_team": "PIT", "away_score": "", "home_score": ""})
        datasets["nflverse_player_stats"] = [stat("BAL", "ARI", "2026_02_ARI_BAL", 2, yards=250)]
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        future = snapshot["weeks"]["4"]
        self.assertEqual((future["leadersWeek"], future["recapWeek"]), (2, 2))
        self.assertEqual(len(future["recap"]), 16)
        self.assertTrue(all(game["week"] == 2 and game["status"] == "final" for game in future["recap"]))

    def test_missing_numeric_cell_propagates_unknown_not_zero(self):
        row = stat("PIT", "ATL", "2026_01_ATL_PIT", 1, yards=100)
        unknown = copy.deepcopy(row)
        unknown["passing_yards"] = ""
        values = REFRESH.aggregate_stats([row, unknown])
        self.assertIsNone(values["passingYards"])
        self.assertIsNone(values["passingYardsPerGame"])
        self.assertIsNone(values["passerRating"])
        self.assertEqual(values["interceptions"], 0)
        self.assertIsNone(REFRESH.aggregate_stats([])["passingYards"])
        self.assertIsNone(REFRESH.ratio(None, 2))
        datasets, metadata, now = fixtures()
        datasets["nflverse_player_stats"] = [unknown]
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        self.assertIsNone(snapshot["steelers"]["teamStats"]["netPassingYards"])
        self.assertIsNone(snapshot["steelers"]["teamStats"]["totalYards"])
        REFRESH.validate(snapshot)


if __name__ == "__main__":
    unittest.main()
