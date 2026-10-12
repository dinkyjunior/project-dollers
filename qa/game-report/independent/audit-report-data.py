#!/usr/bin/env python3
"""Read-only independent report/source joins; never import the report builder."""
import argparse
import csv
import datetime
import gzip
import hashlib
import io
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
ALIAS = {"STL": "LA", "LAR": "LA", "SD": "LAC", "OAK": "LV", "WSH": "WAS"}


def club(value):
    return ALIAS.get(value, value)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def numeric(value):
    if value is None or value == "" or value == "—" or value == "-":
        return None
    try:
        number = float(str(value).replace(",", "").replace("%", ""))
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def pair(value):
    for separator in ("/", "-"):
        parts = str(value).split(separator)
        if len(parts) == 2:
            return tuple(numeric(part) for part in parts)
    return None, None


def run(cache, output):
    report = {"startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "status": "running", "assertions": 0, "games": [], "failures": [],
              "qualification": "Independent raw public-provider response checksums, event and quarter arithmetic, named player field joins, team statistics and game-history link coverage. Primary source cache retained by the data agent; independent fresh strict-TLS ESPN/NFLverse retrievals additionally crosscheck selected events. Does not establish official inactives, starts or unavailable advanced tracking."}

    def check(condition, description, context=None):
        report["assertions"] += 1
        if not condition:
            report["failures"].append({"description": description, "context": context})

    index_body = (ROOT / "assets/data/game-reports.json").read_bytes()
    index = json.loads(index_body)
    report["indexSha256"] = sha(index_body)
    books = {name: json.loads((ROOT / "assets/data" / name).read_bytes())
             for name in ("team-details.json", "matchup-breakdown.json")}
    for filename, field in (("team-details.json", "teamDetailsSha256"),
                            ("matchup-breakdown.json", "matchupBreakdownSha256")):
        check(index.get("dependencies", {}).get(field) == sha((ROOT / "assets/data" / filename).read_bytes()),
              "Report index binds exact current input book", {"dataset": filename})
    needed = {g["id"] for book in books.values() for team in book["teams"].values()
              for g in team.get("games", []) + team.get("headToHeadGames", [])
              if g.get("status") == "final"}
    check(needed <= set(index["games"]), "Every existing completed Team/Matchup/H2H entry has its own report", sorted(needed - set(index["games"])))
    fresh_nfl = {row["game_id"]: row for row in csv.DictReader(io.StringIO(gzip.decompress(
        (HERE / "source-check/nflverse-games.csv.gz").read_bytes()).decode()))}
    source_fields = {"totalYards": "totalOffense", "netPassingYards": "netPassing",
                     "rushingYards": "rushing", "turnovers": "turnovers",
                     "firstDowns": "firstDowns", "totalOffensivePlays": "plays",
                     "rushingAttempts": "rushingAttempts", "yardsPerPlay": "yardsPerPlay",
                     "yardsPerPass": "yardsPerPass", "yardsPerRushAttempt": "yardsPerRush"}
    player_fields = {"passingYards": "passingYards", "passingTouchdowns": "passingTD",
                     "interceptions": "interceptions", "yardsPerPassAttempt": "yardsPerAttempt",
                     "adjQBR": "qbr", "QBRating": "passerRating", "rushingAttempts": "carries",
                     "rushingYards": "rushingYards", "rushingTouchdowns": "rushingTD",
                     "yardsPerRushAttempt": "yardsPerCarry", "longRushing": "longRush",
                     "receptions": "receptions", "receivingTargets": "targets",
                     "receivingYards": "receivingYards", "receivingTouchdowns": "receivingTD"}
    for game_id, entry in index["games"].items():
        context = {"game": game_id}
        detail_path = ROOT / entry["detailUrl"]
        check(detail_path.is_file(), "Report detail exists", context)
        if not detail_path.is_file():
            continue
        detail_body = detail_path.read_bytes()
        detail = json.loads(detail_body)
        check(sha(detail_body) == entry["sha256"], "Index checksum matches immutable report", context)
        check(len(detail_body) == entry["bytes"], "Index byte count matches report", context)
        check(detail["id"] == game_id, "Report canonical event identity", context)
        check(index["eventIdToGameId"].get(str(entry["espnEventId"])) == game_id, "Numeric ESPN alias maps to exact event", context)
        nfl = fresh_nfl.get(game_id)
        check(nfl is not None, "Fresh independent NFLverse source has this exact game", context)
        if nfl:
            for field in ("season", "week", "home_score", "away_score"):
                check(numeric(detail.get(field)) == numeric(nfl.get(field)), "Independent NFLverse " + field, context)
            for field in ("home_team", "away_team"):
                check(club(detail.get(field)) == club(nfl.get(field)), "Independent NFLverse " + field, context)
            check(str(entry["espnEventId"]) == str(nfl.get("espn")), "Independent NFLverse ESPN ID", context)
        raw_path = cache / ("espn-summary-" + str(entry["espnEventId"]) + ".json")
        source = next((s for s in detail["sources"] if s["id"] == "espn_game_report_" + str(entry["espnEventId"])), None)
        check(source is not None, "Report has own selected-event provenance", context)
        if not raw_path.exists() or not source or source.get("status") != "verified":
            check(not detail.get("players") or not any(detail["players"].values()), "Unavailable raw source cannot fabricate players", context)
            report["games"].append({"game": game_id, "status": "unavailable", "bytes": len(detail_body)})
            continue
        raw_body = raw_path.read_bytes()
        check(source.get("sha256") == sha(raw_body), "Source raw-response SHA bound to report", context)
        check(source.get("bytes") == len(raw_body), "Source exact raw-response byte count", context)
        check(source.get("httpStatus") == 200 and source.get("tlsVerified") is True, "Verified source HTTP200 and strict TLS", context)
        raw = json.loads(raw_body)
        competition = raw["header"]["competitions"][0]
        check(competition.get("status", {}).get("type", {}).get("completed") is True, "Raw source event completed", context)
        check(int(raw["header"]["season"]["year"]) == int(detail["season"]), "Raw source season exact", context)
        check(int(raw["header"]["week"]) == int(detail["week"]), "Raw source week exact", context)
        context_issues = {d.get("field"): d for d in detail.get("disagreements", [])
                          if not d.get("team") and not d.get("playerId")}
        def instant(value):
            return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
        kickoff_issue = context_issues.get("kickoffUtc")
        if kickoff_issue:
            check(detail.get("kickoffUtc") is None and competition.get("date") in kickoff_issue.get("values", [])
                  or detail.get("kickoffUtc") is None and instant(competition.get("date")) in [instant(v) for v in kickoff_issue.get("values", [])],
                  "Disputed kickoff is unavailable with both actual provider instants", context)
        else:
            check(instant(detail.get("kickoffUtc")) == instant(competition.get("date")),
                  "Selected-game kickoff matches actual source instant", context)
        neutral_issue = context_issues.get("neutralSite")
        if neutral_issue:
            check(detail.get("neutralSite") is None and competition.get("neutralSite") in neutral_issue.get("values", []),
                  "Disputed neutral designation remains unavailable with source values", context)
        else:
            check(detail.get("neutralSite") == competition.get("neutralSite"), "Selected-event neutral classification exact", context)
        raw_venue = raw.get("gameInfo", {}).get("venue", {}).get("fullName")
        if raw_venue and detail.get("venue") != raw_venue:
            venue_issue = context_issues.get("venue")
            check(bool(venue_issue) and detail.get("venue") in venue_issue["values"] and raw_venue in venue_issue["values"],
                  "Historical stadium naming differences are explicitly disclosed with both labels", context)
        for competitor in competition["competitors"]:
            team = next((abbr for abbr in [detail["home_team"], detail["away_team"]]
                         if club(abbr) == club(competitor["team"]["abbreviation"])), None)
            check(team is not None, "Raw competitor matches selected-event franchise", context)
            if team is None:
                continue
            score = detail["home_score" if team == detail["home_team"] else "away_score"]
            check(numeric(score) == numeric(competitor["score"]), "Raw final score exact", {**context, "team": team})
            quarters = [numeric(v.get("displayValue", v.get("value"))) for v in competitor.get("linescores", [])]
            if quarters and all(v is not None for v in quarters):
                check(detail["quarters"].get(team) == quarters, "All actual quarters incl overtime exact", {**context, "team": team})
                check(sum(quarters) == score, "Quarter sum reconciles final score", {**context, "team": team})
        disputed = {(d.get("team"), str(d.get("field", "")).split(".")[-1]) for d in detail.get("disagreements", []) if str(d.get("field", "")).startswith("stats.")}
        for raw_team in raw.get("boxscore", {}).get("teams", []):
            team = next((abbr for abbr in detail["stats"] if club(abbr) == club(raw_team["team"]["abbreviation"])), None)
            check(team is not None, "Team stat row belongs to event", context)
            if team is None:
                continue
            values = {v["name"]: v.get("displayValue") for v in raw_team.get("statistics", [])}
            expected = {field: numeric(values[name]) for name, field in source_fields.items() if name in values}
            for raw_name, fields in {"thirdDownEff": ("thirdDownMade", "thirdDownAttempts"), "fourthDownEff": ("fourthDownMade", "fourthDownAttempts"), "redZoneAttempts": ("redZoneTD", "redZoneAttempts"), "totalPenaltiesYards": ("penalties", "penaltyYards"), "sacksYardsLost": ("sacks", "sackYardsLost"), "completionAttempts": ("completions", "passingAttempts")}.items():
                if raw_name in values:
                    expected.update(zip(fields, pair(values[raw_name])))
            if "possessionTime" in values:
                expected["possession"] = values["possessionTime"]
            for field, value in expected.items():
                actual = detail["stats"][team].get(field)
                if (team, field) in disputed:
                    check(actual is None, "Disputed team cell remains unavailable", {**context, "team": team, "field": field})
                elif field == "sackYardsLost" and any(d.get("team") == team and d.get("field") == "players.sackYardsLost" for d in detail.get("disagreements", [])):
                    reasons = [item for item in detail.get("unavailable", []) if item.get("team") == team and item.get("field") == f"stats.{team}.sackYardsLost"]
                    source_ids = {sid for d in detail.get("disagreements", []) if d.get("team") == team and d.get("field") == "players.sackYardsLost" for sid in d.get("sourceIds", [])}
                    check(actual is None and len(reasons) == 1 and set(reasons[0].get("sourceIds", [])) == source_ids and detail.get("statsProvenance", {}).get(team, {}).get("fieldStatus", {}).get(field) == "unavailable", "Actual disputed player sack loss invalidates dependent team total with exact typed provenance", {**context, "team": team, "field": field})
                else:
                    check(actual == value, "Team stat exact raw provider value", {**context, "team": team, "field": field, "actual": actual, "expected": value})
            stats = detail["stats"][team]
            if all(stats.get(k) is not None for k in ("netPassing", "rushing", "totalOffense")):
                check(stats["netPassing"] + stats["rushing"] == stats["totalOffense"], "Net passing plus rush reconciles team total", {**context, "team": team})
        players = 0
        for raw_team in raw.get("boxscore", {}).get("players", []):
            team = next((abbr for abbr in detail["players"] if club(abbr) == club(raw_team["team"]["abbreviation"])), None)
            check(team is not None, "Player category belongs to selected-event team", context)
            if team is None:
                continue
            by_id = {str(p["espnId"]): p for p in detail["players"][team]}
            for category in raw_team.get("statistics", []):
                for raw_player in category.get("athletes", []):
                    identity = raw_player.get("athlete", {})
                    player = by_id.get(str(identity.get("id")))
                    check(player is not None, "Every raw named performance is represented", {**context, "team": team, "player": identity.get("id"), "category": category.get("name")})
                    if player is None:
                        continue
                    players += 1
                    check(player["name"] == identity["displayName"], "Player exact source name", context)
                    check(category["name"] in player["categories"], "Actual source-recorded category retained", context)
                    raw_keys = category.get("keys") or category.get("names") or []
                    check(bool(raw_keys), "Raw player category publishes semantic field names", {**context, "category": category["name"]})
                    raw_stats = dict(zip(raw_keys, raw_player.get("stats", [])))
                    check(player.get("rawStats", {}).get(category["name"]) == raw_stats,
                          "Every published player field retained exactly in full raw statistics",
                          {**context, "team": team, "player": player["id"], "category": category["name"]})
                    expected = {player_fields[k]: numeric(v) for k, v in raw_stats.items()
                                if k in player_fields and (k != "interceptions" or category["name"] == "passing")}
                    for raw_name, fields in {"completions/passingAttempts": ("completions", "attempts"), "sacks-sackYardsLost": ("sacks", "sackYardsLost")}.items():
                        if raw_name in raw_stats:
                            expected.update(zip(fields, pair(raw_stats[raw_name])))
                    for field, value in expected.items():
                        issue = any(d.get("playerId") in [player["id"], player.get("nflverseId")]
                                    and str(d.get("field", "")).split(".")[-1] == field
                                    for d in detail.get("disagreements", []))
                        actual = player["stats"].get(field)
                        check(actual is None if issue else actual == value, "Player field is exact or explicitly disputed", {**context, "team": team, "player": player["id"], "field": field, "actual": actual, "expected": value})
            raw_ids = {str(p.get("athlete", {}).get("id")) for category in raw_team.get("statistics", []) for p in category.get("athletes", [])}
            check(set(by_id) == raw_ids, "No substituted or fabricated report player", {**context, "team": team})
        historical_inactives = detail.get("availability", {}).get("historicalInactives") or {}
        check(historical_inactives.get("status") != "verified" or bool(historical_inactives.get("sourceIds")), "Official historical inactives cannot be inferred without provenance", context)
        raw_drives = list(raw.get("drives", {}).get("previous", []))
        if raw.get("drives", {}).get("current"):
            raw_drives.append(raw["drives"]["current"])
        drives_by_id = {str(d["id"]): d for d in raw_drives if d.get("id") is not None}
        check({d["id"] for d in detail.get("drives", [])} == set(drives_by_id),
              "Every available raw drive represented without invented drives", context)
        for drive in detail.get("drives", []):
            original = drives_by_id[drive["id"]]
            for field, expected in {"description": original.get("description"),
                                    "yards": numeric(original.get("yards")),
                                    "plays": numeric(original.get("offensivePlays")),
                                    "duration": original.get("timeElapsed", {}).get("displayValue"),
                                    "result": original.get("displayResult") or original.get("result")}.items():
                check(drive.get(field) == expected, "Drive field exact raw source",
                      {**context, "drive": drive["id"], "field": field})
        play_sources = {str(p["id"]): p for d in raw_drives for p in d.get("plays", []) if p.get("id") is not None}
        check({p["id"] for p in detail.get("plays", [])} == set(play_sources),
              "Every available raw play represented once without invented plays", context)
        for row in detail.get("plays", []) + detail.get("scoringPlays", []):
            original = next((p for p in raw.get("scoringPlays", []) if str(p.get("id")) == row["id"]), None) if row.get("driveId") is None else play_sources.get(row["id"])
            check(original is not None, "Play has its actual provider source record", {**context, "play": row["id"]})
            if original is None:
                continue
            expected_fields = {"text": original.get("text"), "quarter": numeric(original.get("period", {}).get("number")),
                               "clock": original.get("clock", {}).get("displayValue"), "type": original.get("type", {}).get("text"),
                               "homeScore": numeric(original.get("homeScore")), "awayScore": numeric(original.get("awayScore")),
                               "yards": numeric(original.get("statYardage")), "down": numeric(original.get("start", {}).get("down")),
                               "distance": numeric(original.get("start", {}).get("distance"))}
            for field, value in expected_fields.items():
                check(row.get(field) == value, "Play field exact raw source",
                      {**context, "play": row["id"], "field": field})
        report["games"].append({"game": game_id, "status": "verified", "sourceSha256": sha(raw_body), "detailSha256": sha(detail_body), "bytes": len(detail_body), "rawCategoryRows": players})
    report["freshIndependentSelectedEvents"] = []
    for event in ("401872967", "401872980"):
        independent = json.loads((HERE / "source-check" / ("espn-" + event + ".json")).read_bytes())
        game_id = index["eventIdToGameId"].get(event)
        if not game_id:
            continue
        detail = json.loads((ROOT / index["games"][game_id]["detailUrl"]).read_bytes())
        for team in independent["header"]["competitions"][0]["competitors"]:
            abbr = team["team"]["abbreviation"]
            check(detail["quarters"].get(abbr) == [numeric(q["displayValue"]) for q in team["linescores"]], "Separate independently retrieved ESPN quarter crosscheck", {"game": game_id, "team": abbr})
        report["freshIndependentSelectedEvents"].append({"eventId": event, "gameId": game_id})
    report["sourceStable"] = sha((ROOT / "assets/data/game-reports.json").read_bytes()) == report["indexSha256"]
    check(report["sourceStable"], "Report index unchanged throughout read-only audit")
    report["status"] = "passed" if not report["failures"] else "failed"
    report["completedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "assertions": report["assertions"], "games": len(report["games"]), "failures": len(report["failures"]), "output": str(output)}))
    if report["failures"]:
        print(json.dumps(report["failures"][:15], indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path("/workspace/recovery-qa/game-report-source-cache"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raise SystemExit(run(args.cache_dir, args.output))
