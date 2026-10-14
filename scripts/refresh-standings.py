#!/usr/bin/env python3
"""Refresh standings independently of rosters, player statistics and reports.

Only the public nflverse regular-season schedule is required. A failed request,
invalid season, incomplete schedule or disappearing final preserves the last
validated file. Conditional GETs avoid redownloading an unchanged source. The
daily workflow can pass --force to retrieve and validate the complete entity.

Optional --official-standings accepts a locally captured, normalized ESPN/NFL
record export; no official ranking or tie-break order is inferred from records.
"""
import argparse
import collections
import csv
import datetime as dt
from fractions import Fraction
import hashlib
import io
import json
import os
from pathlib import Path
import ssl
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
UTC = dt.timezone.utc
ET = ZoneInfo("America/New_York")
MAX_SOURCE_BYTES = 12 * 1024 * 1024
REQUIRED_COLUMNS = {"game_id", "season", "game_type", "week", "gameday", "gametime",
                    "home_team", "away_team", "home_score", "away_score"}
RANKING_NOTE = ("Ordered by winning percentage, then points differential, then team abbreviation. "
                "NFL conference seeding and official tie-break order are not verified.")


def iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def timestamp(value):
    result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Source timestamp must include its timezone")
    return result.astimezone(UTC)


def ssl_context():
    context = ssl.create_default_context()
    proxy_ca = Path("/usr/local/share/ca-certificates/environment-proxy-ca.crt")
    if proxy_ca.exists():
        context.load_verify_locations(cafile=str(proxy_ca))
    return context


def fetch_games(previous=None, force=False, opener=urllib.request.urlopen):
    """Return CSV bytes and actual HTTP provenance, or None on a genuine 304."""
    headers = {"User-Agent": "ProjectDollarStandings/1.0 public-data-refresh"}
    if previous and not force:
        source = previous.get("source", {})
        if source.get("url") == SOURCE_URL and source.get("etag"):
            headers["If-None-Match"] = source["etag"]
        elif source.get("url") == SOURCE_URL and source.get("lastModified"):
            headers["If-Modified-Since"] = source["lastModified"]
    request = urllib.request.Request(SOURCE_URL, headers=headers)
    try:
        with opener(request, timeout=60, context=ssl_context()) as response:
            if response.status == 304:
                if not previous or force:
                    raise ValueError("Unconditional source GET did not return an entity")
                return None, {"httpStatus": 304, "checkedAt": iso(dt.datetime.now(UTC))}
            if response.status != 200:
                raise ValueError(f"Unexpected schedule HTTP status {response.status}")
            body = response.read(MAX_SOURCE_BYTES + 1)
            if not body or len(body) > MAX_SOURCE_BYTES:
                raise ValueError("Empty or oversized schedule source")
            retrieved = iso(dt.datetime.now(UTC))
            return body, {"id": "nflverse_games", "url": SOURCE_URL, "provider": "nflverse",
                          "status": "verified", "retrievedAt": retrieved, "checkedAt": retrieved,
                          "httpStatus": 200, "sha256": hashlib.sha256(body).hexdigest(),
                          "bytes": len(body), "etag": response.headers.get("ETag"),
                          "lastModified": response.headers.get("Last-Modified")}
    except urllib.error.HTTPError as exc:
        if exc.code == 304 and previous and not force:
            return None, {"httpStatus": 304, "checkedAt": iso(dt.datetime.now(UTC))}
        raise


def parse_games(body):
    reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig")))
    if not REQUIRED_COLUMNS.issubset(reader.fieldnames or []):
        raise ValueError("Schedule CSV is missing required game/result columns")
    return list(reader)


def score(value):
    if value is None or str(value).strip() in ("", "NA", "NaN", "nan", "null"):
        return None
    number = float(value)
    if not number.is_integer() or not 0 <= number <= 150:
        raise ValueError("Invalid NFL score")
    return int(number)


