#!/usr/bin/env python3
"""Check public provider validators before rebuilding the NFL snapshot.

This does not retrieve player statistics or reset their retrieval timestamps.
The refresh workflow runs a full validated fetch when a source changes, on an
explicit forced refresh, or after a six-hour safety interval. GitHub schedules
are best effort; repository_dispatch is an authorized integration hook, not an
already connected provider webhook.
"""
import argparse
import concurrent.futures
import datetime as dt
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
HOURLY_CRON = "7 * * * *"
MAX_AGE = dt.timedelta(hours=6)


def timestamp(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def cadence(snapshot, now, event="workflow_dispatch", cron=""):
    """Return whether this invocation is eligible to perform small HEAD checks."""
    if event != "schedule":
        return True, "Authorized manual or integration trigger"
    if cron == HOURLY_CRON:
        return True, "Hourly provider availability check"
    kickoffs = snapshot.get("context", {}).get("refreshGameKickoffsUtc", [])
    # Backward compatibility while the first expanded snapshot is published.
    if not kickoffs:
        kickoffs = [g["kickoffUtc"] for g in snapshot.get("steelers", {}).get("schedule", []) if g.get("kickoffUtc")]
    for kickoff in kickoffs:
        starts = timestamp(kickoff)
        if starts - dt.timedelta(hours=1) <= now <= starts + dt.timedelta(hours=8):
            return True, "Scheduled NFL game or post-game release window"
    # nflverse publishes roster/depth/injury datasets around 07 UTC and weekly
    # player/team statistics around 09 UTC. Check the surrounding windows to
    # allow normal provider/GitHub scheduling delay, without polling all day.
    minute = now.hour * 60 + now.minute
    if 6 * 60 + 30 <= minute <= 7 * 60 + 45:
        return True, "Daily roster, depth and injury release window"
    if now.month in (1, 2, 9, 10, 11, 12) and 8 * 60 + 30 <= minute <= 9 * 60 + 45:
        return True, "Season player-statistics batch release window"
    return False, "Outside game and provider release windows; next hourly check remains scheduled"


def allowed_source(url):
    parsed = urllib.parse.urlsplit(url)
    return (parsed.scheme == "https" and not parsed.username and not parsed.password
            and ((parsed.hostname == "github.com" and parsed.path.startswith("/nflverse/nflverse-data/releases/download/"))
                 or (parsed.hostname == "raw.githubusercontent.com" and parsed.path == "/nflverse/nfldata/master/data/games.csv")))


def check_source(source, opener=urllib.request.urlopen):
    """Compare response validators with the last successfully fetched entity."""
    result = {"id": source["id"], "url": source["url"], "required": bool(source.get("required")),
              "previousStatus": source.get("status"), "changed": False}
    if not allowed_source(source["url"]):
        return {**result, "status": "error", "error": "Unexpected public source URL; no request performed"}
    headers = {"User-Agent": "ProjectDollarSourceMonitor/1.0 public-data-check"}
    if source.get("etag"):
        headers["If-None-Match"] = source["etag"]
    elif source.get("lastModified"):
        headers["If-Modified-Since"] = source["lastModified"]
    request = urllib.request.Request(source["url"], method="HEAD", headers=headers)
    try:
        with opener(request, timeout=35) as response:
            status = response.status
            etag = response.headers.get("ETag")
            modified = response.headers.get("Last-Modified")
        # HEAD returns headers only; this avoids downloading the 56 MB depth
        # chart or re-fetching the historical CSV archive on every invocation.
        result.update({"httpStatus": status, "etag": etag, "lastModified": modified, "status": "available"})
        if source.get("status") != "verified":
            result.update({"changed": True, "reason": "Previously unavailable source is available"})
        elif source.get("etag") and etag:
            result.update({"changed": source["etag"] != etag, "reason": "Compared entity tags"})
        elif source.get("lastModified") and modified:
            result.update({"changed": source["lastModified"] != modified, "reason": "Compared source modification timestamps"})
        else:
            result.update({"status": "unknown", "reason": "No comparable validator; use the six-hour full-fetch safety interval"})
        return result
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return {**result, "httpStatus": 304, "status": "unchanged", "reason": "Provider confirmed matching validator"}
        if exc.code in (405, 501):
            return {**result, "httpStatus": exc.code, "status": "unknown", "reason": "Provider does not support HEAD; use full-fetch safety interval"}
        if not source.get("required"):
            return {**result, "httpStatus": exc.code, "status": "unavailable", "changed": source.get("status") == "verified",
                    "reason": "Optional source availability transition"}
        return {**result, "httpStatus": exc.code, "status": "error", "error": str(exc)}
    except Exception as exc:
        return {**result, "status": "error", "error": str(exc)}


def decision(snapshot, checks, now, force=False):
    required_errors = [item["id"] for item in checks if item["required"] and item["status"] == "error"]
    required = [item for item in snapshot["sources"] if item.get("required") and item.get("status") == "verified"]
    oldest = min((timestamp(item["retrievedAt"]) for item in required), default=dt.datetime.min.replace(tzinfo=UTC))
    age = max(0, (now - oldest).total_seconds())
    changed = [item["id"] for item in checks if item["changed"]]
    due = now - oldest >= MAX_AGE
    should_refresh = not required_errors and (force or bool(changed) or due)
    return {"checkedAt": iso(now), "shouldRefresh": should_refresh, "sourceChanges": changed,
            "fullFetchSafetyIntervalHours": 6, "oldestRequiredRetrievalAgeSeconds": round(age),
            "forced": force, "safetyRefreshDue": due, "requiredErrors": required_errors,
            "checks": checks, "note": "Source availability check does not renew statistics retrieval timestamps"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", default="workflow_dispatch")
    parser.add_argument("--cron", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--github-output", help="GitHub Actions output file")
    args = parser.parse_args()
    now = dt.datetime.now(UTC)
    snapshot = json.loads((ROOT / "assets/data/current.json").read_text())
    eligible, reason = cadence(snapshot, now, args.event, args.cron)
    if not eligible and not args.force:
        result = {"checkedAt": iso(now), "shouldRefresh": False, "checks": [], "cadenceReason": reason}
    else:
        # Only current sources are watched. Historical statistics are loaded
        # once into the independently validated player-history bundle.
        sources = [item for item in snapshot["sources"] if item["id"] in {
            "nflverse_games", "nflverse_teams", "nflverse_roster", "nflverse_player_stats", "nflverse_depth", "nflverse_injuries"}]
        if len(sources) != 6:
            raise ValueError("Expected the six replaceable current NFL source contracts")
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            checks = list(pool.map(check_source, sources))
        result = {**decision(snapshot, checks, now, args.force), "cadenceReason": reason}
    print(json.dumps(result, indent=2))
    if args.github_output:
        with Path(args.github_output).open("a") as handle:
            handle.write(f"should_refresh={'true' if result['shouldRefresh'] else 'false'}\n")
    if result.get("requiredErrors"):
        sys.exit(1)


if __name__ == "__main__":
    main()
