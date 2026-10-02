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
    row = {field: "0" for field in {**REFRESH.STAT_FIELDS, **REFRESH.EXTRA_COUNT_FIELDS, **REFRESH.EXTRA_GAME_FIELDS}.values()}
    row.update({"season": "2026", "season_type": "REG", "week": str(week), "game_id": game_id,
                "team": team, "opponent_team": opponent, "player_id": f"test-{team}-{position}",
                "position": position, "player_display_name": f"Test {team} {position}", "player_name": f"T.{team}"})
    row.update({"attempts": "10", "completions": "5", "passing_yards": str(yards)})
    return row


def history_fixtures():
    datasets, metadata, now = fixtures()
    ids = "test-PIT-QB"
    archived = []
    for index, (year, week, opponent, team) in enumerate([(2025, 18, "CLE", "NYJ"), (2025, 17, "ATL", "NYJ"),
                                                       (2025, 16, "CLE", "GB"), (2024, 18, "CLE", "GB"),
                                                       (2023, 18, "CLE", "GB"), (2022, 18, "CLE", "GB")]):
        date = f"{year + 1}-01-{20 - index:02d}"
        game_id = f"{year}_{week:02d}_{team}_{opponent}"
        datasets["nflverse_games"].append({"game_id": game_id, "season": str(year), "week": str(week),
                                          "game_type": "REG", "gameday": date, "gametime": "13:00",
                                          "away_team": team, "home_team": opponent, "away_score": "21", "home_score": "10"})
        row = stat(team, opponent, game_id, week, yards=100 + index)
        row.update({"season": str(year), "player_id": ids, "rushing_yards": str(20 + index),
                    "receiving_yards": str(30 + index), "passing_tds": "2", "rushing_tds": "1", "receiving_tds": "1"})
        archived.append(row)
    for row in archived:
        source_id = f'nflverse_player_stats_{row["season"]}'
        datasets.setdefault(source_id, []).append(row)
        metadata[source_id] = {**metadata["nflverse_player_stats"], "id": source_id, "required": False,
                               "retrievedAt": "2026-09-01T00:00:00Z"}
    current_row = stat("PIT", "ATL", "2026_01_ATL_PIT", 1, yards=200)
    datasets["nflverse_player_stats"] = [current_row]
    return datasets, metadata, now


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


