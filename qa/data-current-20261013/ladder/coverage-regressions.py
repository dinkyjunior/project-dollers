"""Source-coverage contracts for Current and explicitly selected research weeks.

Synthetic fixtures are never published. Calls the real pure producer; no HTTP,
saved-data writes or browser substitution. Run with python3 <this file>.
"""
import copy
import datetime as dt
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("existing_data_tests", ROOT / "qa/data.test.py")
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
REFRESH = BASE.REFRESH


def current_partial():
    datasets, metadata, _ = BASE.fixtures()
    now = dt.datetime(2026, 9, 28, 12, tzinfo=dt.timezone.utc)
    # A real-shaped Week 3 final and a still-future Week 3 fixture. All season
    # games before this point are finals; the current week is partially played.
    datasets["nflverse_games"][-1].update({"away_score": "0", "home_score": "7"})
    datasets["nflverse_games"].append({"game_id": "2026_03_BAL_ARI", "season": "2026", "week": "3", "game_type": "REG",
                                       "gameday": "2026-09-29", "gametime": "13:00", "away_team": "BAL", "home_team": "ARI",
                                       "away_score": "", "home_score": ""})
    datasets["nflverse_player_stats"] = [BASE.stat("PIT", "CLE", "2026_03_PIT_CLE", 3, yards=173),
                                        BASE.stat("BAL", "ARI", "2026_02_ARI_BAL", 2, yards=99)]
    for source in metadata.values():
        source["retrievedAt"] = REFRESH.iso(now)
    metadata["nflverse_games"]["retrievedAt"] = "2026-09-28T10:00:00Z"
    metadata["nflverse_player_stats"]["retrievedAt"] = "2026-09-28T11:00:00Z"
    return datasets, metadata, now


