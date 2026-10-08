"""Read-only refusal qualification for the changed-source release guard.

In-memory corruptions are test fixtures, not provider responses, browser data,
or current football claims. No runtime/evidence file is changed by these tests.
"""
import copy
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("source_equivalence", ROOT / "qa/team-details/verify-source-equivalence.py")
guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
RECEIPT = guard.load("qa/team-details/incoming-source/fbe4167-games-consumed-equivalence.json")
ORIGINAL = "qa/team-details/candidate-runtime-manifest.json"
PUBLISHED = "qa/team-details/published-runtime-manifest.json"


class RefusalQualification(unittest.TestCase):
    def run_guard(self, value=None):
        return guard.recompute(copy.deepcopy(RECEIPT if value is None else value), ORIGINAL, PUBLISHED)

    def test_actual_complete_bound_projection_passes(self):
        self.assertEqual(self.run_guard(), RECEIPT["recomputed"])

    def test_fabricated_equivalent_status_fails(self):
        value = copy.deepcopy(RECEIPT); value["scope"] = "all-sources-identical"
        with self.assertRaisesRegex(ValueError, "qualified equivalence"):
            self.run_guard(value)

    def test_other_source_identity_fails(self):
        value = copy.deepcopy(RECEIPT); value["sourceId"] = "nflverse_roster"
        with self.assertRaisesRegex(ValueError, "Only nflverse_games"):
            self.run_guard(value)

    def test_wrong_runtime_binding_fails(self):
        value = copy.deepcopy(RECEIPT); value["publishedRuntimeManifestSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "runtime bounds"):
            self.run_guard(value)

    def test_reversed_raw_pair_fails(self):
        value = copy.deepcopy(RECEIPT); value["rawSources"]["before"], value["rawSources"]["after"] = value["rawSources"]["after"], value["rawSources"]["before"]
        with self.assertRaisesRegex(ValueError, "Raw CSV pair differs"):
            self.run_guard(value)

    def test_other_real_raw_version_fails(self):
        value = copy.deepcopy(RECEIPT)
        value["rawSources"]["after"] = guard.load("qa/team-details/incoming-source/fd2253-games-consumed-equivalence.json")["rawSources"]["after"]
        with self.assertRaisesRegex(ValueError, "Raw CSV pair differs"):
            self.run_guard(value)

    def test_wrong_incoming_commit_fails(self):
        value = copy.deepcopy(RECEIPT); value["incomingCommit"] = "fd2253b528039ca2beb398f04975e14624a4d375"
        with self.assertRaisesRegex(ValueError, "exact classified incoming commit"):
            self.run_guard(value)

    def with_load_fixture(self, name, transform):
        original = guard.load
        def fixture(path):
            value = copy.deepcopy(original(path))
            if path == name:
                transform(value)
            return value
        return patch.object(guard, "load", fixture)

    def test_any_consumed_total_change_fails(self):
        def change(value):
            value["weeks"]["5"]["fixture"]["odds"]["total"] += 1
        with self.with_load_fixture("assets/data/current.json", change):
            with self.assertRaisesRegex(ValueError, "Published market differs"):
                self.run_guard()

    def test_any_derived_record_change_fails(self):
        def change(value):
            value["teams"]["DAL"]["record"]["w"] += 1
        with self.with_load_fixture("assets/data/team-details.json", change):
            with self.assertRaisesRegex(ValueError, "Published team record differs"):
                self.run_guard()

    def test_any_other_shared_source_change_fails(self):
        def change(value):
            next(source for source in value["sources"] if source["id"] == "nflverse_roster")["sha256"] = "0" * 64
        with self.with_load_fixture("assets/data/team-details.json", change):
            with self.assertRaisesRegex(ValueError, "Another shared source checksum differs"):
                self.run_guard()

    def test_any_nonmarket_raw_field_change_fails(self):
        original = guard.csv_rows; calls = 0
        def fixture(raw):
            nonlocal calls
            columns, rows, mapping = original(raw); calls += 1
            if calls == 2:
                mapping["2026_05_IND_PIT"]["stadium"] = "Fixture venue corruption"
            return columns, rows, mapping
        with patch.object(guard, "csv_rows", fixture):
            with self.assertRaisesRegex(ValueError, "nonmarket football/context/stat"):
                self.run_guard()


if __name__ == "__main__":
    unittest.main(verbosity=2)
