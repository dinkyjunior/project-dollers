"""Real source-monitor refusal and change-detection fixtures; never app data."""
import hashlib
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("matchup_source_monitor", ROOT / "scripts/check-source-updates.py")
MONITOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MONITOR)


class Response:
    status = 200

    def __init__(self, body=b"", headers=None):
        self.body, self.headers = body, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self, limit):
        return self.body[:limit]


class MatchupSourceMonitorTests(unittest.TestCase):
    def source(self, body=b'{"athletes":[]}'):
        return {"id":"espn_matchup_roster_TB", "url":"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/tb/roster",
                "required":False, "status":"verified", "season":2026, "watch":True,
                "retrievedAt":"2026-10-08T21:00:00Z", "sha256":hashlib.sha256(body).hexdigest()}

    def test_small_public_json_checks_real_get_bytes_without_resetting_retrieval(self):
        body = b'{"athletes":[]}'
        source = self.source(body)
        def unchanged(request, timeout):
            self.assertEqual(request.get_method(), "GET")
            return Response(body)
        check = MONITOR.check_source(source, unchanged)
        self.assertFalse(check["changed"])
        self.assertEqual(check["contentSha256"], source["sha256"])
        self.assertEqual(source["retrievedAt"], "2026-10-08T21:00:00Z")
        changed = MONITOR.check_source(source, lambda *_a, **_k: Response(b'{"athletes":[{"id":"new"}]}'))
        self.assertTrue(changed["changed"])

    def test_oversized_or_empty_json_does_not_claim_success(self):
        for body in (b"", b"<html>Unavailable</html>", b"[]", b"a" * (8 * 1024 * 1024 + 1)):
            check = MONITOR.check_source(self.source(), lambda *_a, **_k: Response(body))
            self.assertEqual(check["status"], "error")
            self.assertFalse(check["changed"])

    def test_changed_release_length_triggers_hash_verified_rebuild(self):
        source = {"id":"nflverse_pbp_2026", "url":"https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz",
                  "required":False, "status":"verified", "bytes":1000}
        def head(request, timeout):
            self.assertEqual(request.get_method(), "HEAD")
            return Response(headers={"Content-Length":"1200"})
        self.assertTrue(MONITOR.check_source(source, head)["changed"])
        equal = MONITOR.check_source(source, lambda *_a, **_k: Response(headers={"Content-Length":"1000"}))
        self.assertEqual(equal["status"], "unknown", "Equal length is not evidence of equal contents")
        encoded = MONITOR.check_source(source, lambda *_a, **_k: Response(headers={"Content-Length":"1200", "Content-Encoding":"gzip"}))
        self.assertEqual(encoded["status"], "unknown", "Transport compression cannot be compared with entity size")

    def test_only_current_research_sources_are_watched_and_duplicates_rejected(self):
        ids = ["nflverse_games", "nflverse_teams", "nflverse_roster", "nflverse_player_stats", "nflverse_depth", "nflverse_injuries"]
        core = {"season":2026, "sources":[{"id":key} for key in ids]}
        watched = self.source()
        archived = {**watched, "id":"archived", "season":2025}
        duplicate = {**watched, "id":ids[0]}
        selected = MONITOR.monitored_sources(core, {"sources":[watched, archived, duplicate]})
        self.assertEqual([s["id"] for s in selected], ids + [watched["id"]])
        with self.assertRaises(ValueError):
            MONITOR.monitored_sources({"sources":core["sources"][:-1]})
        with self.assertRaises(ValueError):
            MONITOR.monitored_sources(core, {"sources":[{**watched, "url":"https://example.invalid/private"}]})

    def test_espn_request_scope_stays_public_and_narrow(self):
        self.assertTrue(MONITOR.allowed_source(self.source()["url"]))
        for url in ("http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/tb/roster",
                    "https://site.api.espn.com/private/account", "https://person:secret@site.api.espn.com/apis/site/v2/sports/football/nfl/teams/tb/roster",
                    self.source()["url"] + "?redirect=private"):
            self.assertFalse(MONITOR.allowed_source(url))

    def test_event_scoped_live_report_changes_trigger_rebuild(self):
        previous = b'{"header":{"id":"401872980","status":"pre"}}'
        source = {**self.source(previous), "id":"espn_fixture_summary_401872980",
                  "url":"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872980"}
        self.assertTrue(MONITOR.allowed_source(source["url"]))
        def actual_get(request, timeout):
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.full_url, source["url"])
            return Response(b'{"header":{"id":"401872980","status":"in"}}')
        result = MONITOR.check_source(source, actual_get)
        self.assertTrue(result["changed"])
        self.assertEqual(source["retrievedAt"], "2026-10-08T21:00:00Z")
        for query in ("", "event=bad", "event=401872980&redirect=private", "event=1&event=2", "event=1#private"):
            self.assertFalse(MONITOR.allowed_source(source["url"].split("?")[0] + "?" + query))


if __name__ == "__main__":
    unittest.main()