class LatestCoverageTests(unittest.TestCase):
    def build(self, datasets, metadata, now):
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        REFRESH.validate(snapshot)
        return snapshot

    def test_current_shows_new_final_and_same_week_published_leaders(self):
        datasets, metadata, now = current_partial()
        snapshot = self.build(datasets, metadata, now)
        self.assertEqual(snapshot["currentWeek"], 3)
        current = snapshot["weeks"]["3"]
        self.assertEqual((current["throughWeek"], current["leadersWeek"], current["recapWeek"]), (3, 3, 3))
        self.assertEqual(current["leaders"]["QB"][0]["yards"], 173)
        self.assertEqual(current["recap"][0]["id"], "2026_03_PIT_CLE")
        self.assertEqual((current["recap"][0]["away_score"], current["recap"][0]["home_score"]), (0, 7))
        pit = next(team for team in current["conferences"]["AFC"] if team["abbr"] == "PIT")
        self.assertEqual((pit["w"], pit["l"], pit["pointsFor"], pit["pointsAgainst"]), (1, 2, 30, 37))
        self.assertEqual(current["recapContext"]["status"], "verified")
        self.assertEqual(current["recapContext"]["partialWeek"], True)
        self.assertEqual((current["recapContext"]["completedGamesInWeek"], current["recapContext"]["scheduledGamesInWeek"]), (1, 2))
        self.assertEqual((current["leadersContext"]["completedGamesInWeek"], current["leadersContext"]["scheduledGamesInWeek"]), (1, 2))
        self.assertTrue(current["leadersContext"]["partialWeek"])

    def test_recap_new_scores_does_not_wait_for_player_release(self):
        datasets, metadata, now = current_partial()
        datasets["nflverse_player_stats"] = datasets["nflverse_player_stats"][1:]
        current = self.build(datasets, metadata, now)["weeks"]["3"]
        self.assertEqual((current["throughWeek"], current["leadersWeek"], current["recapWeek"]), (3, 2, 3))
        self.assertTrue(all(game["week"] == 3 for game in current["recap"]))
        self.assertEqual(current["leaders"]["QB"][0]["yards"], 99)
        self.assertEqual(current["leadersContext"]["coverageGameIds"], ["2026_02_ARI_BAL"])
        # The scoreboard can be complete while statistics publication is
        # partial. Never present a single released game as a full-week ranking.
        self.assertEqual((current["leadersContext"]["completedGamesInWeek"], current["leadersContext"]["scheduledGamesInWeek"]), (1, 16))
        self.assertTrue(current["leadersContext"]["partialWeek"])

    def test_historical_entering_week_and_future_latest_remain_distinct(self):
        datasets, metadata, now = current_partial()
        datasets["nflverse_player_stats"].append(BASE.stat("PIT", "ATL", "2026_01_ATL_PIT", 1, yards=51))
        datasets["nflverse_games"].append({"game_id": "2026_04_ATL_PIT", "season": "2026", "week": "4", "game_type": "REG",
                                           "gameday": "2026-10-04", "gametime": "13:00", "away_team": "ATL", "home_team": "PIT",
                                           "away_score": "", "home_score": ""})
        snapshot = self.build(datasets, metadata, now)
        historical, future = snapshot["weeks"]["2"], snapshot["weeks"]["4"]
        self.assertEqual((historical["throughWeek"], historical["leadersWeek"], historical["recapWeek"]), (1, 1, 1))
        self.assertEqual(historical["leaders"]["QB"][0]["yards"], 51)
        self.assertTrue(all(game["week"] == 1 for game in historical["recap"]))
        self.assertEqual((future["throughWeek"], future["leadersWeek"], future["recapWeek"]), (3, 3, 3))

    def test_statistics_gap_uses_available_week_not_empty_claim(self):
        datasets, metadata, now = current_partial()
        datasets["nflverse_player_stats"] = [BASE.stat("PIT", "ATL", "2026_01_ATL_PIT", 1, yards=51), datasets["nflverse_player_stats"][0]]
        snapshot = self.build(datasets, metadata, now)
        # Selected week 2 enters after Week 1; later Week 3 rows do not turn a
        # missing Week 2 statistics release into verified empty leader tables.
        self.assertEqual(snapshot["weeks"]["2"]["leadersWeek"], 1)
        datasets["nflverse_games"].append({"game_id": "2026_04_BAL_ARI", "season": "2026", "week": "4", "game_type": "REG",
                                           "gameday": "2026-10-04", "gametime": "13:00", "away_team": "BAL", "home_team": "ARI",
                                           "away_score": "", "home_score": ""})
        # Current Week 3 includes current stats; historical coverage limits
        # still select an actually available earlier statistics week.
        datasets["nflverse_games"][-2].update({"away_score": "10", "home_score": "20"})
        later = dt.datetime(2026, 9, 30, 12, tzinfo=dt.timezone.utc)
        snapshot = self.build(datasets, metadata, later)
        self.assertEqual(snapshot["currentWeek"], 4)
        self.assertEqual(snapshot["weeks"]["3"]["leadersWeek"], 1)
        self.assertEqual(snapshot["weeks"]["3"]["recapWeek"], 2)

    def test_source_context_keeps_independent_retrieval_and_game_coverage(self):
        datasets, metadata, now = current_partial()
        snapshot = self.build(datasets, metadata, now)
        current = snapshot["weeks"]["3"]
        self.assertEqual(current["leadersContext"]["retrievedAt"], "2026-09-28T11:00:00Z")
        self.assertEqual(current["recapContext"]["retrievedAt"], "2026-09-28T10:00:00Z")
        self.assertEqual(current["leadersContext"]["coverageGameIds"], ["2026_03_PIT_CLE"])
        self.assertEqual(current["leadersContext"]["sourceIds"], ["nflverse_player_stats"])
        self.assertEqual(current["recapContext"]["sourceIds"], ["nflverse_games"])
        self.assertEqual(snapshot["provenance"]["weeklyRecap"]["throughWeek"], 3)

    def test_mislabeled_period_retrieval_or_partial_coverage_rejects_candidate(self):
        datasets, metadata, now = current_partial()
        original = self.build(datasets, metadata, now)
        for field, key, bad_value, message in [
            ("leadersContext", "week", 2, "displayed period"),
            ("recapContext", "retrievedAt", original["generatedAt"], "source retrieval time"),
            ("recapContext", "partialWeek", False, "partial-week label"),
            ("recapContext", "completedGamesInWeek", 2, "final-game count"),
            ("leadersContext", "completedGamesInWeek", 2, "published statistics coverage"),
            ("leadersContext", "partialWeek", False, "statistics coverage"),
        ]:
            with self.subTest(field=field, key=key):
                changed = copy.deepcopy(original)
                changed["weeks"]["3"][field][key] = bad_value
                with self.assertRaisesRegex(AssertionError, message):
                    REFRESH.validate(changed)

    def test_pregame_first_week_remains_unavailable(self):
        datasets, metadata, _ = BASE.fixtures()
        for game in datasets["nflverse_games"]:
            game.update({"away_score": "", "home_score": ""})
        now = dt.datetime(2026, 9, 1, 12, tzinfo=dt.timezone.utc)
        for source in metadata.values():
            source["retrievedAt"] = REFRESH.iso(now)
        current = self.build(datasets, metadata, now)["weeks"]["1"]
        self.assertEqual((current["throughWeek"], current["leadersWeek"], current["recapWeek"]), (0, None, None))
        self.assertEqual(current["leadersContext"]["status"], "unavailable")
        self.assertEqual(current["recapContext"]["status"], "unavailable")
        self.assertEqual(current["recap"], [])

    def test_final_regular_season_week_keeps_results_without_week19(self):
        datasets, metadata, _ = BASE.fixtures()
        # Keep one legitimately sourced final Week 18; no upcoming games remain.
        datasets["nflverse_games"].pop()
        end = copy.deepcopy(datasets["nflverse_games"][0])
        end.update({"game_id": "2026_18_ATL_PIT", "week": "18", "gameday": "2027-01-10", "away_score": "21", "home_score": "24"})
        datasets["nflverse_games"].append(end)
        datasets["nflverse_player_stats"] = [BASE.stat("PIT", "ATL", "2026_18_ATL_PIT", 18, yards=210)]
        now = dt.datetime(2027, 1, 12, 12, tzinfo=dt.timezone.utc)
        for source in metadata.values():
            source["retrievedAt"] = REFRESH.iso(now)
        snapshot = self.build(datasets, metadata, now)
        self.assertEqual(snapshot["currentWeek"], 18)
        current = snapshot["weeks"]["18"]
        self.assertEqual((current["throughWeek"], current["leadersWeek"], current["recapWeek"]), (18, 18, 18))
        self.assertEqual([game["id"] for game in current["recap"]], ["2026_18_ATL_PIT"])