def normalized_games(rows, identities, season, now, require_full_schedule=True):
    selected = [row for row in rows if str(row.get("season")) == str(season) and row.get("game_type") == "REG"]
    if not selected:
        raise ValueError(f"No regular-season schedule for requested season {season}")
    team_ids = {team["abbr"] for team in identities}
    ids, appearances, team_weeks, games = set(), collections.Counter(), set(), []
    for row in selected:
        game_id, week = row["game_id"], int(row["week"])
        away, home = row["away_team"], row["home_team"]
        if not game_id or game_id in ids or not 1 <= week <= 18:
            raise ValueError("Duplicate game ID or invalid regular-season week")
        if away not in team_ids or home not in team_ids or away == home:
            raise ValueError("Unknown or duplicated game team")
        for team in (away, home):
            if (team, week) in team_weeks:
                raise ValueError("A team appears twice in the same regular-season week")
            team_weeks.add((team, week))
            appearances[team] += 1
        ids.add(game_id)
        date = dt.date.fromisoformat(row["gameday"])
        if date.year not in (season, season + 1) or (date.year == season + 1 and date.month != 1):
            raise ValueError("Regular-season date falls outside the requested season")
        kickoff = (dt.datetime.fromisoformat(f"{date.isoformat()}T{row['gametime']}").replace(tzinfo=ET)
                   if row.get("gametime") else None)
        away_score, home_score = score(row.get("away_score")), score(row.get("home_score"))
        if (away_score is None) != (home_score is None):
            raise ValueError("One-sided score cannot establish a final")
        is_final = away_score is not None and home_score is not None
        if is_final and ((kickoff and kickoff > now) or date > now.astimezone(ET).date()):
            raise ValueError("Future game has a reported final score")
        games.append({"id": game_id, "season": season, "seasonType": "REG", "week": week,
                      "gameday": date.isoformat(), "kickoffUtc": iso(kickoff) if kickoff else None,
                      "away_team": away, "home_team": home, "away_score": away_score,
                      "home_score": home_score, "status": "final" if is_final else "scheduled"})
    if require_full_schedule and (len(games) != 272 or {game["week"] for game in games} != set(range(1, 19))
                                  or set(appearances) != team_ids
                                  or any(count != 17 for count in appearances.values())):
        raise ValueError("Expected the complete 272-game, 17-games-per-team NFL schedule")
    return sorted(games, key=lambda game: (game["gameday"], game["kickoffUtc"] or "", game["id"]))


def browsing_week(games, now):
    """Source-date Tuesday 00:00 to next Tuesday 00:00 in New York."""
    starts = {}
    for game in games:
        date = dt.date.fromisoformat(game["gameday"])
        tuesday = date - dt.timedelta(days=(date.weekday() - 1) % 7)
        starts[game["week"]] = min(starts.get(game["week"], tuesday), tuesday)
    today = now.astimezone(ET).date()
    eligible = [week for week, start in starts.items() if start <= today]
    return max(eligible) if eligible else min(starts)


def coverage(games, through_week, now):
    """Counts are about scheduled results, independent of source-check age."""
    by_week, complete_through = {}, 0
    for week in sorted({game["week"] for game in games}):
        selected = [game for game in games if game["week"] == week]
        finals = sum(game["status"] == "final" for game in selected)
        pending = sum(game["status"] != "final" and (
            timestamp(game["kickoffUtc"]) <= now if game["kickoffUtc"] else
            dt.date.fromisoformat(game["gameday"]) < now.astimezone(ET).date()) for game in selected)
        by_week[str(week)] = {"finalGames": finals, "scheduledGames": len(selected),
                              "pendingStartedGames": pending, "complete": finals == len(selected)}
        if week == complete_through + 1 and finals == len(selected):
            complete_through = week
    selected_weeks = [value for week, value in by_week.items() if int(week) <= through_week]
    final_count = sum(value["finalGames"] for value in selected_weeks)
    scheduled_count = sum(value["scheduledGames"] for value in selected_weeks)
    pending_count = sum(value["pendingStartedGames"] for value in selected_weeks)
    return {"throughWeek": through_week, "completeThroughWeek": min(complete_through, through_week),
            "finalGames": final_count, "scheduledGames": scheduled_count,
            "pendingStartedGames": pending_count,
            "status": "complete" if final_count == scheduled_count else "partial",
            "byWeek": by_week}


