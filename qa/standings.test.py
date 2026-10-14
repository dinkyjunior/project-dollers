"""Independent standings-feed regressions; mock games never enter app data."""
import copy
import csv
import datetime as dt
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("standings_refresh", ROOT / "scripts/refresh-standings.py")
REFRESH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REFRESH)
NOW = dt.datetime(2026, 10, 14, 12, tzinfo=dt.timezone.utc)
SOURCE = {"id": "nflverse_games", "url": REFRESH.SOURCE_URL, "provider": "nflverse", "status": "verified",
          "retrievedAt": "2026-10-14T11:59:00Z", "checkedAt": "2026-10-14T11:59:00Z", "httpStatus": 200,
          "etag": '"fixture-etag"', "sha256": "a" * 64}


def identities():
    return json.loads((ROOT / "assets/data/current.json").read_text())["teams"]


def game(week, away, home, away_score, home_score, date=None):
    dates = {1: "2026-09-13", 2: "2026-09-20", 5: "2026-10-12", 6: "2026-10-15", 7: "2026-10-22"}
    return {"game_id": f"2026_{week:02d}_{away}_{home}", "season": "2026", "game_type": "REG",
            "week": str(week), "gameday": date or dates[week], "gametime": "20:15",
            "away_team": away, "home_team": home, "away_score": away_score, "home_score": home_score}


def fixtures():
    return [game(1, "BUF", "PIT", "10", "24"), game(2, "PIT", "LA", "21", "21"),
            game(5, "BUF", "LA", "37", "34"), game(6, "KC", "NYJ", "", ""),
            game(7, "LA", "PIT", "", "")]


def build(rows=None, now=NOW):
    return REFRESH.build_snapshot(rows or fixtures(), identities(), 2026, copy.deepcopy(SOURCE), now,
                                  require_full_schedule=False)


def records(snapshot, week=6):
    return {row["abbr"]: row for conference in snapshot["weeks"][str(week)]["conferences"].values() for row in conference}


def full_fixtures():
    """Complete test-only schedule with 17 appearances and one bye per team."""
    abbreviations = [team["abbr"] for team in identities()]
    pairs = list(zip(abbreviations[::2], abbreviations[1::2]))
    rows = []
    for week in range(1, 19):
        for index, (away, home) in enumerate(pairs):
            if (week == 4 and index < 8) or (week == 5 and index >= 8):
                continue
            date = dt.date(2026, 9, 13) + dt.timedelta(weeks=week - 1)
            row = game(week, away, home, "7" if week <= 5 else "", "10" if week <= 5 else "", date.isoformat())
            row["gametime"] = "13:00"
            rows.append(row)
    return rows


def csv_body(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=sorted(REFRESH.REQUIRED_COLUMNS))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode()


class Response:
    status = 200
    headers = {"ETag": '"new-entity"'}

    def __init__(self, body=b"csv-data"):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, limit):
        return self.body[:limit]