def monday_boundary():
    datasets, metadata, _ = current_partial()
    # Monday evening in New York, Tuesday morning in Sydney. The remaining
    # Week 3 final has not been published; the next future fixture is Week 4.
    remaining = datasets["nflverse_games"][-1]
    remaining.update({"gameday": "2026-09-28", "gametime": "20:15"})
    datasets["nflverse_games"].append({"game_id": "2026_04_ATL_PIT", "season": "2026", "week": "4", "game_type": "REG",
                                       "gameday": "2026-10-01", "gametime": "20:15", "away_team": "ATL", "home_team": "PIT",
                                       "away_score": "", "home_score": ""})
    starts = REFRESH.kickoff(remaining).astimezone(dt.timezone.utc)
    return datasets, metadata, starts, remaining


class CurrentWeekBoundaryTests(unittest.TestCase):
    def build(self, datasets, metadata, now):
        for source in metadata.values():
            source["retrievedAt"] = REFRESH.iso(now)
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        REFRESH.validate(snapshot)
        return snapshot

    def test_before_monday_kickoff_still_selects_current_week(self):
        datasets, metadata, starts, _ = monday_boundary()
        self.assertEqual(self.build(datasets, metadata, starts-dt.timedelta(minutes=1))["currentWeek"], 3)

    def test_after_monday_kickoff_retains_week_without_asserting_live_status(self):
        datasets, metadata, starts, remaining = monday_boundary()
        snapshot = self.build(datasets, metadata, starts+dt.timedelta(minutes=1))
        self.assertEqual(snapshot["currentWeek"], 3)
        self.assertEqual(snapshot["weeks"]["3"]["recapWeek"], 3)
        self.assertEqual(snapshot["weeks"]["3"]["leadersWeek"], 3)
        self.assertTrue(snapshot["weeks"]["3"]["recapContext"]["partialWeek"])
        self.assertNotIn(remaining["game_id"], [game["id"] for game in snapshot["weeks"]["3"]["recap"]])
        self.assertEqual(snapshot["provenance"]["currentWeek"]["status"], "derived")
        self.assertIn("does not verify live or in-progress", snapshot["provenance"]["currentWeek"]["note"])

    def test_published_monday_final_advances_to_next_week(self):
        datasets, metadata, starts, remaining = monday_boundary()
        remaining.update({"away_score": "10", "home_score": "20"})
        snapshot = self.build(datasets, metadata, starts+dt.timedelta(hours=3))
        self.assertEqual(snapshot["currentWeek"], 4)
        self.assertFalse(snapshot["weeks"]["4"]["recapContext"]["partialWeek"])
        self.assertIn(remaining["game_id"], [game["id"] for game in snapshot["weeks"]["4"]["recap"]])

    def test_eight_hour_release_window_is_inclusive_then_overdue_uses_future(self):
        datasets, metadata, starts, remaining = monday_boundary()
        self.assertEqual(self.build(datasets, metadata, starts+dt.timedelta(hours=8))["currentWeek"], 3)
        snapshot = self.build(datasets, metadata, starts+dt.timedelta(hours=8, seconds=1))
        self.assertEqual(snapshot["currentWeek"], 4)
        self.assertTrue(snapshot["weeks"]["4"]["recapContext"]["partialWeek"])
        self.assertNotIn(remaining["game_id"], [game["id"] for game in snapshot["weeks"]["4"]["recap"]])
        self.assertEqual((remaining["away_score"], remaining["home_score"]), ("", ""))

    def test_incomplete_score_pair_retains_release_window_without_making_final(self):
        datasets, metadata, starts, remaining = monday_boundary()
        remaining.update({"away_score": "10", "home_score": ""})
        snapshot = self.build(datasets, metadata, starts+dt.timedelta(minutes=1))
        self.assertEqual(snapshot["currentWeek"], 3)
        self.assertNotIn(remaining["game_id"], [game["id"] for game in snapshot["weeks"]["3"]["recap"]])

    def test_missing_kickoff_time_for_old_week_does_not_pin_forever(self):
        datasets, metadata, starts, remaining = monday_boundary()
        remaining["gametime"] = ""
        snapshot = self.build(datasets, metadata, starts+dt.timedelta(days=1))
        self.assertEqual(snapshot["currentWeek"], 4)
        self.assertNotIn(remaining["game_id"], [game["id"] for game in snapshot["weeks"]["4"]["recap"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