def conference_records(identities, games):
    records = {team["abbr"]: {"id": team["id"], "abbr": team["abbr"], "name": team["name"],
               "fullName": team["fullName"], "w": 0, "l": 0, "ties": 0,
               "pointsFor": 0, "pointsAgainst": 0, "rank": None, "streak": "—"} for team in identities}
    form = collections.defaultdict(list)
    for game in games:
        for side, opponent in (("home", "away"), ("away", "home")):
            record = records[game[f"{side}_team"]]
            points_for, points_against = game[f"{side}_score"], game[f"{opponent}_score"]
            result = "W" if points_for > points_against else "L" if points_for < points_against else "T"
            record[{"W": "w", "L": "l", "T": "ties"}[result]] += 1
            record["pointsFor"] += points_for
            record["pointsAgainst"] += points_against
            form[record["abbr"]].append(result)
    for abbr, record in records.items():
        played = record["w"] + record["l"] + record["ties"]
        percentage = Fraction(2 * record["w"] + record["ties"], 2 * played) if played else Fraction(0)
        record["pct"] = f"{float(percentage):.3f}".removeprefix("0")
        record["record"] = f"{record['w']}–{record['l']}" + (f"–{record['ties']}" if record["ties"] else "")
        record["pointDifferential"] = record["pointsFor"] - record["pointsAgainst"]
        if form[abbr]:
            streak = list(reversed(form[abbr]))
            count = next((index for index, value in enumerate(streak) if value != streak[0]), len(streak))
            record["streak"] = f"{streak[0]}{count}"
        record["_pct"] = percentage
    conferences = {}
    for conference in ("AFC", "NFC"):
        rows = [records[team["abbr"]] for team in identities if team["conference"] == conference]
        rows.sort(key=lambda row: (-row["_pct"], -row["pointDifferential"], row["abbr"]))
        for index, row in enumerate(rows, 1):
            row["sortIndex"] = index
            del row["_pct"]
        conferences[conference] = rows
    return conferences


def build_snapshot(rows, identities, season, source, now, require_full_schedule=True):
    if len(identities) != 32 or len({team["abbr"] for team in identities}) != 32:
        raise ValueError("Expected 32 distinct team identities")
    if collections.Counter(team["conference"] for team in identities) != {"AFC": 16, "NFC": 16}:
        raise ValueError("Expected 16 teams in each conference")
    games = normalized_games(rows, identities, season, now, require_full_schedule)
    current_week = browsing_week(games, now)
    finals = [game for game in games if game["status"] == "final"]
    latest_final_week = max((game["week"] for game in finals), default=0)
    weeks = {}
    for week in sorted({game["week"] for game in games}):
        through = min(week if week == current_week else week - 1, latest_final_week)
        week_coverage = coverage(games, through, now)
        single = week_coverage["byWeek"].get(str(through), {"finalGames": 0, "scheduledGames": 0})
        weeks[str(week)] = {"throughWeek": through, "coverage": week_coverage,
            "completedGamesInThroughWeek": single["finalGames"],
            "scheduledGamesInThroughWeek": single["scheduledGames"],
            "conferences": conference_records(identities, [game for game in finals if game["week"] <= through])}
    current = weeks[str(current_week)]
    # A saved feed can have complete Week 5 records while Week 6 results are
    # overdue. Count those separately from the completed-record denominator;
    # source checks or a new calendar week must never hide missing results.
    current["coverage"]["pendingStartedGames"] = sum(
        item["pendingStartedGames"] for week, item in current["coverage"]["byWeek"].items()
        if int(week) <= current_week)
    elapsed_weeks = [game["week"] for game in games if game["week"] <= current_week and (
        timestamp(game["kickoffUtc"]) <= now if game["kickoffUtc"] else
        dt.date.fromisoformat(game["gameday"]) < now.astimezone(ET).date())]
    current["coverage"]["expectedThroughWeek"] = max(elapsed_weeks, default=0)
    if current["coverage"]["pendingStartedGames"]:
        current["coverage"]["status"] = "partial"
    return {"schemaVersion": 1, "season": season, "currentBrowsingWeek": current_week,
            "retrievedAt": source["retrievedAt"], "generatedAt": iso(now), "source": source,
            "ranking": {"method": "winning-percentage-points-differential", "official": False, "note": RANKING_NOTE},
            "crossCheck": {"status": "not-performed", "note": "Official ESPN/NFL records and conference seeding were not independently retrieved."},
            "coverage": current["coverage"], "teams": identities, "weeks": weeks, "games": finals,
            "schedule": games}