class StandingsTests(unittest.TestCase):
    def test_real_scores_ties_and_points_reconcile(self):
        snapshot = build()
        REFRESH.validate_snapshot(snapshot)
        rows = records(snapshot)
        self.assertEqual((rows["BUF"]["w"], rows["BUF"]["l"], rows["BUF"]["pointsFor"], rows["BUF"]["pointsAgainst"]),
                         (1, 1, 47, 58))
        self.assertEqual((rows["PIT"]["record"], rows["PIT"]["pct"]), ("1–0–1", ".750"))
        self.assertEqual(rows["LA"]["record"], "0–1–1")
        self.assertFalse(snapshot["ranking"]["official"])
        self.assertTrue(all(row["rank"] is None for row in rows.values()))

    def test_historical_weeks_preserve_entering_week_records(self):
        snapshot = build()
        self.assertEqual(snapshot["currentBrowsingWeek"], 6)
        self.assertEqual(snapshot["weeks"]["5"]["throughWeek"], 4)
        self.assertEqual(records(snapshot, 5)["BUF"]["record"], "0–1")
        self.assertEqual(snapshot["weeks"]["6"]["throughWeek"], 5)
        self.assertEqual(records(snapshot, 6)["BUF"]["record"], "1–1")

    def test_tuesday_rollover_uses_new_york_dst_boundary(self):
        games = REFRESH.normalized_games(fixtures(), identities(), 2026, NOW, False)
        monday = dt.datetime(2026, 10, 13, 3, 59, tzinfo=dt.timezone.utc)
        tuesday = dt.datetime(2026, 10, 13, 4, 0, tzinfo=dt.timezone.utc)
        self.assertEqual(REFRESH.browsing_week(games, monday), 5)
        self.assertEqual(REFRESH.browsing_week(games, tuesday), 6)
        november = [dict(game(7, "LA", "PIT", "", "", "2026-11-05"))]
        games = REFRESH.normalized_games(november, identities(), 2026, NOW, False)
        self.assertEqual(REFRESH.browsing_week(games, dt.datetime(2026, 11, 3, 5, 0, tzinfo=dt.timezone.utc)), 7)

    def test_current_week_available_finals_and_partial_disclosure(self):
        rows = fixtures() + [game(6, "BUF", "PIT", "14", "17", "2026-10-14")]
        now = dt.datetime(2026, 10, 16, 12, tzinfo=dt.timezone.utc)
        snapshot = build(rows, now)
        self.assertEqual(snapshot["coverage"]["throughWeek"], 6)
        self.assertEqual(snapshot["coverage"]["status"], "partial")
        self.assertEqual(snapshot["coverage"]["byWeek"]["6"], {
            "finalGames": 1, "scheduledGames": 2, "pendingStartedGames": 1, "complete": False})
        self.assertEqual(len(snapshot["games"]), 4)
        self.assertEqual(len(snapshot["schedule"]), 6)

    def test_no_one_sided_or_future_final_scores(self):
        for row in (game(6, "BUF", "LA", "10", ""), game(6, "BUF", "LA", "10", "7")):
            with self.subTest(row=row), self.assertRaises(ValueError):
                build([row])

    def test_duplicate_unknown_invalid_scores_and_incomplete_schedule_rejected(self):
        for rows in ([fixtures()[0]] * 2, [game(1, "BAD", "PIT", "10", "7")],
                     [game(1, "BUF", "PIT", "1.5", "7")], [game(1, "BUF", "PIT", "-1", "7")]):
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                build(rows)
        with self.assertRaisesRegex(ValueError, "complete 272-game"):
            REFRESH.build_snapshot(fixtures(), identities(), 2026, SOURCE, NOW)

    def test_disappearing_finals_and_individual_record_corruption_rejected(self):
        previous = build()
        current = build([row for row in fixtures() if row["week"] != "5"])
        with self.assertRaisesRegex(ValueError, "disappeared"):
            REFRESH.validate_snapshot(current, previous)
        tampered = copy.deepcopy(previous)
        rows = tampered["weeks"]["6"]["conferences"]["AFC"]
        rows[0]["pointsFor"] += 1
        rows[1]["pointsFor"] -= 1
        with self.assertRaisesRegex(ValueError, "do not reconcile"):
            REFRESH.validate_snapshot(tampered)

    def test_full_get_and_conditional_get_actual_provenance(self):
        def request(req, **kwargs):
            self.assertEqual(req.get_method(), "GET")
            self.assertEqual(req.get_header("If-none-match"), '"fixture-etag"')
            return Response()
        body, source = REFRESH.fetch_games(build(), opener=request)
        self.assertEqual(source["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual(source["retrievedAt"], source["checkedAt"])
        def force_request(req, **kwargs):
            self.assertIsNone(req.get_header("If-none-match"))
            return Response()
        REFRESH.fetch_games(build(), force=True, opener=force_request)
        def unchanged(req, **kwargs):
            raise urllib.error.HTTPError(req.full_url, 304, "Not modified", {}, None)
        body, check = REFRESH.fetch_games(build(), opener=unchanged)
        self.assertIsNone(body)
        self.assertNotIn("retrievedAt", check)
        self.assertEqual(check["httpStatus"], 304)

    def test_source_failure_preserves_saved_bytes(self):
        previous = build()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            output.write_text(json.dumps(previous))
            before = output.read_bytes()
            with patch.object(REFRESH, "fetch_games", side_effect=urllib.error.URLError("Provider unavailable")):
                with self.assertRaises(urllib.error.URLError):
                    REFRESH.refresh(output, ROOT / "assets/data/current.json")
            self.assertEqual(output.read_bytes(), before)

    def test_identical_full_get_does_not_rewrite_or_refresh_age(self):
        rows = full_fixtures()
        previous = REFRESH.build_snapshot(rows, identities(), 2026, copy.deepcopy(SOURCE), NOW)
        body = csv_body(rows)
        source = {**SOURCE, "retrievedAt": "2026-10-15T12:00:00Z", "checkedAt": "2026-10-15T12:00:00Z"}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            before = output.read_bytes()
            with patch.object(REFRESH, "fetch_games", return_value=(body, source)):
                snapshot, changed = REFRESH.refresh(output, ROOT / "assets/data/current.json", force=True)
            self.assertFalse(changed)
            self.assertEqual(snapshot["source"]["retrievedAt"], previous["source"]["retrievedAt"])
            self.assertEqual(output.read_bytes(), before)

    def test_304_can_roll_over_week_without_download_or_new_retrieval_age(self):
        previous = REFRESH.build_snapshot(full_fixtures(), identities(), 2026, copy.deepcopy(SOURCE), NOW)
        resumed = dt.datetime(2026, 10, 20, 4, 0, tzinfo=dt.timezone.utc)
        class Clock(dt.datetime):
            @classmethod
            def now(cls, timezone=None):
                return resumed.astimezone(timezone or dt.timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            with patch.object(REFRESH, "fetch_games", return_value=(None, {"httpStatus": 304, "checkedAt": REFRESH.iso(resumed)})), patch.object(REFRESH.dt, "datetime", Clock):
                snapshot, changed = REFRESH.refresh(output, ROOT / "assets/data/current.json")
            self.assertTrue(changed)
            self.assertEqual(snapshot["currentBrowsingWeek"], 7)
            self.assertEqual(snapshot["source"]["retrievedAt"], SOURCE["retrievedAt"])
            self.assertEqual(snapshot["generatedAt"], REFRESH.iso(resumed))
            self.assertEqual(snapshot["coverage"]["byWeek"]["6"]["pendingStartedGames"], 16)
            self.assertEqual(snapshot["coverage"]["pendingStartedGames"], 16)
            self.assertEqual(snapshot["coverage"]["expectedThroughWeek"], 6)
            self.assertEqual(snapshot["coverage"]["status"], "partial")

    def test_official_records_compare_without_claiming_seed_order(self):
        snapshot = build()
        official = {"provider": "NFL", "url": "https://www.nfl.com/standings/",
                    "season": 2026, "retrievedAt": SOURCE["retrievedAt"],
                    "teams": [{key: row[key] for key in ("abbr", "w", "l", "ties")} for row in records(snapshot).values()]}
        self.assertEqual(REFRESH.compare_official_records(snapshot, official)["status"], "records-match")
        official["teams"][0]["w"] += 1
        result = REFRESH.compare_official_records(snapshot, official)
        self.assertEqual(result["status"], "records-differ")
        self.assertEqual(len(result["mismatches"]), 1)
        self.assertFalse(snapshot["ranking"]["official"])
        official["season"] = 2025
        with self.assertRaises(ValueError):
            REFRESH.compare_official_records(snapshot, official)


if __name__ == "__main__":
    unittest.main()
