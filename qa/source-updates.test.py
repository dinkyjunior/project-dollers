"""Provider-monitor regressions. Mock HTTP responses never enter app data."""
import datetime as dt
import importlib.util
from pathlib import Path
import unittest
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("source_updates", ROOT / "scripts/check-source-updates.py")
MONITOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MONITOR)
NOW = dt.datetime(2026, 10, 2, 1, tzinfo=dt.timezone.utc)
SOURCE = {"id": "nflverse_player_stats", "url": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
          "required": True, "status": "verified", "retrievedAt": "2026-10-02T00:00:00Z", "etag": '"old"'}


class Response:
    status = 200

    def __init__(self, etag):
        self.headers = {"ETag": etag}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class SourceMonitorTests(unittest.TestCase):
    def test_conditional_head_304_preserves_source_age(self):
        def request(req, timeout):
            self.assertEqual(req.get_method(), "HEAD")
            self.assertEqual(req.get_header("If-none-match"), '"old"')
            raise urllib.error.HTTPError(req.full_url, 304, "Not modified", {}, None)
        check = MONITOR.check_source(SOURCE, request)
        outcome = MONITOR.decision({"sources": [SOURCE]}, [check], NOW)
        self.assertFalse(outcome["shouldRefresh"])
        self.assertEqual(outcome["oldestRequiredRetrievalAgeSeconds"], 3600)
        self.assertEqual(SOURCE["retrievedAt"], "2026-10-02T00:00:00Z")

    def test_changed_validator_triggers_publication(self):
        check = MONITOR.check_source(SOURCE, lambda *_args, **_kwargs: Response('"new"'))
        outcome = MONITOR.decision({"sources": [SOURCE]}, [check], NOW)
        self.assertTrue(outcome["shouldRefresh"])
        self.assertEqual(outcome["sourceChanges"], ["nflverse_player_stats"])

    def test_six_hour_safety_full_fetch_even_if_unchanged(self):
        check = MONITOR.check_source(SOURCE, lambda *_args, **_kwargs: Response('"old"'))
        self.assertTrue(MONITOR.decision({"sources": [SOURCE]}, [check], NOW + dt.timedelta(hours=5))["shouldRefresh"])

    def test_required_source_failure_preserves_snapshot(self):
        def blocked(*args, **kwargs):
            raise urllib.error.URLError("Provider unavailable")
        check = MONITOR.check_source(SOURCE, blocked)
        outcome = MONITOR.decision({"sources": [SOURCE]}, [check], NOW, force=True)
        self.assertFalse(outcome["shouldRefresh"])
        self.assertEqual(outcome["requiredErrors"], ["nflverse_player_stats"])

    def test_optional_availability_transitions_only_once(self):
        unavailable = {**SOURCE, "required": False, "status": "unavailable"}
        def missing(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 404, "Not found", {}, None)
        self.assertFalse(MONITOR.check_source(unavailable, missing)["changed"])
        self.assertTrue(MONITOR.check_source({**unavailable, "status": "verified"}, missing)["changed"])
        self.assertTrue(MONITOR.check_source(unavailable, lambda *_args, **_kwargs: Response('"new"'))["changed"])

    def test_exact_nfl_game_windows_hourly_fallback_and_manual_trigger(self):
        snapshot = {"context": {"refreshGameKickoffsUtc": ["2026-10-02T00:15:00Z"]}}
        self.assertTrue(MONITOR.cadence(snapshot, NOW, "schedule", "22,37,52 * * * *")[0])
        afternoon = dt.datetime(2026, 10, 2, 17, 22, tzinfo=dt.timezone.utc)
        self.assertFalse(MONITOR.cadence(snapshot, afternoon, "schedule", "22,37,52 * * * *")[0])
        self.assertTrue(MONITOR.cadence(snapshot, afternoon, "schedule", MONITOR.HOURLY_CRON)[0])
        self.assertTrue(MONITOR.cadence(snapshot, afternoon, "repository_dispatch")[0])

    def test_public_source_allowlist_rejects_unexpected_host_without_request(self):
        def unexpected(*args, **kwargs):
            self.fail("Unexpected URL must never be fetched")
        check = MONITOR.check_source({**SOURCE, "url": "https://example.invalid/private"}, unexpected)
        self.assertEqual(check["status"], "error")


if __name__ == "__main__":
    unittest.main()
