"""Daily-refresh regressions; synthetic source checks never enter app data."""
import contextlib
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("daily_source_updates", ROOT / "scripts/check-source-updates.py")
MONITOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MONITOR)
NOW = dt.datetime(2026, 10, 13, 17, 7, tzinfo=dt.timezone.utc)
SOURCE_IDS = ("nflverse_games", "nflverse_teams", "nflverse_roster",
              "nflverse_player_stats", "nflverse_depth", "nflverse_injuries")


class FrozenDateTime(dt.datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz else NOW.replace(tzinfo=None)


class DailyRefreshTests(unittest.TestCase):
    def invoke(self, event="schedule", cron=None, force=False, failure=None):
        """Exercise the actual CLI main, including its GitHub output and exit."""
        snapshot = {"season": 2026, "sources": [
            {"id": source_id, "required": True, "status": "verified",
             "retrievedAt": "2026-10-13T17:00:00Z", "etag": '"unchanged"',
             "url": "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"}
            for source_id in SOURCE_IDS]}
        argv = ["check-source-updates.py", "--event", event, "--cron",
                MONITOR.DAILY_CRON if cron is None else cron]
        if force:
            argv.append("--force")

        def unchanged(source):
            return {"id": source["id"], "required": True, "changed": False,
                    "status": "error" if source["id"] == failure else "unchanged"}

        with tempfile.TemporaryDirectory(prefix="pd-daily-refresh-test-") as directory:
            fixture_root = Path(directory)
            source_file = fixture_root / "assets/data/current.json"
            source_file.parent.mkdir(parents=True)
            source_file.write_text(json.dumps(snapshot))
            original_bytes = source_file.read_bytes()
            output = fixture_root / "github-output"
            argv.extend(["--github-output", str(output)])
            stdout = io.StringIO()
            status = 0
            with patch.object(MONITOR, "ROOT", fixture_root), \
                    patch.object(MONITOR.dt, "datetime", FrozenDateTime), \
                    patch.object(MONITOR, "check_source", unchanged), \
                    patch.object(sys, "argv", argv), contextlib.redirect_stdout(stdout):
                try:
                    MONITOR.main()
                except SystemExit as exit_error:
                    status = exit_error.code
            self.assertEqual(source_file.read_bytes(), original_bytes,
                             "A monitor check must never renew source retrieval timestamps")
            return json.loads(stdout.getvalue()), output.read_text(), status

    def test_daily_forces_full_fetch_even_when_all_validators_match_and_fresh(self):
        result, output, status = self.invoke()
        self.assertTrue(result["shouldRefresh"])
        self.assertTrue(result["forced"])
        self.assertTrue(result["dailyScheduledRefresh"])
        self.assertFalse(result["safetyRefreshDue"])
        self.assertEqual(result["sourceChanges"], [])
        self.assertEqual(result["oldestRequiredRetrievalAgeSeconds"], 7 * 60)
        self.assertEqual(output, "should_refresh=true\n")
        self.assertEqual(status, 0)

    def test_other_hourly_check_avoids_unchanged_fresh_full_fetch(self):
        result, output, status = self.invoke(cron=MONITOR.HOURLY_CRON)
        self.assertFalse(result["shouldRefresh"])
        self.assertFalse(result["forced"])
        self.assertFalse(result["dailyScheduledRefresh"])
        self.assertEqual(output, "should_refresh=false\n")
        self.assertEqual(status, 0)

    def test_daily_required_source_failure_blocks_publish_and_fails_job(self):
        result, output, status = self.invoke(failure="nflverse_games")
        self.assertFalse(result["shouldRefresh"])
        self.assertTrue(result["forced"])
        self.assertEqual(result["requiredErrors"], ["nflverse_games"])
        self.assertEqual(output, "should_refresh=false\n")
        self.assertEqual(status, 1)

    def test_explicit_manual_force_keeps_existing_behavior(self):
        result, output, status = self.invoke(event="workflow_dispatch", cron="", force=True)
        self.assertTrue(result["shouldRefresh"])
        self.assertTrue(result["forced"])
        self.assertFalse(result["dailyScheduledRefresh"])
        self.assertEqual(output, "should_refresh=true\n")
        self.assertEqual(status, 0)

    def test_daily_string_does_not_force_unscheduled_manual_event(self):
        result, output, status = self.invoke(event="workflow_dispatch")
        self.assertFalse(result["shouldRefresh"])
        self.assertFalse(result["dailyScheduledRefresh"])
        self.assertFalse(result["forced"])
        self.assertEqual(output, "should_refresh=false\n")
        self.assertEqual(status, 0)

    def test_daily_remains_eligible_in_offseason_or_delayed_execution(self):
        delayed = dt.datetime(2026, 6, 2, 20, 41, tzinfo=dt.timezone.utc)
        eligible, reason = MONITOR.cadence({}, delayed, "schedule", MONITOR.DAILY_CRON)
        self.assertTrue(eligible)
        self.assertEqual(reason, "Daily full-source refresh")

    def test_workflow_crons_cover_every_hour_without_duplicate_daily_instant(self):
        workflow = (ROOT / ".github/workflows/refresh-nfl-data.yml").read_text()
        crons = re.findall(r"- cron: '([^']+)'", workflow)
        self.assertEqual(crons, [MONITOR.DAILY_CRON, MONITOR.HOURLY_CRON, "22,37,52 * * * *"])
        self.assertEqual(MONITOR.DAILY_CRON, "7 17 * * *")
        self.assertEqual(MONITOR.HOURLY_CRON, "7 0-16,18-23 * * *")
        hourly_hours = set(range(0, 17)) | set(range(18, 24))
        daily_hours = {17}
        self.assertEqual(hourly_hours & daily_hours, set())
        self.assertEqual(hourly_hours | daily_hours, set(range(24)))
        self.assertIn('python3 scripts/check-source-updates.py "${args[@]}"', workflow)
        self.assertIn("SCHEDULE: ${{ github.event.schedule }}", workflow)

    def test_cli_legacy_hourly_cron_stays_eligible_during_rollout(self):
        self.assertTrue(MONITOR.cadence({}, NOW, "schedule", "7 * * * *")[0])

    def test_six_hour_safety_and_optional_failure_remain_independent_of_daily(self):
        source = {"id": "nflverse_games", "required": True, "status": "verified",
                  "retrievedAt": "2026-10-13T11:07:00Z"}
        checks = [{"id": source["id"], "required": True, "changed": False, "status": "unchanged"},
                  {"id": "optional_injuries", "required": False, "changed": False, "status": "error"}]
        result = MONITOR.decision({"sources": [source]}, checks, NOW)
        self.assertTrue(result["shouldRefresh"])
        self.assertTrue(result["safetyRefreshDue"])
        self.assertEqual(result["requiredErrors"], [])


if __name__ == "__main__":
    unittest.main()
