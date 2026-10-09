#!/usr/bin/env python3
"""Meaningful missing-data, starter, denominator and source integrity checks."""
import copy
import argparse
import csv
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("matchup_data_test", ROOT / "scripts/refresh-matchup-breakdown.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
DATA_BODY = (ROOT / "assets/data/matchup-breakdown.json").read_bytes()
DATA = json.loads(DATA_BODY)
SOURCE_MANIFEST = ROOT / "qa/matchup-breakdown/data/source-manifest.json"


def source_manifest(path=None):
    manifest = json.loads((path or SOURCE_MANIFEST).read_text())
    if manifest.get("snapshotSha256") != hashlib.sha256(DATA_BODY).hexdigest():
        raise AssertionError("Source manifest belongs to a different snapshot; generate fresh evidence for this build")
    return manifest


def source_rows(source_id):
    manifest = source_manifest()
    source = next(source for source in manifest["sources"] if source["id"] == source_id)
    if not source.get("bodyPath"):
        return []
    body = (ROOT / source["bodyPath"]).read_bytes()
    original = body if source["archiveEncoding"] == "original-gzip" else gzip.decompress(body)
    assert hashlib.sha256(original).hexdigest() == source["sha256"]
    return list(csv.DictReader(io.StringIO(original.decode("utf-8-sig"))))


def pbp_body(end=True, final_score=True, scramble=True, missing_field=None):
    fields = ["game_id", "posteam", "season_type", "play_type", "passer_player_id", "receiver_player_id",
              "rusher_player_id", "qb_dropback", "qb_hit", "qb_scramble", "qb_kneel", "sack", "yardline_100",
              "pass_attempt", "complete_pass", "pass_touchdown", "air_yards", "home_score", "away_score", "desc", "qtr",
              "game_seconds_remaining", "total_home_score", "total_away_score", "rush_attempt", "rushing_yards",
              "passing_yards", "two_point_attempt", "play_deleted"]
    if missing_field:
        fields.remove(missing_field)
    base = {key: "0" for key in fields}
    base.update(game_id="test", posteam="DAL", season_type="REG", home_score="7", away_score="0",
                qtr="1", game_seconds_remaining="800", total_home_score="0", total_away_score="0", desc="actual play")
    play = {**base, "play_type": "run", "rusher_player_id": "qb", "passer_player_id": "", "qb_dropback": "1",
            "qb_scramble": "1" if scramble else "0", "rush_attempt": "1", "rushing_yards": "11", "yardline_100": "15"}
    records = [play]
    if end:
        records.append({**base, "play_type": "no_play", "posteam": "", "desc": "END GAME", "qtr": "4",
                        "game_seconds_remaining": "0", "total_home_score": "7" if final_score else "6", "total_away_score": "0"})
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(records)
    return gzip.compress(output.getvalue().encode(), mtime=0)


class MatchupDataChecks(unittest.TestCase):
    def test_depth_injury_news_never_acquires_inferred_upcoming_week(self):
        body = json.dumps({"team": {"abbreviation": "DAL"}, "depthchart": [{"name": "Offense",
            "positions": {"lt": {"position": {"abbreviation": "LT"}, "athletes": [{"id": "4609048",
                "displayName": "Tyler Guyton", "injuries": [{"status": "Questionable", "date": "2026-10-09T03:22Z",
                "shortComment": "Exited Thursday's game against Tampa Bay due to a back injury."}]}]}}}]}).encode()
        _, news = builder.espn_depth(body, "DAL", {"4609048": "00-0039341"})
        original = copy.deepcopy(news)
        for upcoming_week in (5, 6, 7):
            weekly, bulletins = builder.qualify_injury_reports([], news)
            self.assertEqual(weekly, [], f"No source published NFL report for week {upcoming_week}")
            self.assertEqual(len(bulletins), 1)
            row = bulletins[0]
            for field in ("season", "week", "gameId"):
                self.assertIsNone(row[field])
            self.assertEqual(row["context"], "current-team-bulletin")
            self.assertEqual(row["gameApplicability"], "unavailable")
            self.assertEqual(row["reportStatus"], "Questionable")
            self.assertEqual(row["sourceTimestamp"], "2026-10-09T03:22Z")
            self.assertEqual(row["sourceIds"], ["espn_matchup_depth_DAL"])
            self.assertIn("Thursday", row["injury"])
        self.assertEqual(news, original)

    def test_actual_weekly_practice_survives_differently_scoped_depth_news(self):
        weekly = [{"playerId": "qb", "name": "Actual QB", "week": 6,
            "reportStatus": "Questionable", "practiceStatus": "Full Participation",
            "injury": "Thumb", "sourceIds": ["nflverse_injuries"]}]
        original = copy.deepcopy(weekly)
        news = [{"playerId": "qb", "name": "Actual QB", "reportStatus": "Out", "practiceStatus": None,
            "injury": "Different earlier bulletin", "sourceTimestamp": "2026-10-01T12:00Z",
            "sourceIds": ["espn_matchup_depth_DAL"]}]
        reports, bulletins = builder.qualify_injury_reports(weekly, news)
        self.assertEqual(reports, original)
        self.assertEqual(weekly, original)
        self.assertEqual(reports[0]["practiceStatus"], "Full Participation")
        self.assertEqual(reports[0]["sourceIds"], ["nflverse_injuries"])
        self.assertEqual(bulletins[0]["reportStatus"], "Out")
        self.assertIsNone(bulletins[0]["week"])
        report = {"week": 6, "availability": {"context": "current-team-bulletin"}}
        self.assertFalse(builder.bulletin_projection_unknown(report, 6, reports, {"qb"}))
        self.assertTrue(builder.bulletin_projection_unknown(report, 6, bulletins, {"qb"}))

    def test_event_report_is_scoped_partial_and_never_confirms_official_inactive_list(self):
        game = {"id": "test", "espnEventId": "123", "season": 2026, "week": 5, "home_team": "DAL", "away_team": "TB", "status": "scheduled"}
        value = {"header": {"id": "123", "season": {"year": 2026, "type": 2}, "week": 5,
            "competitions": [{"id": "123", "competitors": [
                {"homeAway": "home", "team": {"abbreviation": "DAL"}, "score": "0"},
                {"homeAway": "away", "team": {"abbreviation": "TB"}, "score": "0"}],
                "status": {"type": {"state": "in", "completed": False}}}]},
            "injuries": [{"team": {"abbreviation": "DAL"}, "injuries": [
                {"athlete": {"id": "one", "displayName": "Provider identity"}, "status": "Out",
                 "details": {"type": "Coach's Decision", "fantasyStatus": {"description": "INACTIVE"}}},
                {"athlete": {"id": "two"}, "status": "Questionable", "details": {}}]}]}
        source = {"id": "espn_fixture_summary_123", "status": "verified", "retrievedAt": "2026-10-09T00:20:00Z"}
        report = builder.fixture_report(game, "DAL", json.dumps(value).encode(), source, {"one": "gsis-one"})
        self.assertEqual(report["availability"]["players"][0]["playerId"], "gsis-one")
        self.assertTrue(report["availability"]["players"][0]["reportedInactive"])
        self.assertIsNone(report["availability"]["players"][1]["reportedInactive"])
        self.assertFalse(report["availability"]["completeOfficialList"])
        self.assertFalse(report["availability"]["players"][0]["officialConfirmed"])
        self.assertEqual(report["liveScore"]["home"], 0)
        self.assertFalse(report["liveScore"]["isFinal"])
        self.assertEqual(report["eventStatus"]["state"], "in")
        value["header"]["week"] = 6
        value["header"]["competitions"][0]["status"]["type"] = {"state": "pre", "completed": False}
        future = builder.fixture_report({**game, "week": 6}, "DAL", json.dumps(value).encode(), source, {}, current_week=5)
        self.assertEqual(future["availability"]["players"], [])
        self.assertIsNone(future["availability"]["currentTeamBulletin"][0]["reportedInactive"])
        self.assertIsNone(future["availability"]["currentTeamBulletin"][0]["gameId"])
        self.assertIsNone(future["availability"]["currentTeamBulletin"][0]["week"])
        self.assertEqual(future["availability"]["context"], "current-team-bulletin")
        with self.assertRaisesRegex(ValueError, "event/season/week/teams mismatch"):
            builder.fixture_report(game, "DAL", json.dumps(value).encode(), source, {})
        value["header"]["week"] = 5
        with self.assertRaisesRegex(ValueError, "partial game cannot enter final windows"):
            builder.fixture_report({**game, "status": "final"}, "DAL", json.dumps(value).encode(), source, {})

    def test_live_event_never_enters_completed_statistics_or_confirmed_starts(self):
        for team in DATA["teams"].values():
            for report in team.get("fixtureReports", {}).values():
                self.assertFalse(report["availability"]["completeOfficialList"])
                self.assertFalse(report["qbEvidence"]["confirmed"])
                if report["availability"]["context"] == "current-team-bulletin":
                    self.assertEqual(report["availability"]["players"], [])
                    self.assertFalse(report["qbEvidence"]["projected"])
                    self.assertIsNone(report["qbEvidence"]["playerId"])
                    for row in report["availability"]["currentTeamBulletin"]:
                        self.assertIsNone(row["reportedInactive"])
                        self.assertIsNone(row["week"])
                if report["eventStatus"]["completed"] is False:
                    for player in team["players"].values():
                        self.assertNotIn(report["gameId"], {row["gameId"] for row in player["gameLog"]})
                if report["eventStatus"]["state"] == "in" and report["eventStatus"]["completed"] is False:
                    self.assertEqual(team["researchGameId"], report["gameId"])
                    self.assertEqual(team["upcomingGameId"], report["gameId"])

    def test_advancing_week_does_not_reassign_archived_inactive_bulletin(self):
        # Immutable, real regression evidence; this past event is a fixture,
        # not an assertion about which players are current on a later build.
        archive = ROOT / "qa/matchup-breakdown/data/sources/espn_fixture_summary_401873007.source.gz"
        body = gzip.decompress(archive.read_bytes())
        self.assertEqual(hashlib.sha256(body).hexdigest(),
                         "7e1eec198475288951125174f360b10bc355d5ceeb2251206be00415da79c2e0")
        original = json.loads(body)
        self.assertTrue(any(row.get("date", "").startswith("2026-10-08")
                            for group in original["injuries"] for row in group["injuries"]))
        game = {"id": "2026_06_DAL_GB", "espnEventId": "401873007", "season": 2026,
                "week": 6, "home_team": "GB", "away_team": "DAL", "status": "scheduled"}
        source = {"id": "espn_fixture_summary_401873007", "status": "verified",
                  "retrievedAt": "2026-10-09T00:26:07Z"}
        for core_week in (5, 6, 7):
            report = builder.fixture_report(game, "DAL", body, source, {}, current_week=core_week)
            self.assertEqual(report["availability"]["players"], [])
            self.assertEqual(report["availability"]["context"], "current-team-bulletin")
            self.assertTrue(report["availability"]["currentTeamBulletin"])
            for row in report["availability"]["currentTeamBulletin"]:
                self.assertIsNone(row["reportedInactive"])
                self.assertIsNone(row["gameId"])
                self.assertIsNone(row["week"])
                self.assertFalse(row["officialConfirmed"])
            self.assertTrue(builder.bulletin_projection_unknown(report, core_week, [], {"qb"}))
        same_week = [{"week": 6, "playerId": "qb", "reportStatus": "Out", "sourceIds": ["nflverse_injuries"]}]
        self.assertFalse(builder.bulletin_projection_unknown(report, 6, same_week, {"qb"}))
        self.assertTrue(builder.bulletin_projection_unknown(report, 6,
            [{**same_week[0], "sourceIds": ["espn_matchup_depth_DAL"]}], {"qb"}))
        self.assertTrue(builder.bulletin_projection_unknown(report, 6,
            [{**same_week[0], "week": 5}], {"qb"}))

    def test_linked_snapshot_checksums_and_all_clubs(self):
        checks = builder.validate(DATA)
        self.assertEqual(checks["teams"], 32)
        self.assertGreater(checks["playerGameRows"], 7000)
        altered = {**DATA, "dependencies": {**DATA["dependencies"], "teamDetailsSha256": "0" * 64}}
        with self.assertRaisesRegex(AssertionError, "Team snapshot changed"):
            builder.validate(altered)

    def test_required_unverified_cache_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.csv"
            body = b"field\nvalue\n"
            path.write_bytes(body)
            path.with_suffix(".meta.json").write_text(json.dumps({"status": "verified", "url": "https://wrong.example/source.csv",
                "sha256": hashlib.sha256(body).hexdigest(), "httpStatus": 200, "retrievedAt": "2026-10-08T22:00:00Z"}))
            with self.assertRaisesRegex(RuntimeError, "prior snapshot retained"):
                builder.blob(("test", {"url": "https://example.test/legitimate.csv", "cache": "test.csv", "required": True}), directory)

    def test_optional_unverified_cache_explicit_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.csv"
            path.write_text("field\nvalue\n")
            source_id, body, metadata = builder.blob(("test", {"url": "https://example.test/legitimate.csv", "cache": "test.csv", "required": False}), directory)
            self.assertIsNone(body)
            self.assertEqual(metadata["status"], "unavailable")

    def test_truncated_pbp_with_static_final_scores_cannot_certify_zeroes(self):
        values, targets, coverage = builder.pbp_statistics(pbp_body(end=False), {"test": {"home_score": 7, "away_score": 0}})
        self.assertEqual(values, {})
        self.assertEqual(targets, {})
        self.assertEqual(coverage["status"], "unavailable")
        self.assertEqual(coverage["rejectedGames"], ["test"])

    def test_incorrect_evolving_final_score_refused(self):
        values, _, coverage = builder.pbp_statistics(pbp_body(final_score=False), {"test": {"home_score": 7, "away_score": 0}})
        self.assertEqual(values, {})
        self.assertEqual(coverage["status"], "unavailable")

    def test_missing_used_pbp_field_refused(self):
        values, _, coverage = builder.pbp_statistics(pbp_body(missing_field="rush_attempt"), {"test": {"home_score": 7, "away_score": 0}})
        self.assertEqual(values, {})
        self.assertEqual(coverage["status"], "unavailable")

    def test_scramble_rusher_id_is_in_dropback_denominator(self):
        values, _, coverage = builder.pbp_statistics(pbp_body(), {"test": {"home_score": 7, "away_score": 0}})
        self.assertEqual(coverage["status"], "verified")
        self.assertEqual(values["test"]["qb"]["scrambles"], 1)
        self.assertEqual(values["test"]["qb"]["scrambleYards"], 11)
        self.assertEqual(values["test"]["qb"]["dropbacks"], 1)
        self.assertEqual(values["test"]["qb"]["designedRuns"], 0)
        self.assertEqual(values["test"]["qb"]["redZoneRushAttempts"], 1)

    def test_missing_passing_cell_does_not_become_zero_or_rating(self):
        row = {field: "0" for field in builder.COUNT_FIELDS.values()}
        row.update(game_id="example", attempts="10", completions="5", passing_yards="")
        values = builder.normalize_stats(row)
        self.assertIsNone(values["passingYards"])
        self.assertIsNone(values["yardsPerAttempt"])
        self.assertIsNone(values["passerRating"])
        self.assertEqual(values["rushingYards"], 0)

    def test_relief_attempts_do_not_establish_a_start(self):
        entry = {"gameId": "example", "team": "TB", "stats": {"attempts": 99}, "sourceIds": ["nflverse_player_stats"]}
        game = {"example": {"home_team": "TB", "away_team": "DAL"}}
        raw = {"example": {"home_qb_id": "actual-starting-qb", "away_qb_id": "away-starting-qb"}}
        evidence = {"contradictions": [], "affirmativeFirstPlay": [], "unresolvedRoleRows": []}
        role = builder.starting_role("relief-qb", entry, raw, game, {}, {}, evidence)
        self.assertIs(role["value"], False)
        self.assertFalse(role["candidate"])
        self.assertEqual(role["status"], "verified")

    def test_projection_is_inferred_and_reported_out_is_not_confirmed_inactive(self):
        tampa = DATA["teams"]["TB"]
        self.assertFalse(tampa["qbEvidence"]["confirmed"])
        self.assertIn(tampa["qbEvidence"]["status"], {"inferred", "unavailable", "disputed"})
        if tampa["qbEvidence"]["playerId"]:
            self.assertFalse(any(row["playerId"] == tampa["qbEvidence"]["playerId"] and row.get("reportStatus") == "Out"
                                 for row in tampa["injuries"]["players"]))
        self.assertEqual(tampa["dataStatus"]["confirmedInactives"], "unavailable")

    def test_real_target_disagreement_nulls_only_affected_cell_and_rate(self):
        issues = [issue for issue in DATA["disagreements"] if issue.get("field") == "targets" and issue.get("gameId")]
        for issue in issues:
            player = DATA["teams"][issue["team"]]["players"].get(issue["playerId"])
            if not player:
                continue
            week = next(entry for entry in player["gameLog"] if entry["gameId"] == issue["gameId"])
            self.assertIsNone(week["stats"]["targets"])
            self.assertIsNone(week["advanced"]["targetShare"])
            self.assertGreaterEqual(len(issue["sourceIds"]), 2)

    def test_opponent_starts_include_actual_prior_seasons_and_no_padding(self):
        games = source_rows("nflverse_games")
        for team in DATA["teams"].values():
            for player in team["players"].values():
                if player["position"] != "QB":
                    continue
                opponent = player["weeklyOpponentHistory"]["opponent"]
                starts = [game for game in games if game["game_type"] == "REG" and game.get("home_score") and game.get("away_score")
                          and 2005 <= int(game["season"]) <= DATA["season"]
                          and (player["id"] == game.get("home_qb_id") and opponent == builder.refresh.canonical_team(game["away_team"])
                               or player["id"] == game.get("away_qb_id") and opponent == builder.refresh.canonical_team(game["home_team"]))]
                starts.sort(key=lambda game: (game["gameday"], game["game_id"]), reverse=True)
                candidates = {entry["gameId"] for entry in player["gameLog"] if entry["opponent"] == opponent and entry["started"].get("candidate")}
                for game in starts[:5]:
                    self.assertIn(game["game_id"], candidates, f"Missing real weekly-opponent role candidate for {player['name']}")

    def test_tracking_is_not_fabricated_or_hits_mislabelled_pressure(self):
        for team in DATA["teams"].values():
            for player in team["players"].values():
                for entry in player["gameLog"]:
                    self.assertIsNone(entry["advanced"]["routes"])
                    self.assertIsNone(entry["advanced"]["pressures"])
                    self.assertIsNone(entry["advanced"]["blitz"])
                    self.assertNotEqual(entry["appearance"]["status"], "dnp")

    def test_missing_statistics_do_not_substitute_older_qb_start(self):
        games = source_rows("nflverse_games")
        for team in DATA["teams"].values():
            for player in team["players"].values():
                if player["position"] != "QB":
                    continue
                starts = [game for game in games if game["game_type"] == "REG" and game.get("home_score") and game.get("away_score")
                          and int(game["season"]) >= 2005 and player["id"] in {game.get("home_qb_id"), game.get("away_qb_id")}]
                starts.sort(key=lambda game: (game["gameday"], game["game_id"]), reverse=True)
                actual = {entry["gameId"]: entry for entry in player["gameLog"] if entry["started"].get("candidate")}
                for game in starts[:5]:
                    self.assertIn(game["game_id"], actual, f"Missing source-designated candidate slot for {player['name']}")
        for gap in DATA["coverage"]["startingQBMissingStatistics"]:
            player = next(player for team in DATA["teams"].values() for player in team["players"].values() if player["id"] == gap["playerId"])
            entry = next(entry for entry in player["gameLog"] if entry["gameId"] == gap["gameId"])
            self.assertTrue(entry["started"]["candidate"])
            self.assertIn(entry["started"]["status"], {"verified", "disputed", "unavailable"})
            self.assertTrue(all(value is None for value in entry["stats"].values()))

    def test_direct_role_contradictions_null_both_candidates(self):
        evidence = builder.reviewed_role_evidence()
        active_disputes = {issue["gameId"] for issue in DATA["disagreements"] if issue.get("field") == "startingQuarterback"}
        for issue in evidence["contradictions"]:
            for player_id in (issue["primaryQBId"], issue["secondaryQBId"]):
                player = next((player for team in DATA["teams"].values() for player in team["players"].values() if player["id"] == player_id), None)
                if not player:
                    continue
                entry = next((entry for entry in player["gameLog"] if entry["gameId"] == issue["gameId"]), None)
                if issue["gameId"] not in active_disputes:
                    if entry:
                        self.assertEqual(entry["started"]["status"], "verified")
                        self.assertTrue(entry["started"].get("corroborated"))
                        self.assertEqual(entry["started"]["value"], player_id == issue["secondaryQBId"])
                    continue  # Genuine provider correction may remove an old non-start placeholder.
                self.assertIsNotNone(entry, f"Reviewed role candidate missing: {player_id}/{issue['gameId']}")
                self.assertTrue(entry["started"]["candidate"])
                self.assertEqual(entry["started"]["status"], "disputed")
                self.assertIsNone(entry["started"]["value"])
                self.assertEqual(entry["started"]["evidence"]["quote"], issue["quote"])
                self.assertIn(issue["sourceId"], entry["started"]["sourceIds"])

    def test_one_snap_first_play_role_keeps_null_statistics(self):
        player = next((player for team in DATA["teams"].values() for player in team["players"].values() if player["id"] == "00-0028986"), None)
        entry = next((entry for entry in (player or {}).get("gameLog", []) if entry["gameId"] == "2026_04_NYJ_CHI"), None)
        if not entry:
            self.skipTest("Historical first-play regression is outside this current roster/window")
        self.assertTrue(entry["started"]["value"])
        if entry["sourceIds"] == ["nflverse_games"]:
            self.assertTrue(entry["started"]["corroborated"])
            self.assertTrue(all(value is None for value in entry["stats"].values()))
        if entry["advanced"]["offensiveSnaps"] is not None:
            self.assertGreater(entry["advanced"]["offensiveSnaps"], 0)

    def test_uncorroborated_role_is_not_confirmed_or_padded(self):
        for issue in builder.reviewed_role_evidence()["unresolvedRoleRows"]:
            player = next((player for team in DATA["teams"].values() for player in team["players"].values() if player["id"] == issue["playerId"]), None)
            entry = next((entry for entry in (player or {}).get("gameLog", []) if entry["gameId"] == issue["gameId"]), None)
            if not entry or entry["sourceIds"] != ["nflverse_games"]:
                continue  # Role correction, roster move or genuinely published stats changed coverage.
            self.assertIsNone(entry["started"]["value"])
            self.assertEqual(entry["started"]["status"], "unavailable")
            self.assertTrue(entry["started"]["candidate"])
            self.assertIn(entry["gameId"], player["qbStartCoverage"]["unavailableGameIds"])

    def test_changed_quote_or_mismatched_event_cannot_establish_role(self):
        item = {"sourceId": "espn_start_summary_123", "gameId": "test", "quote": "explicit first play"}
        sources = {item["sourceId"]: {"status": "verified"}}
        bodies = {item["sourceId"]: json.dumps({"header": {"id": "123"}, "article": {"story": "different recap"}}).encode()}
        self.assertIsNone(builder.verified_role_quote(item, bodies, sources, {"test": {"espn": "123"}}))
        with self.assertRaisesRegex(ValueError, "scheduled event"):
            builder.verified_role_quote(item, bodies, sources, {"test": {"espn": "999"}})

    def test_source_correction_resolves_exact_html_recapped_role(self):
        item = {"sourceId": "espn_start_summary_123", "gameId": "test", "quote": "Secondary QB started in place of Primary QB.",
                "primaryQBId": "primary", "secondaryQBId": "secondary"}
        body = json.dumps({"header": {"id": "123"}, "article": {"published": "2026-10-01T00:00:00Z",
            "story": "Secondary <a href='/player/secondary'>QB</a> started in place of <a href='/player/primary'>Primary QB</a>."}}).encode()
        bodies = {item["sourceId"]: body}
        sources = {item["sourceId"]: {"status": "verified", "retrievedAt": "2026-10-08T22:00:00Z", "sha256": hashlib.sha256(body).hexdigest()}}
        raw = {"test": {"espn": "123", "home_qb_id": "primary", "away_qb_id": "away"}}
        game = {"test": {"home_team": "DAL", "away_team": "TB"}}
        evidence = {"contradictions": [item], "affirmativeFirstPlay": [], "unresolvedRoleRows": []}
        entry = {"gameId": "test", "team": "DAL", "sourceIds": ["nflverse_player_stats"]}
        for player_id in ("primary", "secondary"):
            role = builder.starting_role(player_id, entry, raw, game, bodies, sources, evidence)
            self.assertIsNone(role["value"])
            self.assertEqual(role["status"], "disputed")
            self.assertFalse(role["retainedEvidence"])
        raw["test"]["home_qb_id"] = "secondary"  # Actual primary-provider correction.
        primary = builder.starting_role("primary", entry, raw, game, bodies, sources, evidence)
        secondary = builder.starting_role("secondary", entry, raw, game, bodies, sources, evidence)
        self.assertFalse(primary["value"])
        self.assertTrue(secondary["value"])
        self.assertEqual(secondary["status"], "verified")
        self.assertTrue(secondary["corroborated"])

    def test_position_changed_receiver_keeps_known_zero_offensive_snaps(self):
        mapping = {row["pfr_id"]: row["gsis_id"] for row in source_rows("nflverse_player_ids") if row.get("pfr_id") and row.get("gsis_id")}
        for year in DATA["coverage"]["seasons"]:
            for raw in source_rows(f"nflverse_snaps_{year}"):
                if raw.get("game_type") != "REG" or raw.get("position") in builder.OFFENSE:
                    continue
                player_id = mapping.get(raw.get("pfr_player_id"))
                player = next((player for team in DATA["teams"].values() for player in team["players"].values() if player["id"] == player_id), None)
                entry = next((entry for entry in (player or {}).get("gameLog", []) if entry["gameId"] == raw["game_id"]), None)
                if entry:
                    self.assertEqual(entry["advanced"]["offensiveSnaps"], builder.num(raw.get("offense_snaps")))

    def test_injury_identity_merging_retains_published_practice(self):
        for raw in source_rows("nflverse_injuries"):
            team = DATA["teams"].get(raw.get("team"))
            if not team or raw.get("season") != str(DATA["season"]) or raw.get("week") != str(team["injuries"]["week"]) or not raw.get("gsis_id"):
                continue
            found = [row for row in team["injuries"]["players"] if row.get("playerId") == raw["gsis_id"]]
            self.assertEqual(len(found), 1, f"Duplicated stable injury identity {raw['team']}/{raw['gsis_id']}")
            self.assertEqual(found[0]["practiceStatus"], raw.get("practice_status") or None)
            self.assertIn("nflverse_injuries", found[0]["sourceIds"])
            if f"espn_matchup_depth_{raw['team']}" in found[0]["sourceIds"]:
                self.assertIn("nflverse_player_ids", found[0]["identitySourceIds"])

    def test_audit_archives_reproduce_source_response_hashes(self):
        manifest = source_manifest()
        for source in manifest["sources"]:
            if not source.get("bodyPath"):
                continue
            body = (ROOT / source["bodyPath"]).read_bytes()
            self.assertEqual(hashlib.sha256(body).hexdigest(), source["archiveSha256"])
            original = body if source["archiveEncoding"] == "original-gzip" else gzip.decompress(body)
            self.assertEqual(hashlib.sha256(original).hexdigest(), source["sha256"])
            self.assertEqual(source["httpStatus"], 200)
            self.assertTrue(source["retrievedAt"])

    def test_stale_manifest_refused_before_source_assertions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stale-source-manifest.json"
            path.write_text(json.dumps({**source_manifest(), "snapshotSha256": "0" * 64}))
            with self.assertRaisesRegex(AssertionError, "different snapshot"):
                source_manifest(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-manifest", type=Path, default=SOURCE_MANIFEST,
                        help="Fresh manifest emitted by this build's --evidence-dir; default is the checked release evidence")
    SOURCE_MANIFEST = parser.parse_args().source_manifest.resolve()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(MatchupDataChecks))
    raise SystemExit(0 if result.wasSuccessful() else 1)
