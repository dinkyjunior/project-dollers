#!/usr/bin/env python3
"""Audit retained weekly fixture coverage without requesting new sports data.

Run from any directory. An optional first argument selects the JSON receipt path.
This checks source books and checksum-bound report files independently of the UI.
It does not assert that retained sources match today's official NFL standings.
"""
import collections
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("weekly-source-audit.json")
FILES = ["current.json", "team-details.json", "matchup-breakdown.json", "game-reports.json"]
books = {name: json.loads((ROOT / "assets/data" / name).read_text()) for name in FILES}
checks = []


def check(name, ok, detail=None):
    checks.append({"name": name, "passed": bool(ok), **({"detail": detail} if detail is not None else {})})


def selected_games(book):
    copies = collections.defaultdict(list)
    for abbr, club in book["teams"].items():
        for game in club["games"]:
            if game["season"] == book["season"] and game.get("seasonType", "REG") == "REG":
                copies[game["id"]].append((abbr, game))
    return copies


current, teams, matchups, reports = (books[name] for name in FILES)
season = current["season"]
copies = selected_games(teams)
matchup_copies = selected_games(matchups)
fixtures = {game_id: rows[0][1] for game_id, rows in copies.items()}
check("Season aligns across all four books", all(book["season"] == season for book in books.values()))
check("32 source team identities", len(teams["teams"]) == 32)
check("272 unique regular-season fixtures", len(fixtures) == 272)
check("Each fixture has exactly the two participating team copies", all(
    len(rows) == 2 and {abbr for abbr, _ in rows} == {rows[0][1]["home_team"], rows[0][1]["away_team"]}
    for rows in copies.values()
))
check("Duplicate team copies are byte-equivalent JSON values", all(
    len({json.dumps(game, sort_keys=True) for _, game in rows}) == 1 for rows in copies.values()
))
check("Matchup research covers exactly the same fixture IDs", set(copies) == set(matchup_copies))
basic_fields = ("id", "season", "week", "status", "home_team", "away_team", "home_score", "away_score", "kickoffUtc", "venue")
check("Fixture identity, result, venue and kickoff agree with matchup research", all(
    all(game.get(key) == matchup_copies[game_id][0][1].get(key) for key in basic_fields)
    for game_id, game in fixtures.items()
))
check("Team location labels can be derived from retained full names", all(
    club.get("name") and club.get("fullName") and club["name"] in club["fullName"]
    and club["fullName"].replace(club["name"], "").strip()
    for club in teams["teams"].values()
))
check("All existing recap IDs refer to the same complete fixture", all(
    game["id"] in fixtures and all(game.get(key) == fixtures[game["id"]].get(key) for key in basic_fields)
    for week in current["weeks"].values() for game in week.get("recap", [])
))

EXPECTED_COUNTS = [16, 16, 16, 16, 15, 14, 14, 14, 15, 14, 13, 16, 14, 15, 16, 16, 16, 16]
weeks = []
for week in range(1, 19):
    games = sorted((game for game in fixtures.values() if game["week"] == week), key=lambda game: (game.get("kickoffUtc") or game.get("gameday") or "", game["id"]))
    participants = [abbr for game in games for abbr in (game["away_team"], game["home_team"])]
    check(f"Week {week} complete retained fixture count", len(games) == EXPECTED_COUNTS[week - 1])
    check(f"Week {week} no team scheduled twice", len(participants) == len(set(participants)))
    check(f"Week {week} no invented scores for scheduled games", all(
        game["status"] != "scheduled" or game["home_score"] is None and game["away_score"] is None for game in games
    ))
    finals = [game for game in games if game["status"] == "final"]
    check(f"Week {week} every final has an event-specific report", all(game["id"] in reports["games"] for game in finals))
    weeks.append({
        "week": week,
        "games": len(games),
        "statusCounts": dict(collections.Counter(game["status"] for game in games)),
        "reportGames": len([game for game in games if game["id"] in reports["games"]]),
        "byeTeams": sorted(set(teams["teams"]) - set(participants)),
        "gameIds": [game["id"] for game in games],
        "reportUnavailable": [game["id"] for game in games if game["id"] not in reports["games"]],
    })

report_checks = []
for game in fixtures.values():
    if game["status"] != "final":
        continue
    entry = reports["games"].get(game["id"], {})
    detail_path = ROOT / entry.get("detailUrl", "missing")
    raw = detail_path.read_bytes() if detail_path.is_file() else b""
    detail = json.loads(raw) if raw else {}
    report_checks.append({
        "id": game["id"],
        "identityMatches": all(game.get(key) == entry.get(key) == detail.get(key) for key in basic_fields if key not in {"kickoffUtc", "venue"}),
        "eventIdMatches": str(game.get("espnEventId")) == str(entry.get("espnEventId")),
        "checksumMatches": hashlib.sha256(raw).hexdigest() == entry.get("sha256"),
        "byteCountMatches": len(raw) == entry.get("bytes"),
        "verifiedFinal": entry.get("verification", {}).get("status") == "verified" and detail.get("status") == "final",
    })
check("All 78 retained finals have correct report identity, event ID, checksum and bytes", len(report_checks) == 78 and all(
    all(value for key, value in row.items() if key != "id") for row in report_checks
), {"reportsChecked": len(report_checks)})

receipt = {
    "scope": "Retained 2026 regular-season sources; no live official reconciliation or network request",
    "season": season,
    "retrievedAt": {name: book["retrievedAt"] for name, book in books.items()},
    "sourceBookSha256": {name: hashlib.sha256((ROOT / "assets/data" / name).read_bytes()).hexdigest() for name in FILES},
    "checks": checks,
    "passed": all(item["passed"] for item in checks),
    "weeks": weeks,
    "reportChecks": report_checks,
    "limitation": "Source freshness and the reported official NFL standings discrepancy remain unresolved. A scheduled fixture is not a completed game report.",
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"passed": receipt["passed"], "checks": len(checks), "games": len(fixtures), "reports": len(report_checks), "receipt": str(OUTPUT)}, indent=2))
sys.exit(0 if receipt["passed"] else 1)
