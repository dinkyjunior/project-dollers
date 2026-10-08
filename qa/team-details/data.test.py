#!/usr/bin/env python3
"""Data-integrity tests, including independent raw-CSV arithmetic when cached.

python3 qa/team-details/data.test.py --cache-dir /path/to/source-cache
The saved-data tests run without network access; fixture values never enter UI data.
"""
import argparse
import collections
import csv
import datetime as dt
from decimal import Decimal
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("pd_team_builder", ROOT / "scripts/refresh-team-details.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--cache-dir")
ARGS, REMAINING = parser.parse_known_args()
CACHE = Path(ARGS.cache_dir) if ARGS.cache_dir else None


class SnapshotIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "assets/data/team-details.json").read_text())
        cls.sources = {s["id"]: s for s in cls.data["sources"]}

    def test_every_team_and_every_copied_game_is_consistent(self):
        self.assertEqual(32, len(self.data["teams"]))
        indexed = {}
        copies = collections.Counter()
        for abbr, team in self.data["teams"].items():
            self.assertEqual(abbr, team["abbr"])
            for game in team["games"]:
                self.assertIn(abbr, (game["away_team"], game["home_team"]))
                self.assertEqual("REG", game["seasonType"])
                self.assertIn(game["season"], self.data["coverage"]["seasons"])
                if game["id"] in indexed:
                    self.assertEqual(indexed[game["id"]], game, game["id"])
                indexed[game["id"]] = game
                copies[game["id"]] += 1
        self.assertTrue(indexed)
        self.assertTrue(all(n == 2 for n in copies.values()))

    def test_records_recompute_from_all_current_final_scores(self):
        for abbr, team in self.data["teams"].items():
            results, own_scores, opponent_scores = [], [], []
            for game in sorted(team["games"], key=lambda g: (g["gameday"], g["id"])):
                if game["season"] != self.data["season"] or game["status"] != "final":
                    continue
                home = game["home_team"] == abbr
                own, opponent = (game["home_score"], game["away_score"]) if home else (game["away_score"], game["home_score"])
                results.append("W" if own > opponent else "L" if own < opponent else "T")
                own_scores.append(own); opponent_scores.append(opponent)
            record = team["record"]
            self.assertEqual((results.count("W"), results.count("L"), results.count("T")), (record["w"], record["l"], record["ties"]), abbr)
            self.assertEqual(len(results), record["games"])
            self.assertEqual(results[-5:], record["form"])
            self.assertEqual(sum(own_scores) if results else None, record["pointsFor"])
            self.assertEqual(sum(opponent_scores) if results else None, record["pointsAgainst"])

    def test_sources_and_factual_retrieval_time(self):
        verified = [s for s in self.sources.values() if s["status"] == "verified"]
        self.assertEqual(min(s["retrievedAt"] for s in verified), self.data["retrievedAt"])
        for source in verified:
            self.assertTrue(source["url"].startswith("https://"))
            self.assertRegex(source["sha256"], r"^[0-9a-f]{64}$")
            self.assertGreater(source["bytes"], 0)
            self.assertLessEqual(source["retrievedAt"], self.data["generatedAt"])
        if CACHE:
            for path in CACHE.glob("*.meta.json"):
                metadata = json.loads(path.read_text())
                body_path = path.with_name(path.name.removesuffix(".meta.json") + (".json" if path.name.startswith("espn-") else ".csv"))
                if body_path.exists() and metadata.get("sha256"):
                    self.assertEqual(metadata["sha256"], hashlib.sha256(body_path.read_bytes()).hexdigest(), path.name)

    def test_no_future_completed_games_or_missing_value_zero_fills(self):
        generated = dt.datetime.fromisoformat(self.data["generatedAt"].replace("Z", "+00:00"))
        for team in self.data["teams"].values():
            for game in team["games"]:
                if game["status"] == "final":
                    self.assertIsNotNone(game["home_score"])
                    self.assertIsNotNone(game["away_score"])
                    if game["kickoffUtc"]:
                        self.assertLessEqual(dt.datetime.fromisoformat(game["kickoffUtc"].replace("Z", "+00:00")), generated)
                else:
                    self.assertIsNone(game["home_score"])
                    self.assertIsNone(game["away_score"])
                    self.assertFalse(game["stats"])

    def test_metric_provenance_efficiency_ranges_and_net_yards(self):
        for team in self.data["teams"].values():
            for game in team["games"]:
                for abbr, stats in game["stats"].items():
                    evidence = game["statsProvenance"][abbr]
                    for name, value in stats.items():
                        if value is not None:
                            self.assertTrue(evidence["fieldSources"].get(name), (game["id"], name))
                            for source_id in evidence["fieldSources"][name]:
                                self.assertEqual("verified", self.sources[source_id]["status"])
                    for made, attempts in [("thirdDownMade", "thirdDownAttempts"), ("redZoneTD", "redZoneAttempts")]:
                        if stats[made] is not None and stats[attempts] is not None:
                            self.assertGreaterEqual(stats[made], 0)
                            self.assertGreaterEqual(stats[attempts], stats[made])
                    if all(stats[k] is not None for k in ("netPassing", "rushing", "totalOffense")):
                        self.assertEqual(stats["netPassing"] + stats["rushing"], stats["totalOffense"])

    def test_disagreements_are_explicit_and_critical_fields_unavailable(self):
        indexed = {g["id"]: g for t in self.data["teams"].values() for g in t["games"]}
        for issue in self.data["disagreements"]:
            self.assertGreaterEqual(len(issue["sourceIds"]), 2)
            self.assertTrue(issue["action"])
            if issue.get("field") == "kickoffUtc":
                self.assertIsNone(indexed[issue["gameId"]]["kickoffUtc"])
            if issue.get("field") == "jersey":
                player = next(p for p in self.data["teams"][issue["team"]]["roster"] if p["id"] == issue["playerId"])
                self.assertIsNone(player["jersey"])
                self.assertIsNone(player["number"])
                self.assertEqual("disputed", player["verification"]["status"])

    @unittest.skipUnless(CACHE, "Provide --cache-dir for independent raw-source arithmetic")
    def test_raw_source_player_arithmetic_independently_matches_team_yards(self):
        raw = collections.defaultdict(list)
        for season in self.data["coverage"]["seasons"]:
            path = CACHE / f"stats{season}.csv"
            if not path.exists():
                continue
            with path.open() as f:
                for row in csv.DictReader(f):
                    if row["season_type"] == "REG":
                        raw[(row["game_id"], row["team"])].append(row)
        indexed = {g["id"]: g for t in self.data["teams"].values() for g in t["games"]}
        checked = 0
        for game in indexed.values():
            for abbr, actual in game["stats"].items():
                rows = raw.get((game["id"], abbr), [])
                if not rows:
                    continue
                def summed(field):
                    cells = [r.get(field) for r in rows]
                    if any(cell in (None, "", "NA", "NaN", "nan") for cell in cells):
                        return None
                    return sum(Decimal(cell) for cell in cells)
                passing, sack_loss, rushing = summed("passing_yards"), summed("sack_yards_lost"), summed("rushing_yards")
                expected_net = passing - abs(sack_loss) if passing is not None and sack_loss is not None else None
                for name, expected in [("netPassing", expected_net), ("rushing", rushing)]:
                    if actual[name] is not None and expected is not None:
                        self.assertEqual(expected, Decimal(str(actual[name])), (game["id"], abbr, name))
                        checked += 1
        self.assertGreater(checked, 100)