def validate_snapshot(snapshot, previous=None):
    if snapshot.get("schemaVersion") != 1 or not snapshot.get("weeks"):
        raise ValueError("Invalid standings snapshot schema")
    if snapshot.get("ranking", {}).get("official") is not False:
        raise ValueError("Derived records must not claim official NFL seeding")
    source = snapshot["source"]
    if source.get("url") != SOURCE_URL or source.get("status") != "verified" or len(source.get("sha256", "")) != 64:
        raise ValueError("Invalid standings source provenance")
    timestamp(source["retrievedAt"])
    if len({game["id"] for game in snapshot["games"]}) != len(snapshot["games"]):
        raise ValueError("Duplicate final game in standings snapshot")
    if any(game.get("status") != "final" or game.get("home_score") is None or game.get("away_score") is None
           for game in snapshot["games"]):
        raise ValueError("Standings results must contain genuine two-sided finals")
    for week in snapshot["weeks"].values():
        all_rows = sum(week["conferences"].values(), [])
        if len(all_rows) != 32 or len({row["abbr"] for row in all_rows}) != 32:
            raise ValueError("Standings must contain 32 distinct teams")
        if sum(row["pointsFor"] for row in all_rows) != sum(row["pointsAgainst"] for row in all_rows):
            raise ValueError("League points-for/against totals do not reconcile")
        wins, losses = sum(row["w"] for row in all_rows), sum(row["l"] for row in all_rows)
        ties = sum(row["ties"] for row in all_rows)
        if wins != losses or wins + ties // 2 != week["coverage"]["finalGames"] or ties % 2:
            raise ValueError("League wins/losses/ties do not reconcile to final games")
        expected = conference_records(snapshot["teams"], [game for game in snapshot["games"] if game["week"] <= week["throughWeek"]])
        if week["conferences"] != expected:
            raise ValueError("Team records, points or order do not reconcile to sourced finals")
    if previous and previous.get("season") == snapshot["season"]:
        previous_ids = {game["id"] for game in previous.get("games", [])}
        current_ids = {game["id"] for game in snapshot["games"]}
        if not previous_ids.issubset(current_ids):
            raise ValueError("Previously validated final games disappeared; preserving prior standings")


def compare_official_records(snapshot, official):
    """Compare an explicitly captured official export without inventing ranks.

    Export schema: {provider:'ESPN'|'NFL',url,retrievedAt,season,teams:
      [{abbr,w,l,ties}, ...32 teams]}. This optional capture never blocks the
    independent nflverse feed and cannot promote its order to official seeding.
    """
    provider = official.get("provider")
    parsed = urllib.parse.urlsplit(official.get("url", ""))
    allowed_hosts = {"ESPN": {"www.espn.com", "site.web.api.espn.com", "site.api.espn.com"},
                     "NFL": {"www.nfl.com", "api.nfl.com"}}
    if provider not in allowed_hosts or parsed.scheme != "https" or parsed.hostname not in allowed_hosts[provider]:
        raise ValueError("Official capture must identify an ESPN/NFL HTTPS source")
    if official.get("season") != snapshot["season"]:
        raise ValueError("Official capture belongs to a different season")
    timestamp(official["retrievedAt"])
    actual = {row["abbr"]: row for rows in snapshot["weeks"][str(snapshot["currentBrowsingWeek"])]["conferences"].values() for row in rows}
    captured = official.get("teams", [])
    if len(captured) != 32 or {row["abbr"] for row in captured} != set(actual):
        raise ValueError("Official capture must contain all 32 distinct team records")
    mismatches = []
    for row in captured:
        for field in ("w", "l", "ties"):
            if type(row.get(field)) is not int or row[field] < 0:
                raise ValueError("Invalid official record count")
        if any(row[field] != actual[row["abbr"]][field] for field in ("w", "l", "ties")):
            mismatches.append({"abbr": row["abbr"], "derived": {field: actual[row["abbr"]][field] for field in ("w", "l", "ties")},
                               "official": {field: row[field] for field in ("w", "l", "ties")}})
    return {"status": "records-match" if not mismatches else "records-differ", "provider": provider,
            "url": official["url"], "retrievedAt": official["retrievedAt"], "mismatches": mismatches,
            "note": "Record cross-check only; official conference seed and tie-break order are not verified."}