class PlayerHistoryTests(unittest.TestCase):
    def history(self, datasets=None, metadata=None, now=None, cached=None):
        if datasets is None:
            datasets, metadata, now = history_fixtures()
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        return REFRESH.build_player_history(snapshot["roster"], snapshot["steelers"]["schedule"],
                                            datasets, metadata, now, 2026, cached), snapshot

    def test_cross_season_order_prior_club_and_full_stat_values(self):
        history, snapshot = self.history()
        REFRESH.validate_history(history, snapshot)
        player = history["players"]["test-PIT-QB"]
        self.assertEqual(len(player["last5"]), 5)
        games = [player["games"][game_id] for game_id in player["last5"]]
        self.assertEqual([game["season"] for game in games], [2026, 2025, 2025, 2025, 2024])
        self.assertEqual(games[1]["team"], "NYJ")
        self.assertEqual((games[1]["stats"]["rushingYards"], games[1]["stats"]["receivingYards"]), (20, 30))
        self.assertEqual((games[1]["stats"]["passingTD"], games[1]["stats"]["rushingTD"], games[1]["stats"]["receivingTD"]), (2, 1, 1))
        self.assertEqual(games[1]["rawStats"]["rushing_yards"], 20)
        self.assertEqual((games[1]["homeAway"], games[1]["result"], games[1]["teamScore"]), ("away", "W", 21))
        self.assertEqual(games[1]["retrievedAt"], "2026-09-01T00:00:00Z")
        self.assertEqual(len(snapshot["roster"][0]["last5"]), 1)  # Season-only contract preserved.

    def test_opponent_filter_identity_and_postseason_exclusion(self):
        datasets, metadata, now = history_fixtures()
        wrong_id = copy.deepcopy(datasets["nflverse_player_stats_2025"][0])
        wrong_id["player_id"] = "same-name-different-GSIS"
        wrong_id["passing_yards"] = "999"
        datasets["nflverse_player_stats_2025"].append(wrong_id)
        postseason = copy.deepcopy(datasets["nflverse_player_stats_2025"][0])
        postseason.update({"season_type": "POST", "game_id": "2025_POST_NYJ_CLE", "week": "19"})
        datasets["nflverse_player_stats_2025"].append(postseason)
        history, _ = self.history(datasets, metadata, now)
        player = history["players"]["test-PIT-QB"]
        games = [player["games"][game_id] for game_id in player["byOpponent"]["CLE"]["gameIds"]]
        self.assertEqual(len(games), 5)
        self.assertTrue(all(game["opponent"] == "CLE" and game["playerId"] == "test-PIT-QB" for game in games))
        self.assertFalse(any(game["stats"]["passingYards"] == 999 or game["seasonType"] == "POST" for game in player["games"].values()))
        self.assertEqual([game["season"] for game in games], [2025, 2025, 2024, 2023, 2022])

    def test_missing_archive_and_missing_cell_stay_explicit(self):
        datasets, metadata, now = history_fixtures()
        datasets["nflverse_player_stats_2025"][0]["rushing_yards"] = ""
        metadata["nflverse_player_stats_2024"].update({"status": "unavailable", "error": "test source blocked"})
        datasets["nflverse_player_stats_2024"] = []
        history, _ = self.history(datasets, metadata, now)
        player = history["players"]["test-PIT-QB"]
        self.assertIn(2024, history["coverage"]["unavailableSeasons"])
        self.assertEqual(player["byOpponent"]["CLE"]["status"], "partial")
        self.assertIn("cannot be guaranteed", player["byOpponent"]["CLE"]["note"])
        self.assertIsNone(player["games"]["2025_18_NYJ_CLE"]["stats"]["rushingYards"])
        self.assertEqual(player["games"]["2025_18_NYJ_CLE"]["stats"]["rushingTD"], 1)
        self.assertEqual(len(player["byOpponent"]["CLE"]["gameIds"]), 4)

    def test_unfinalized_or_identity_disagreement_excluded(self):
        datasets, metadata, now = history_fixtures()
        datasets["nflverse_player_stats_2025"][0]["opponent_team"] = "SEA"
        for game in datasets["nflverse_games"]:
            if game["game_id"] == "2025_16_GB_CLE":
                game["home_score"] = ""
        history, _ = self.history(datasets, metadata, now)
        games = history["players"]["test-PIT-QB"]["games"]
        self.assertNotIn("2025_18_NYJ_CLE", games)
        self.assertNotIn("2025_16_GB_CLE", games)
        self.assertEqual(len(history["disagreements"]), 2)

    def test_cached_archives_reused_and_new_current_statistics_replace(self):
        datasets, metadata, now = history_fixtures()
        history, _ = self.history(datasets, metadata, now)
        current_only = {key: value for key, value in datasets.items() if not key.startswith("nflverse_player_stats_")}
        current_metadata = {key: value for key, value in metadata.items() if not key.startswith("nflverse_player_stats_")}
        current_only["nflverse_player_stats"][0]["passing_yards"] = "222"
        newer, snapshot = self.history(current_only, current_metadata, now, history)
        REFRESH.validate_history(newer, snapshot)
        self.assertEqual(newer["players"]["test-PIT-QB"]["games"]["2026_01_ATL_PIT"]["stats"]["passingYards"], 222)
        old_id = "2025_18_NYJ_CLE"
        self.assertEqual(newer["players"]["test-PIT-QB"]["games"][old_id], history["players"]["test-PIT-QB"]["games"][old_id])
        bad = copy.deepcopy(snapshot)
        bad["sources"][0]["sha256"] = "changed-schedule-version"
        with self.assertRaisesRegex(AssertionError, "source versions disagree"):
            REFRESH.validate_history(newer, bad)

    def test_every_scheduled_opponent_has_own_matchup_context(self):
        _, snapshot = self.history()
        research = snapshot["steelers"]["matchupsByOpponent"]
        self.assertEqual(set(research), {"ATL", "CLE"})
        self.assertEqual(research["ATL"]["opponent"], "ATL")
        self.assertEqual(research["CLE"]["opponent"], "CLE")
        self.assertNotEqual(research["ATL"]["last5"], research["CLE"]["last5"])
        self.assertEqual(research["ATL"]["context"]["season"], 2026)
        self.assertIn("not a reconstruction", research["ATL"]["context"]["note"])

    def test_cached_history_rejoins_corrected_and_withdrawn_final_schedule(self):
        datasets, metadata, now = history_fixtures()
        previous, _ = self.history(datasets, metadata, now)
        current_only = {key: value for key, value in datasets.items() if not key.startswith("nflverse_player_stats_")}
        current_metadata = {key: value for key, value in metadata.items() if not key.startswith("nflverse_player_stats_")}
        for game in current_only["nflverse_games"]:
            if game["game_id"] == "2025_18_NYJ_CLE":
                game["home_score"] = "30"
                game["gameday"] = "2026-01-21"
            if game["game_id"] == "2025_16_GB_CLE":
                game["home_score"] = ""
        current_metadata["nflverse_games"]["retrievedAt"] = "2026-09-21T12:01:00Z"
        refreshed, _ = self.history(current_only, current_metadata, now, previous)
        player = refreshed["players"]["test-PIT-QB"]
        corrected = player["games"]["2025_18_NYJ_CLE"]
        self.assertEqual((corrected["result"], corrected["opponentScore"], corrected["date"]), ("L", 30, "2026-01-21"))
        self.assertEqual(corrected["retrievedAt"], "2026-09-01T00:00:00Z")
        self.assertEqual(corrected["scheduleRetrievedAt"], "2026-09-21T12:01:00Z")
        self.assertNotIn("2025_16_GB_CLE", player["games"])
        self.assertEqual(player["status"], "partial")
        self.assertIn("backfill", player["note"])

    def test_franchise_alias_preserves_original_team_and_opponent_label(self):
        datasets, metadata, now = history_fixtures()
        datasets["nflverse_games"].append({"game_id": "2015_15_SD_LA", "season": "2015", "week": "15",
                                          "game_type": "REG", "gameday": "2015-12-20", "gametime": "13:00",
                                          "away_team": "SD", "home_team": "LA", "away_score": "0", "home_score": "3"})
        row = stat("SD", "STL", "2015_15_SD_LA", 15, yards=90)
        row.update({"season": "2015", "player_id": "test-PIT-QB"})
        datasets["nflverse_player_stats_2015"] = [row]
        metadata["nflverse_player_stats_2015"] = {**metadata["nflverse_player_stats"], "id": "nflverse_player_stats_2015", "required": False}
        snapshot = REFRESH.build_snapshot(datasets, metadata, now, 2026)
        schedule = snapshot["steelers"]["schedule"] + [{"away_team": "PIT", "home_team": "LA"}]
        history = REFRESH.build_player_history(snapshot["roster"], schedule, datasets, metadata, now, 2026)
        player = history["players"]["test-PIT-QB"]
        game = player["games"][player["byOpponent"]["LA"]["gameIds"][0]]
        self.assertEqual((game["team"], game["teamCanonical"], game["opponent"], game["opponentSourceAbbr"]), ("SD", "LAC", "LA", "STL"))
        self.assertEqual((game["result"], game["teamScore"]), ("L", 0))

    def test_conflicting_duplicate_excludes_both_statistical_rows(self):
        datasets, metadata, now = history_fixtures()
        duplicate = copy.deepcopy(datasets["nflverse_player_stats_2025"][0])
        duplicate["passing_yards"] = "999"
        datasets["nflverse_player_stats_2025"].append(duplicate)
        history, _ = self.history(datasets, metadata, now)
        self.assertNotIn(duplicate["game_id"], history["players"]["test-PIT-QB"]["games"])
        self.assertIn("Conflicting duplicated", history["disagreements"][0]["issue"])

    def test_no_statistical_rows_is_unavailable_and_never_padded(self):
        datasets, metadata, now = fixtures()
        for year in range(REFRESH.HISTORY_FIRST_SEASON, 2026):
            source_id = f"nflverse_player_stats_{year}"
            metadata[source_id] = {**metadata["nflverse_player_stats"], "id": source_id, "required": False}
            datasets[source_id] = []  # Source can contain only other GSIS IDs.
        history, _ = self.history(datasets, metadata, now)
        player = history["players"]["test-PIT-QB"]
        self.assertEqual(history["coverage"]["status"], "verified")
        self.assertEqual(player["status"], "unavailable")
        self.assertEqual(player["last5"], [])
        self.assertEqual(player["games"], {})
        self.assertTrue(all(entry["status"] == "unavailable" and entry["gameIds"] == [] for entry in player["byOpponent"].values()))
        self.assertIn("absence is not proof", player["note"])


if __name__ == "__main__":
    unittest.main()
