"""Behavior checks using wholly synthetic records, never official source data."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/compare-nfl-standings.py"
SPEC = importlib.util.spec_from_file_location("official_compare", SCRIPT)
COMPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COMPARE)
NOW = dt.datetime(2026, 10, 13, 3, 30, tzinfo=dt.timezone.utc)
STAMP = "2026-10-13T03:00:00Z"
# Independent synthetic team identities; these rows do not copy app statistics.
AFC = "BAL BUF CIN CLE DEN HOU IND JAX KC LAC LV MIA NE NYJ PIT TEN".split()
NFC = "ARI ATL CAR CHI DAL DET GB LA MIN NO NYG PHI SEA SF TB WAS".split()


def fixtures(stamp=STAMP):
    rows = []
    for conference, abbreviations, wins, losses, pct in [
            ("AFC", AFC, 2, 3, "0.400"), ("NFC", NFC, 3, 2, "0.600")]:
        rows.extend({"abbr": abbr, "conference": conference, "w": wins, "l": losses,
                     "ties": 0, "pct": pct, "pointsFor": 100, "pointsAgainst": 100}
                    for abbr in abbreviations)
    snapshot = {"schemaVersion": 1, "season": 2026, "currentWeek": 5,
                "throughWeek": 5, "retrievedAt": stamp,
                "teams": [{"abbr": row["abbr"], "conference": row["conference"]} for row in rows],
                "weeks": {"5": {"throughWeek": 5, "conferences": {
                    "AFC": copy.deepcopy(rows[:16]), "NFC": copy.deepcopy(rows[16:])}}},
                "provenance": {"standings": {"sourceIds": ["synthetic_primary_scores"]}}}
    official = {"schemaVersion": 1, "season": 2026, "seasonType": "REG",
                "teams": copy.deepcopy(rows), "conferenceOrder": {"AFC": AFC[:], "NFC": NFC[:]},
                "source": {"url": "https://www.nfl.com/standings/conference/2026/REG",
                           "retrievedAt": stamp, "sha256": "a" * 64,
                           "scopeBasis": "page-content", "httpStatus": 200, "bytes": 1000}}
    return snapshot, official


class ComparisonTests(unittest.TestCase):
    def compare(self, snapshot, official):
        return COMPARE.compare_snapshot(snapshot, official, now=NOW)

    def test_matching_records_and_optional_numeric_fields_pass_without_retrieval_claim(self):
        snapshot, official = fixtures()
        before = copy.deepcopy((snapshot, official))
        result = self.compare(snapshot, official)
        self.assertEqual(result["status"], "match")
        self.assertEqual(result["differences"], [])
        self.assertEqual(result["comparedFields"], {field: 32 for field in
                                                  ("w", "l", "ties", "pct", "pointsFor", "pointsAgainst")})
        self.assertIn("not proof of genuine official retrieval", result["verificationClaim"])
        self.assertEqual((snapshot, official), before)

    def test_numeric_record_disagreement_keeps_both_readings_and_no_arbitrary_selection(self):
        snapshot, official = fixtures()
        official["teams"][0]["w"] = 3
        official["teams"][0]["l"] = 2
        official["teams"][0]["pct"] = "0.600"
        result = self.compare(snapshot, official)
        self.assertEqual(result["status"], "mismatch")
        self.assertIn({"team": "BAL", "field": "w", "official": 3, "primary": 2}, result["differences"])
        self.assertIn({"team": "BAL", "field": "l", "official": 2, "primary": 3}, result["differences"])
        self.assertEqual(snapshot["weeks"]["5"]["conferences"]["AFC"][0]["w"], 2)

    def test_official_tied_team_order_does_not_fail_records_or_claim_playoff_seeds(self):
        snapshot, official = fixtures()
        official["conferenceOrder"]["AFC"][0:2] = ["BUF", "BAL"]
        result = self.compare(snapshot, official)
        self.assertEqual(result["status"], "match")
        self.assertTrue(result["orderDifferences"][0]["onlyWithinEqualPercentageGroups"])
        self.assertEqual(result["orderDifferences"][0]["officialRowOrder"][:2], ["BUF", "BAL"])
        self.assertIn("neither is asserted to be playoff seeding", result["orderDifferences"][0]["note"])

    def test_current_snapshot_is_used_instead_of_pinned_historical_rows(self):
        snapshot, official = fixtures()
        snapshot["weeks"]["4"] = copy.deepcopy(snapshot["weeks"]["5"])
        snapshot["weeks"]["4"]["throughWeek"] = 3
        snapshot["weeks"]["4"]["conferences"]["AFC"][0].update(w=1, l=2, pct="0.333")
        result = self.compare(snapshot, official)
        self.assertEqual(result["status"], "match")
        self.assertEqual(result["throughWeek"], 5)

    def test_missing_optional_statistics_are_not_zero_or_derived_official_values(self):
        snapshot, official = fixtures()
        official["teams"][0]["pointsFor"] = None
        del official["teams"][0]["pointsAgainst"]
        official["teams"][0]["pct"] = None
        result = self.compare(snapshot, official)
        self.assertEqual(result["status"], "match")
        self.assertEqual(result["comparedFields"]["pointsFor"], 31)
        self.assertEqual(result["comparedFields"]["pointsAgainst"], 31)
        self.assertEqual(result["comparedFields"]["pct"], 31)
        official["teams"][0]["pointsFor"] = 0
        self.assertIn({"team": "BAL", "field": "pointsFor", "official": 0, "primary": 100},
                      self.compare(snapshot, official)["differences"])

    def test_ties_and_three_decimal_rounding_are_compared_correctly(self):
        snapshot, official = fixtures()
        for rows in (snapshot["weeks"]["5"]["conferences"]["AFC"], official["teams"]):
            rows[0].update(w=1, l=1, ties=1, pct="0.500")
            rows[1].update(w=2, l=1, ties=0, pct="0.667")
        self.assertEqual(self.compare(snapshot, official)["status"], "match")
        official["teams"][0]["pct"] = "0.333"
        self.assertIn({"team": "BAL", "field": "pct", "official": "0.333", "primary": "0.500"},
                      self.compare(snapshot, official)["differences"])

    def test_zero_game_percentage_is_valid_and_malformed_percentages_rejected(self):
        snapshot, official = fixtures()
        for rows in (snapshot["weeks"]["5"]["conferences"]["AFC"], official["teams"]):
            rows[0].update(w=0, l=0, ties=0, pct=".000")
        self.assertEqual(self.compare(snapshot, official)["status"], "match")
        for invalid in ("NaN", "Infinity", float("nan"), "80%", -0.1, 1.1, True, []):
            with self.subTest(invalid=invalid):
                candidate = copy.deepcopy(official)
                candidate["teams"][0]["pct"] = invalid
                with self.assertRaises(COMPARE.InvalidStandings):
                    self.compare(snapshot, candidate)

    def test_source_scope_url_and_hash_fail_closed(self):
        snapshot, official = fixtures()
        changes = [("season", 2025), ("seasonType", "PRE"), ("schemaVersion", True)]
        for key, value in changes:
            with self.subTest(key=key):
                candidate = copy.deepcopy(official)
                candidate[key] = value
                with self.assertRaises(COMPARE.InvalidStandings):
                    self.compare(snapshot, candidate)
        source_changes = [("url", "https://www.nfl.com/standings/"),
                          ("url", "https://www.nfl.com/standings/conference/2025/REG"),
                          ("url", "https://www.nfl.com.example.org/standings/conference/2026/REG"),
                          ("scopeBasis", "requested-url-only"), ("sha256", "unknown"),
                          ("httpStatus", 403), ("bytes", 0),
                          ("finalUrl", "https://www.nfl.com/standings/")]
        for key, value in source_changes:
            with self.subTest(source_field=key, value=value):
                candidate = copy.deepcopy(official)
                candidate["source"][key] = value
                with self.assertRaises(COMPARE.InvalidStandings):
                    self.compare(snapshot, candidate)

    def test_source_clocks_reject_naive_future_stale_and_missing_metadata(self):
        snapshot, official = fixtures()
        for stamp in (None, "today", "2026-10-13T03:00:00", "2026-10-14T03:00:00Z", "2026-10-11T03:00:00Z"):
            with self.subTest(stamp=stamp):
                candidate = copy.deepcopy(official)
                candidate["source"]["retrievedAt"] = stamp
                with self.assertRaises(COMPARE.InvalidStandings):
                    self.compare(snapshot, candidate)
        official["source"]["retrievedAt"] = "2026-10-13T14:00:00+11:00"
        self.assertEqual(self.compare(snapshot, official)["status"], "match")

    def test_exact_team_set_and_conferences_are_required(self):
        snapshot, official = fixtures()
        variants = []
        candidate = copy.deepcopy(official); candidate["teams"].pop(); variants.append(candidate)
        candidate = copy.deepcopy(official); candidate["teams"][1] = copy.deepcopy(candidate["teams"][0]); variants.append(candidate)
        candidate = copy.deepcopy(official); candidate["teams"][0]["abbr"] = "UNKNOWN"; variants.append(candidate)
        candidate = copy.deepcopy(official); candidate["teams"][0]["conference"] = "NFC"; variants.append(candidate)
        candidate = copy.deepcopy(official); candidate["conferenceOrder"]["AFC"][0] = "DAL"; variants.append(candidate)
        candidate = copy.deepcopy(official); candidate["conferenceOrder"]["AFC"][1] = "BAL"; variants.append(candidate)
        for candidate in variants:
            with self.assertRaises(COMPARE.InvalidStandings):
                self.compare(snapshot, candidate)

    def test_nonnegative_integer_wlt_and_points_reject_bool_fraction_and_missing(self):
        snapshot, official = fixtures()
        for field in ("w", "l", "ties", "pointsFor", "pointsAgainst"):
            for value in (-1, 1.5, True, "3"):
                with self.subTest(field=field, value=value):
                    candidate = copy.deepcopy(official)
                    candidate["teams"][0][field] = value
                    with self.assertRaises(COMPARE.InvalidStandings):
                        self.compare(snapshot, candidate)
        del official["teams"][0]["ties"]
        with self.assertRaises(COMPARE.InvalidStandings):
            self.compare(snapshot, official)

    def test_current_snapshot_bad_coverage_or_team_definition_fails_closed(self):
        snapshot, official = fixtures()
        for mutation in (lambda data: data.update(weeks=None),
                         lambda data: data.update(currentWeek=4),
                         lambda data: data["weeks"]["5"].update(throughWeek=4),
                         lambda data: data["teams"][0].update(conference="NFC"),
                         lambda data: data.update(provenance=None)):
            candidate = copy.deepcopy(snapshot)
            mutation(candidate)
            with self.assertRaises(COMPARE.InvalidStandings):
                self.compare(candidate, official)

    def test_current_row_coverage_rejects_float_bool_or_missing_week(self):
        snapshot, official = fixtures()
        for invalid in (5.0, True, None):
            with self.subTest(through_week=invalid):
                candidate = copy.deepcopy(snapshot)
                candidate["weeks"]["5"]["throughWeek"] = invalid
                with self.assertRaises(COMPARE.InvalidStandings):
                    self.compare(candidate, official)

    def test_impossible_regular_season_game_counts_fail_for_either_provider(self):
        snapshot, official = fixtures()
        for provider in ("primary", "official"):
            with self.subTest(provider=provider):
                primary, source = copy.deepcopy(snapshot), copy.deepcopy(official)
                rows = primary["weeks"]["5"]["conferences"]["AFC"] if provider == "primary" else source["teams"]
                rows[0].update(w=18, l=0, ties=0, pct="1.000")
                with self.assertRaises(COMPARE.InvalidStandings):
                    self.compare(primary, source)

    def run_cli(self, snapshot, official, extra=None):
        with tempfile.TemporaryDirectory(prefix="pd-official-comparison-test-") as directory:
            base = Path(directory)
            source_path, snapshot_path, output_path = base / "official.json", base / "snapshot.json", base / "result.json"
            source_path.write_text(json.dumps(official)); snapshot_path.write_text(json.dumps(snapshot))
            before = (source_path.read_bytes(), snapshot_path.read_bytes())
            result = subprocess.run([sys.executable, str(SCRIPT), "--official", str(source_path),
                                     "--snapshot", str(snapshot_path), "--output", str(output_path), *(extra or [])],
                                    capture_output=True, text=True)
            self.assertEqual((source_path.read_bytes(), snapshot_path.read_bytes()), before)
            self.assertEqual(json.loads(result.stdout), json.loads(output_path.read_text()))
            return result.returncode, json.loads(result.stdout)

    def test_real_cli_returns_zero_one_two_and_saves_same_receipt_without_mutation(self):
        stamp = dt.datetime.now(dt.timezone.utc).isoformat()
        snapshot, official = fixtures(stamp)
        self.assertEqual(self.run_cli(snapshot, official)[0], 0)
        official["teams"][0]["pointsFor"] = 101
        status, report = self.run_cli(snapshot, official)
        self.assertEqual(status, 1)
        self.assertEqual(report["status"], "mismatch")
        self.assertIn("inputSha256", report)
        official["teams"].pop()
        self.assertEqual(self.run_cli(snapshot, official)[0], 2)

    def test_real_cli_missing_source_file_returns_nonzero_json_not_a_pass(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--official", "/tmp/pd-no-such-normalized-official-source.json"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)["status"], "invalid")


if __name__ == "__main__":
    unittest.main()