def atomic_write(path, snapshot):
    data = json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n"
    if path.exists() and path.read_text() == data:
        return False
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return True


def refresh(output, identity_path, force=False, check=False, official_path=None):
    identities_snapshot = json.loads(identity_path.read_text())
    season = identities_snapshot["season"]
    previous = json.loads(output.read_text()) if output.exists() else None
    if check:
        if not previous:
            raise ValueError("No saved standings snapshot exists")
        validate_snapshot(previous)
        return previous, False
    body, source = fetch_games(previous, force=force)
    now = dt.datetime.now(UTC)
    if body is None:
        validate_snapshot(previous)
        # Source content stays unchanged, but the browsing week and missing-
        # result coverage can roll over without requiring another large GET.
        print(json.dumps({"status": "unchanged", "checkedAt": source["checkedAt"], "httpStatus": 304}))
        if not previous.get("schedule"):
            return previous, False
        rows = [{"game_id": game["id"], "season": game["season"], "game_type": "REG", "week": game["week"],
                 "gameday": game["gameday"], "gametime": (timestamp(game["kickoffUtc"]).astimezone(ET).strftime("%H:%M")
                                                             if game["kickoffUtc"] else ""),
                 "away_team": game["away_team"], "home_team": game["home_team"],
                 "away_score": game["away_score"], "home_score": game["home_score"]} for game in previous["schedule"]]
        source = previous["source"]
    else:
        rows = parse_games(body)
    snapshot = build_snapshot(rows, identities_snapshot["teams"], season, source, now)
    if official_path:
        snapshot["crossCheck"] = compare_official_records(snapshot, json.loads(official_path.read_text()))
    if previous and previous.get("source", {}).get("sha256") == source["sha256"]:
        # A re-download cannot make unchanged data look newly updated. Rebuild
        # for calendar rollover, but retain the original source retrieval date.
        snapshot["retrievedAt"] = previous["retrievedAt"]
        snapshot["source"] = previous["source"]
        if not official_path:
            snapshot["crossCheck"] = previous.get("crossCheck", snapshot["crossCheck"])
        if body is not None:
            print(json.dumps({"status": "retrieved-unchanged", "checkedAt": source["checkedAt"], "httpStatus": 200}))
        if {key: value for key, value in snapshot.items() if key != "generatedAt"} == {
                key: value for key, value in previous.items() if key != "generatedAt"}:
            snapshot["generatedAt"] = previous["generatedAt"]
    validate_snapshot(snapshot, previous)
    return snapshot, atomic_write(output, snapshot)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate the saved feed without network access")
    parser.add_argument("--force", action="store_true", help="Unconditional full GET and validation")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/data/standings.json")
    parser.add_argument("--identities", type=Path, default=ROOT / "assets/data/current.json")
    parser.add_argument("--official-standings", type=Path, help="Optional normalized, actually retrieved ESPN/NFL records")
    args = parser.parse_args()
    try:
        snapshot, changed = refresh(args.output, args.identities, args.force, args.check, args.official_standings)
    except Exception as exc:
        print(f"Standings refresh failed; last validated data preserved: {exc}")
        return 1
    print(json.dumps({"status": "validated" if args.check else "updated" if changed else "unchanged",
                      "season": snapshot["season"], "currentBrowsingWeek": snapshot["currentBrowsingWeek"],
                      "throughWeek": snapshot["coverage"]["throughWeek"],
                      "finalGames": snapshot["coverage"]["finalGames"],
                      "sourceRetrievedAt": snapshot["source"]["retrievedAt"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