class AdverseSourceFixtures(unittest.TestCase):
    def test_tampered_cache_cannot_acquire_verified_source_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.csv"
            path.write_text("value\n999\n")
            url = "https://example.invalid/public-fixture.csv"
            path.with_suffix(".meta.json").write_text(json.dumps({"url": url, "status": "verified", "sha256": "0" * 64}))
            item = ("fixture", {"url": url, "cache": path.name, "required": False})
            _, rows, metadata = builder.checked_fetch_source(item, folder)
            self.assertFalse(rows)
            self.assertEqual("unavailable", metadata["status"])
            self.assertIn("checksum", metadata["error"])
            with self.assertRaisesRegex(RuntimeError, "unverified cache"):
                builder.checked_fetch_source(("fixture", {**item[1], "required": True}), folder)

    def test_absent_current_season_cannot_silently_reset_team_records(self):
        base = {"teams": [{"abbr": "DAL"}]}
        datasets = {"nflverse_games": [{"season": "2025", "game_type": "REG", "game_id": "archive", "week": "18", "gameday": "2026-01-04", "home_team": "NYG", "away_team": "DAL"}]}
        with self.assertRaisesRegex(ValueError, "Current-season schedule"):
            builder.build_snapshot(base, datasets, {}, dt.datetime(2026, 10, 8, tzinfo=dt.timezone.utc), 2026, enrich_abbr=None)

    def test_sack_losses_are_subtracted_once_and_missing_cells_do_not_become_zero(self):
        rows = [{"passing_yards": "240", "sack_yards_lost": "-19", "rushing_yards": "7", "passing_interceptions": "0", "fumbles_lost_total": "0"},
                {"passing_yards": "0", "sack_yards_lost": "0", "rushing_yards": "79", "passing_interceptions": "0", "fumbles_lost_total": "1"}]
        values, _ = builder.team_stats(rows, "fixture")
        self.assertEqual((221, 86, 307, 1), (values["netPassing"], values["rushing"], values["totalOffense"], values["turnovers"]))
        rows[1]["rushing_yards"] = ""
        values, _ = builder.team_stats(rows, "fixture")
        self.assertIsNone(values["rushing"])
        self.assertIsNone(values["totalOffense"])
        self.assertIsNone(values["thirdDownMade"])

    def test_impossible_future_scores_cannot_be_final(self):
        raw = {"game_id": "fixture", "season": "2026", "week": "1", "gameday": "2026-10-11", "gametime": "13:00", "home_team": "DAL", "away_team": "TB", "home_score": "31", "away_score": "20", "location": "Home"}
        result = builder.normalize_game(raw, dt.datetime(2026, 10, 8, tzinfo=dt.timezone.utc), {})
        self.assertEqual("scheduled", result["status"])
        self.assertIsNone(result["home_score"])
        self.assertIsNone(result["away_score"])
        self.assertFalse(result["stats"])


if __name__ == "__main__":
    unittest.main(argv=[__file__, *REMAINING], verbosity=2)
