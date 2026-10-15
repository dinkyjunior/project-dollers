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


def official_captures(snapshot):
    """Synthetic public-provider responses for isolated producer tests."""
    espn = {"season": {"year": snapshot["season"]}, "children": []}
    html = [f"<title>{snapshot['season']} NFL Conference Standings</title>"
            f'<link rel="canonical" href="https://www.nfl.com/standings/conference/{snapshot["season"]}/reg">'
            f'<select id="phase-dropdown"><option value="/standings/conference/{snapshot["season"]}/REG" selected>'
            'Regular season</option></select><table>']
    for conference, rows in snapshot["weeks"][str(snapshot["currentBrowsingWeek"])]["conferences"].items():
        entries = []
        html.append("<tr>" + "".join(f"<th>{cell}</th>" for cell in [f"{conference} Team", "W", "L", "T", "RANK", "PCT", "PF", "PA"]) + "</tr>")
        for rank, row in enumerate(rows, 1):
            entries.append({"team": {"abbreviation": {"LA": "LAR", "WAS": "WSH"}.get(row["abbr"], row["abbr"])},
                            "stats": [{"name": key, "value": value} for key, value in {
                                "wins": row["w"], "losses": row["l"], "ties": row["ties"], "playoffSeed": rank}.items()]})
            html.append("<tr>" + "".join(f"<td>{value}</td>" for value in [row["fullName"], row["w"], row["l"], row["ties"], rank,
                                                                              row["pct"], row["pointsFor"], row["pointsAgainst"]]) + "</tr>")
        # Entry array order must never become conference rank authority.
        espn["children"].append({"abbreviation": conference, "standings": {
            "season": snapshot["season"], "seasonType": 2, "entries": list(reversed(entries))}})
    html.append("</table>")
    captures = {}
    for provider, body in (("ESPN", json.dumps(espn).encode()), ("NFL", "".join(html).encode())):
        captures[provider] = (body, {"id": REFRESH.ESPN_SOURCE_ID if provider == "ESPN" else REFRESH.NFL_SOURCE_ID,
            "url": REFRESH.provider_url(provider, snapshot["season"]), "provider": provider, "season": snapshot["season"],
            "status": "verified", "httpStatus": 200, "retrievedAt": SOURCE["retrievedAt"], "checkedAt": SOURCE["retrievedAt"],
            "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body), "etag": f'"test-{provider}"', "lastModified": None})
    return captures


def attach_official(snapshot):
    captures = official_captures(snapshot)
    REFRESH.apply_provider_order(snapshot, REFRESH.parse_espn(captures["ESPN"][0], snapshot["teams"], snapshot["season"]),
        REFRESH.parse_nfl(captures["NFL"][0], snapshot["teams"], snapshot["season"]), captures["ESPN"][1], captures["NFL"][1])
    return captures


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
        captures = attach_official(previous)
        body = csv_body(rows)
        source = {**SOURCE, "retrievedAt": "2026-10-15T12:00:00Z", "checkedAt": "2026-10-15T12:00:00Z"}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            before = output.read_bytes()
            with patch.object(REFRESH, "fetch_games", return_value=(body, source)), patch.object(REFRESH, "fetch_provider", side_effect=lambda provider, *_args: captures[provider]):
                snapshot, changed = REFRESH.refresh(output, ROOT / "assets/data/current.json", force=True)
            self.assertFalse(changed)
            self.assertEqual(snapshot["source"]["retrievedAt"], previous["source"]["retrievedAt"])
            self.assertEqual(output.read_bytes(), before)

    def test_304_can_roll_over_week_without_download_or_new_retrieval_age(self):
        previous = REFRESH.build_snapshot(full_fixtures(), identities(), 2026, copy.deepcopy(SOURCE), NOW)
        captures = attach_official(previous)
        resumed = dt.datetime(2026, 10, 20, 4, 0, tzinfo=dt.timezone.utc)
        class Clock(dt.datetime):
            @classmethod
            def now(cls, timezone=None):
                return resumed.astimezone(timezone or dt.timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            with patch.object(REFRESH, "fetch_games", return_value=(None, {"httpStatus": 304, "checkedAt": REFRESH.iso(resumed)})), patch.object(REFRESH.dt, "datetime", Clock), patch.object(REFRESH, "fetch_provider", side_effect=lambda provider, *_args: captures[provider]):
                snapshot, changed = REFRESH.refresh(output, ROOT / "assets/data/current.json")
            self.assertTrue(changed)
            self.assertEqual(snapshot["currentBrowsingWeek"], 7)
            self.assertEqual(snapshot["source"]["retrievedAt"], SOURCE["retrievedAt"])
            self.assertEqual(snapshot["generatedAt"], REFRESH.iso(resumed))
            self.assertEqual(snapshot["coverage"]["byWeek"]["6"]["pendingStartedGames"], 16)
            self.assertEqual(snapshot["coverage"]["pendingStartedGames"], 16)
            self.assertEqual(snapshot["coverage"]["expectedThroughWeek"], 6)
            self.assertEqual(snapshot["coverage"]["status"], "partial")

    def test_official_seed_overrides_array_and_custom_diff_order_current_week_only(self):
        snapshot = build()
        before_history = copy.deepcopy(snapshot["weeks"]["5"])
        captures = attach_official(snapshot)
        parsed = REFRESH.parse_espn(captures["ESPN"][0], identities(), 2026)
        self.assertNotEqual(parsed["teams"][0]["rank"], 1)
        # Explicitly swap two source seeds, leaving records and DIFF unchanged.
        first, second = [row for row in parsed["teams"] if row["conference"] == "AFC"][:2]
        first["rank"], second["rank"] = second["rank"], first["rank"]
        REFRESH.apply_provider_order(snapshot, parsed, snapshot["providerStandings"]["NFL"], captures["ESPN"][1], captures["NFL"][1])
        self.assertEqual(snapshot["weeks"]["5"], before_history)
        self.assertEqual(len(snapshot["crossCheck"]["orderDisagreements"]), 2)
        self.assertEqual(snapshot["crossCheck"]["status"], "records-match")
        self.assertTrue(snapshot["ranking"]["official"])
        rows = snapshot["weeks"]["6"]["conferences"]["AFC"]
        self.assertEqual([row["rank"] for row in rows], list(range(1, 17)))
        self.assertEqual(rows[first["rank"] - 1]["abbr"], first["abbr"])
        REFRESH.validate_snapshot(snapshot, require_official=True)

    def test_wrong_season_missing_duplicate_seed_and_record_conflict_rejected(self):
        snapshot = build()
        captures = official_captures(snapshot)
        body = json.loads(captures["ESPN"][0])
        for change in ("season", "missing", "duplicate", "records"):
            changed = copy.deepcopy(body)
            entry = changed["children"][0]["standings"]["entries"][0]
            if change == "season":
                changed["season"]["year"] = 2025
            elif change == "missing":
                entry["stats"] = [item for item in entry["stats"] if item["name"] != "playoffSeed"]
            elif change == "duplicate":
                next(item for item in entry["stats"] if item["name"] == "playoffSeed")["value"] = 1
            else:
                next(item for item in entry["stats"] if item["name"] == "wins")["value"] += 1
            with self.subTest(change=change), self.assertRaises(ValueError):
                parsed = REFRESH.parse_espn(json.dumps(changed).encode(), identities(), 2026)
                REFRESH.apply_provider_order(snapshot, parsed, REFRESH.parse_nfl(captures["NFL"][0], identities(), 2026),
                                             captures["ESPN"][1], captures["NFL"][1])

    def test_nfl_wrong_or_missing_regular_season_phase_rejected(self):
        captures = official_captures(build())
        body = captures["NFL"][0]
        for changed in (body.replace(b"/2026/reg", b"/2026/pre"),
                        body.replace(b"/2026/REG", b"/2026/PRE"),
                        body.replace(b"/2026/reg", b"/2025/reg"),
                        body.replace(b" selected", b"")):
            with self.subTest(body=changed[:200]), self.assertRaisesRegex(ValueError, "canonical URL and selected phase"):
                REFRESH.parse_nfl(changed, identities(), 2026)
        # The production canonical is lowercase while its selected option is uppercase.
        parsed = REFRESH.parse_nfl(body, identities(), 2026)
        self.assertEqual(len(parsed["teams"]), 32)

    def test_official_only_rank_change_publishes_even_when_games_304(self):
        previous = REFRESH.build_snapshot(full_fixtures(), identities(), 2026, copy.deepcopy(SOURCE), NOW)
        captures = attach_official(previous)
        espn_json = json.loads(captures["ESPN"][0])
        entries = espn_json["children"][0]["standings"]["entries"]
        first = next(item for item in entries[0]["stats"] if item["name"] == "playoffSeed")
        second = next(item for item in entries[1]["stats"] if item["name"] == "playoffSeed")
        first["value"], second["value"] = second["value"], first["value"]
        espn_body = json.dumps(espn_json).encode()
        changed_source = {**captures["ESPN"][1], "retrievedAt": "2026-10-15T00:30:00Z", "sha256": hashlib.sha256(espn_body).hexdigest()}
        def providers(provider, *_args):
            return (espn_body, changed_source) if provider == "ESPN" else (None, captures["NFL"][1])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            with patch.object(REFRESH, "fetch_games", return_value=(None, {"httpStatus": 304, "checkedAt": REFRESH.iso(NOW)})), patch.object(REFRESH, "fetch_provider", side_effect=providers) as fetch:
                snapshot, changed = REFRESH.refresh(output, ROOT / "assets/data/current.json")
            self.assertTrue(changed)
            self.assertEqual(fetch.call_count, 2)
            self.assertNotEqual(snapshot["conferenceOrder"], previous["conferenceOrder"])
            self.assertEqual(snapshot["source"]["retrievedAt"], previous["source"]["retrievedAt"])
            self.assertEqual(snapshot["ranking"]["source"]["retrievedAt"], changed_source["retrievedAt"])

    def test_official_failure_preserves_full_previous_official_feed(self):
        previous = REFRESH.build_snapshot(full_fixtures(), identities(), 2026, copy.deepcopy(SOURCE), NOW)
        attach_official(previous)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            before = output.read_bytes()
            with patch.object(REFRESH, "fetch_games", return_value=(None, {"httpStatus": 304, "checkedAt": REFRESH.iso(NOW)})), patch.object(REFRESH, "fetch_provider", side_effect=urllib.error.URLError("Official provider failed")):
                with self.assertRaises(urllib.error.URLError):
                    REFRESH.refresh(output, ROOT / "assets/data/current.json")
            self.assertEqual(output.read_bytes(), before)
            self.assertTrue(json.loads(output.read_text())["ranking"]["official"])

    def test_changed_html_chrome_same_validated_records_and_ranks_does_not_publish(self):
        previous = REFRESH.build_snapshot(full_fixtures(), identities(), 2026, copy.deepcopy(SOURCE), NOW)
        captures = attach_official(previous)
        # A genuine new response can have changed ads without changed standings.
        changed_body = captures["NFL"][0] + b"<script>/* changed advertisement */</script>"
        changed_source = {**captures["NFL"][1], "retrievedAt": "2026-10-15T00:30:00Z",
                          "checkedAt": "2026-10-15T00:30:00Z", "sha256": hashlib.sha256(changed_body).hexdigest(),
                          "bytes": len(changed_body)}
        # ESPN may also reorder its raw entries without changing playoffSeed.
        espn_json = json.loads(captures["ESPN"][0])
        espn_json["children"][0]["standings"]["entries"].reverse()
        espn_body = json.dumps(espn_json).encode()
        espn_source = {**captures["ESPN"][1], "retrievedAt": "2026-10-15T00:30:00Z",
                       "checkedAt": "2026-10-15T00:30:00Z", "sha256": hashlib.sha256(espn_body).hexdigest(), "bytes": len(espn_body)}
        def providers(provider, *_args):
            return (changed_body, changed_source) if provider == "NFL" else (espn_body, espn_source)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "standings.json"
            REFRESH.atomic_write(output, previous)
            before = output.read_bytes()
            with patch.object(REFRESH, "fetch_games", return_value=(None, {"httpStatus": 304, "checkedAt": REFRESH.iso(NOW)})), patch.object(REFRESH, "fetch_provider", side_effect=providers) as fetch:
                snapshot, changed = REFRESH.refresh(output, ROOT / "assets/data/current.json", force=True)
            self.assertFalse(changed)
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(output.read_bytes(), before)
            self.assertEqual(snapshot["sources"], previous["sources"])

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
