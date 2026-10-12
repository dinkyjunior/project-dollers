#!/usr/bin/env python3
"""Build checksum-bound, lazy historical NFL reports from public ESPN summaries.

The team-detail schedule is the independent final-score/context gate. Existing
validated archival reports are reused; only new games and current-week finals
are retrieved routinely. --refresh-history explicitly rechecks older finals.
No present-day injuries are represented as a historical game's inactive list.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "assets/data/game-reports.json"
DETAILS = ROOT / "assets/data/game-reports"
UTC = dt.timezone.utc
_spec = importlib.util.spec_from_file_location("pd_refresh", ROOT / "scripts/refresh-data.py")
refresh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(refresh)
ALIASES = {"WSH": "WAS", "LAR": "LA", "STL": "LA", "JAC": "JAX", "OAK": "LV", "SD": "LAC"}
COUNT_FIELDS = {
    "passingYards": "passingYards", "passingTouchdowns": "passingTD", "interceptions": "interceptions",
    "rushingAttempts": "carries", "rushingYards": "rushingYards", "rushingTouchdowns": "rushingTD",
    "receptions": "receptions", "receivingYards": "receivingYards", "receivingTouchdowns": "receivingTD",
    "receivingTargets": "targets", "longRushing": "longRush", "longReception": "longReception",
    "fumbles": "fumbles", "fumblesLost": "fumblesLost", "fumblesRecovered": "fumblesRecovered",
    "totalTackles": "totalTackles", "soloTackles": "soloTackles", "sacks": "defensiveSacks",
    "tacklesForLoss": "tacklesForLoss", "passesDefended": "passesDefended", "QBHits": "quarterbackHits",
    "defensiveTouchdowns": "defensiveTD", "interceptionYards": "interceptionReturnYards",
    "interceptionTouchdowns": "interceptionTD", "kickReturns": "kickoffReturns",
    "kickReturnYards": "kickoffReturnYards", "longKickReturn": "longKickoffReturn",
    "kickReturnTouchdowns": "kickoffReturnTD", "puntReturns": "puntReturns", "puntReturnYards": "puntReturnYards",
    "longPuntReturn": "longPuntReturn", "puntReturnTouchdowns": "puntReturnTD", "longFieldGoalMade": "fieldGoalLong",
    "totalKickingPoints": "kickingPoints", "punts": "punts", "puntYards": "puntYards",
    "touchbacks": "puntTouchbacks", "puntsInside20": "puntsInside20", "longPunt": "puntLong",
}
RATE_FIELDS = {"yardsPerPassAttempt": "yardsPerAttempt", "yardsPerRushAttempt": "yardsPerCarry",
               "yardsPerReception": "yardsPerReception", "adjQBR": "qbr", "QBRating": "passerRating",
               "yardsPerKickReturn": "yardsPerKickoffReturn", "yardsPerPuntReturn": "yardsPerPuntReturn",
               "fieldGoalPct": "fieldGoalPct", "grossAvgPuntYards": "grossAvgPuntYards"}
PAIR_FIELDS = {"completions/passingAttempts": ("completions", "attempts"),
               "sacks-sackYardsLost": ("sacks", "sackYardsLost"),
               "fieldGoalsMade/fieldGoalAttempts": ("fieldGoalsMade", "fieldGoalAttempts"),
               "extraPointsMade/extraPointAttempts": ("extraPointsMade", "extraPointAttempts")}
BASIC_FIELDS = ("completions", "attempts", "passingYards", "passingTD", "interceptions", "sacks", "sackYardsLost",
                "carries", "rushingYards", "rushingTD", "receptions", "targets", "receivingYards", "receivingTD")


def now():
    return refresh.iso(dt.datetime.now(UTC))


def abbr(value):
    return ALIASES.get(value, value)


def mapping(value):
    return value if isinstance(value, dict) else {}


def sequence(value):
    return value if isinstance(value, list) else []


def records(value):
    return [row for row in sequence(value) if isinstance(row, dict)]


def numeric(value):
    try:
        if value in (None, "", "--", "—", "-", "N/A"):
            return None
        n = float(str(value).replace(",", ""))
        return int(n) if math.isfinite(n) and n.is_integer() else n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def pair(value):
    if not isinstance(value, str):
        return None, None
    parts = value.replace("/", "-").split("-")
    return tuple(numeric(v) for v in parts) if len(parts) == 2 else (None, None)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(body)
    temporary.replace(path)
    return hashlib.sha256(body).hexdigest(), len(body)


def fetch_summary(event_id, cache_dir, use_cache=False):
    if not re.fullmatch(r"[0-9]{6,12}", str(event_id)):
        raise ValueError("Invalid public ESPN event ID")
    url = f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event_id}"
    source = {"id": f"espn_game_report_{event_id}", "provider": "ESPN", "url": url, "required": False,
              "tlsVerified": True}
    cache = Path(cache_dir) / f"espn-summary-{event_id}.json" if cache_dir else None
    saved = {}
    if cache and cache.exists() and cache.with_suffix(".meta.json").exists():
        try:
            saved = mapping(json.loads(cache.with_suffix(".meta.json").read_text()))
            body = cache.read_bytes()
            cached_summary = mapping(json.loads(body))
            stamp = dt.datetime.fromisoformat(str(saved.get("retrievedAt", "")).replace("Z", "+00:00"))
            if saved.get("status") != "verified" or saved.get("url") != url or saved.get("sha256") != hashlib.sha256(body).hexdigest() or saved.get("bytes") != len(body) or saved.get("httpStatus") != 200 or saved.get("tlsVerified") is not True or stamp.tzinfo is None or str(mapping(cached_summary.get("header")).get("id")) != str(event_id):
                saved = {}
        except (OSError, ValueError, TypeError):
            saved = {}
    if use_cache and saved:
        return cached_summary, saved
    last_error = None
    for attempt in range(3):
        headers = {"User-Agent": "ProjectDollarDataRefresh/1.0 public-data-audit", "Accept": "application/json"}
        if saved.get("etag"):
            headers["If-None-Match"] = saved["etag"]
        if saved.get("lastModified"):
            headers["If-Modified-Since"] = saved["lastModified"]
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=35, context=refresh.verified_ssl_context()) as response:
                body = response.read()
                result = mapping(json.loads(body))
                if str(mapping(result.get("header")).get("id")) != str(event_id):
                    raise ValueError("Summary event identity does not match requested event")
                source.update(status="verified", retrievedAt=now(), httpStatus=response.status,
                              etag=response.headers.get("ETag"), lastModified=response.headers.get("Last-Modified"),
                              sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))
                if cache:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    cache.write_bytes(body)
                    cache.with_suffix(".meta.json").write_text(json.dumps(source, indent=2) + "\n")
                return result, source
        except urllib.error.HTTPError as exc:
            if exc.code == 304 and saved:
                source.update(saved, checkedAt=now(), checkHttpStatus=304)
                return json.loads(cache.read_bytes()), source
            last_error = str(exc)
            if exc.code not in (429, 500, 502, 503, 504):
                break
            time.sleep(min(8, 2 ** (attempt + 1)))
        except Exception as exc:
            last_error = str(exc)
            if attempt < 2:
                time.sleep(2 ** attempt)
    source.update(status="unavailable", retrievedAt=now(), error=last_error)
    return None, source


def normalized_statistics(summary, game, source_id, disagreements):
    result, provenance = {}, {}
    for team in records(mapping(summary.get("boxscore")).get("teams")):
        team_abbr = abbr(mapping(team.get("team")).get("abbreviation"))
        if team_abbr not in (game["home_team"], game["away_team"]):
            continue
        raw = {row.get("name"): row.get("displayValue") for row in records(team.get("statistics"))}
        third, third_att = pair(raw.get("thirdDownEff"))
        fourth, fourth_att = pair(raw.get("fourthDownEff"))
        red, red_att = pair(raw.get("redZoneAttempts"))
        penalties, penalty_yards = pair(raw.get("totalPenaltiesYards"))
        sacks, sack_yards = pair(raw.get("sacksYardsLost"))
        completions, attempts = pair(raw.get("completionAttempts"))
        values = {"totalOffense": numeric(raw.get("totalYards")), "netPassing": numeric(raw.get("netPassingYards")),
                  "rushing": numeric(raw.get("rushingYards")), "turnovers": numeric(raw.get("turnovers")),
                  "thirdDownMade": third, "thirdDownAttempts": third_att, "fourthDownMade": fourth,
                  "fourthDownAttempts": fourth_att, "redZoneTD": red, "redZoneAttempts": red_att,
                  "possession": raw.get("possessionTime"), "penalties": penalties, "penaltyYards": penalty_yards,
                  "firstDowns": numeric(raw.get("firstDowns")), "plays": numeric(raw.get("totalOffensivePlays")),
                  "rushingAttempts": numeric(raw.get("rushingAttempts")), "sacks": sacks, "sackYardsLost": sack_yards,
                  "completions": completions, "passingAttempts": attempts,
                  "yardsPerPlay": numeric(raw.get("yardsPerPlay")), "yardsPerPass": numeric(raw.get("yardsPerPass")),
                  "yardsPerRush": numeric(raw.get("yardsPerRushAttempt"))}
        fields = {key: [source_id] for key, value in values.items() if value is not None}
        for field, prior in game.get("stats", {}).get(team_abbr, {}).items():
            value = values.get(field)
            if prior is not None and value is not None:
                prior_sources = game.get("statsProvenance", {}).get(team_abbr, {}).get("fieldSources", {}).get(field, [])
                if value != prior:
                    disagreements.append({"team": team_abbr, "field": f"stats.{field}", "values": [prior, value],
                                          "sourceIds": list(dict.fromkeys([*prior_sources, source_id])),
                                          "action": "Value unavailable pending provider reconciliation"})
                    values[field] = None
                else:
                    fields[field] = list(dict.fromkeys([*prior_sources, source_id]))
        if all(values.get(k) is not None for k in ("totalOffense", "netPassing", "rushing")):
            if values["totalOffense"] != values["netPassing"] + values["rushing"]:
                disagreements.append({"team": team_abbr, "field": "stats.totalOffense", "sourceIds": [source_id],
                                      "values": [values["totalOffense"], values["netPassing"] + values["rushing"]],
                                      "action": "Total offense unavailable: does not equal net passing plus rushing"})
                values["totalOffense"] = None
        result[team_abbr] = values
        provenance[team_abbr] = {"status": "disputed" if any(d.get("team") == team_abbr and d["field"].startswith("stats.") for d in disagreements) else "verified" if any(v is not None for v in values.values()) else "unavailable",
                                 "origin": "reported", "sourceIds": [source_id], "fieldSources": fields,
                                 "note": "Net passing accounts for sack yards. Unreported values are null, not zero."}
    return result, provenance


def normalize_players(summary, game, source_id, player_checks, positions, disagreements):
    result = {game["home_team"]: [], game["away_team"]: []}
    for team in records(mapping(summary.get("boxscore")).get("players")):
        team_abbr = abbr(mapping(team.get("team")).get("abbreviation"))
        if team_abbr not in result:
            continue
        merged = {}
        for category in records(team.get("statistics")):
            kind = category.get("name")
            for row in records(category.get("athletes")):
                athlete = mapping(row.get("athlete"))
                athlete_id = str(athlete.get("id", ""))
                if not athlete_id or not athlete.get("displayName"):
                    continue
                reported_position = mapping(athlete.get("position")).get("abbreviation")
                roster_position = positions.get((game["season"], team_abbr, athlete_id))
                player = merged.setdefault(athlete_id, {"id": athlete_id, "espnId": athlete_id,
                    "name": athlete["displayName"], "position": reported_position or roster_position,
                    "positionProvenance": {"status": "verified" if reported_position or roster_position else "unavailable",
                                           "sourceIds": [source_id] if reported_position else ["nflverse_roster"] if roster_position else [],
                                           "context": "Final boxscore" if reported_position else f"{game['season']} team roster" if roster_position else "Not reported"},
                    "jersey": athlete.get("jersey"), "team": team_abbr,
                    "stats": {field: None for field in BASIC_FIELDS}, "categories": [], "rawStats": {},
                    "sourceIds": [source_id], "participation": "played",
                    "participationEvidence": {"status": "verified", "sourceIds": [source_id], "note": "Named in this final game's box score; full active/inactive list not inferred."},
                    "provenance": {"status": "verified", "origin": "reported", "sourceIds": [source_id], "fieldSources": {}}})
                player["categories"].append(kind)
                raw = dict(zip(sequence(category.get("keys")), sequence(row.get("stats"))))
                player["rawStats"][kind] = raw
                for key, value in raw.items():
                    if key in PAIR_FIELDS:
                        a, b = pair(value)
                        for field, n in zip(PAIR_FIELDS[key], (a, b)):
                            if n is not None:
                                player["stats"][field] = n
                                player["provenance"]["fieldSources"][field] = [source_id]
                    else:
                        # Defensive interception categories cannot overwrite the QB's thrown INT count.
                        field = "defensiveInterceptions" if kind == "interceptions" and key == "interceptions" else COUNT_FIELDS.get(key) or RATE_FIELDS.get(key)
                        n = numeric(value)
                        if field and n is not None:
                            player["stats"][field] = n
                            player["provenance"]["fieldSources"][field] = [source_id]
                if kind == "passing":
                    player["stats"]["passingAttempts"] = player["stats"]["attempts"]
                    if player["stats"]["attempts"] is not None:
                        player["provenance"]["fieldSources"]["passingAttempts"] = [source_id]
                if kind == "rushing":
                    player["stats"]["rushingAttempts"] = player["stats"]["carries"]
                    if player["stats"]["carries"] is not None:
                        player["provenance"]["fieldSources"]["rushingAttempts"] = [source_id]
        for player in merged.values():
            check = player_checks.get((game["id"], team_abbr, player["espnId"]))
            if check:
                known = check.get("stats", {})
                for field in BASIC_FIELDS:
                    actual, prior = player["stats"].get(field), known.get(field)
                    if actual is None or prior is None:
                        continue
                    prior_sources = check.get("sourceIds", [])
                    if actual != prior:
                        disagreements.append({"team": team_abbr, "playerId": player["espnId"],
                                              "field": f"players.{field}", "values": [prior, actual],
                                              "sourceIds": list(dict.fromkeys([*prior_sources, source_id])),
                                              "action": "Player field unavailable pending source reconciliation"})
                        player["stats"][field] = None
                        if field == "attempts":
                            player["stats"]["passingAttempts"] = None
                        if field == "carries":
                            player["stats"]["rushingAttempts"] = None
                        player["provenance"]["status"] = "disputed"
                    else:
                        player["provenance"]["fieldSources"][field] = list(dict.fromkeys([*prior_sources, source_id]))
            result[team_abbr].append(player)
    return result


def period_clock(raw):
    raw = mapping(raw)
    return {"quarter": mapping(raw.get("period")).get("number"), "clock": mapping(raw.get("clock")).get("displayValue")}


def normalize_play(raw, source_id, teams_by_id, drive_id=None):
    start = mapping(raw.get("start"))
    return {"id": str(raw.get("id", "")), "sequence": numeric(raw.get("sequenceNumber")), "driveId": drive_id,
            **period_clock(raw), "text": raw.get("text"), "type": mapping(raw.get("type")).get("text"),
            "team": abbr(mapping(raw.get("team")).get("abbreviation")) or teams_by_id.get(str(mapping(start.get("team")).get("id", ""))),
            "awayScore": numeric(raw.get("awayScore")), "homeScore": numeric(raw.get("homeScore")),
            "yards": numeric(raw.get("statYardage")), "down": numeric(start.get("down")), "distance": numeric(start.get("distance")),
            "scoringPlay": raw.get("scoringPlay") if isinstance(raw.get("scoringPlay"), bool) else None,
            "isTurnover": raw.get("isTurnover") if isinstance(raw.get("isTurnover"), bool) else None,
            "isPenalty": raw.get("isPenalty") if isinstance(raw.get("isPenalty"), bool) else None, "sourceIds": [source_id]}


def normalize_report(game, summary, source, all_sources, player_checks, positions):
    summary = mapping(summary)
    sid = source["id"]
    result = {key: game.get(key) for key in ("id", "espnEventId", "season", "seasonType", "week", "gameday", "kickoffUtc",
                                           "status", "home_team", "away_team", "home_score", "away_score", "venue", "neutralSite")}
    result.update(schemaVersion=1, retrievedAt=source.get("retrievedAt"), generatedAt=now(),
                  quarters={}, stats={}, statsProvenance={}, players={game["home_team"]: [], game["away_team"]: []},
                  drives=[], plays=[], scoringPlays=[], sourceIds=["nflverse_games", sid], disagreements=[], unavailable=[],
                  availability={"status": "partial", "historicalInactives": None, "pregameStatus": None, "inGameExits": None,
                                "participation": {}, "sourceIds": [sid],
                                "note": "Final-box-score contributors are verified. Historical inactive lists, pregame practice designations and in-game exit reports are unavailable. Current injury lists are not used as historical game availability."})
    header = mapping(summary.get("header"))
    contests = records(header.get("competitions"))
    contest = contests[0] if contests else {}
    competitors = {abbr(mapping(c.get("team")).get("abbreviation")): c for c in records(contest.get("competitors"))}
    gate = bool(source.get("status") == "verified" and str(header.get("id")) == str(game["espnEventId"])
                and mapping(header.get("season")).get("year") == game["season"]
                and mapping(mapping(contest.get("status")).get("type")).get("completed") is True
                and set(competitors) == {game["home_team"], game["away_team"]}
                and competitors.get(game["home_team"], {}).get("homeAway") == "home"
                and competitors.get(game["away_team"], {}).get("homeAway") == "away"
                and numeric(competitors.get(game["home_team"], {}).get("score")) == game["home_score"]
                and numeric(competitors.get(game["away_team"], {}).get("score")) == game["away_score"])
    if not gate:
        result["verification"] = {"status": "disputed" if summary else "unavailable", "scoreCrosscheck": "failed",
                                  "sourceIds": ["nflverse_games", sid], "note": "Final event, team identity and score must agree before detailed statistics are admitted."}
        result["disagreements"].append({"field": "eventIdentityOrFinalScore", "sourceIds": ["nflverse_games", sid],
            "primary": {"home_team": game["home_team"], "away_team": game["away_team"], "home_score": game["home_score"], "away_score": game["away_score"]},
            "provider": {a: numeric(c.get("score")) for a, c in competitors.items()}, "action": "Detailed report unavailable; primary historical score retained with explicit source disagreement"})
    else:
        result["verification"] = {"status": "verified", "scoreCrosscheck": "verified", "quarterArithmetic": "verified",
                                  "sourceIds": ["nflverse_games", sid], "note": "Final event identity and score independently corroborated; individual datasets retain their own provenance and unavailable fields."}
        result["teamNames"] = {a: mapping(c.get("team")).get("displayName") for a, c in competitors.items()}
        result["providerTeamAbbreviations"] = {a: mapping(c.get("team")).get("abbreviation") for a, c in competitors.items()}
        provider_kickoff = contest.get("date")
        primary_kickoff = game.get("kickoffUtc")
        if provider_kickoff and primary_kickoff:
            try:
                provider_date = dt.datetime.fromisoformat(provider_kickoff.replace("Z", "+00:00"))
                primary_date = dt.datetime.fromisoformat(primary_kickoff.replace("Z", "+00:00"))
                if provider_date != primary_date:
                    result["disagreements"].append({"field": "kickoffUtc", "sourceIds": ["nflverse_games", sid],
                                                  "values": [primary_kickoff, refresh.iso(provider_date)],
                                                  "action": "Kickoff time unavailable pending source reconciliation; historical game date and score retained"})
                    result["kickoffUtc"] = None
            except (ValueError, TypeError):
                result["unavailable"].append({"field": "kickoffUtc", "reason": "Invalid timestamp supplied by a corroborating source"})
                result["kickoffUtc"] = None
        provider_neutral = contest.get("neutralSite")
        if isinstance(provider_neutral, bool) and isinstance(game.get("neutralSite"), bool) and provider_neutral != game["neutralSite"]:
            result["disagreements"].append({"field": "neutralSite", "sourceIds": ["nflverse_games", sid],
                                          "values": [game["neutralSite"], provider_neutral],
                                          "action": "Neutral-site classification unavailable: providers use different designations"})
            result["neutralSite"] = None
        for team_abbr, c in competitors.items():
            quarters = [numeric(mapping(q).get("displayValue", mapping(q).get("value"))) for q in sequence(c.get("linescores"))]
            if len(quarters) >= 4 and all(q is not None for q in quarters) and sum(quarters) == numeric(c.get("score")):
                result["quarters"][team_abbr] = quarters
            else:
                result["quarters"][team_abbr] = None
                result["verification"]["quarterArithmetic"] = "unavailable"
                result["unavailable"].append({"field": f"quarters.{team_abbr}", "reason": "Quarter values are absent or do not reconcile to the verified final score"})
        result["stats"], result["statsProvenance"] = normalized_statistics(summary, game, sid, result["disagreements"])
        result["players"] = normalize_players(summary, game, sid, player_checks, positions, result["disagreements"])
        teams_by_id = {str(mapping(c.get("team")).get("id")): a for a, c in competitors.items()}
        unique_plays = {}
        drive_rows = records(mapping(summary.get("drives")).get("previous"))
        current_drive = mapping(mapping(summary.get("drives")).get("current"))
        if current_drive and current_drive.get("id") not in {d.get("id") for d in drive_rows}:
            drive_rows.append(current_drive)
        for drive in drive_rows:
            normalized_plays = [normalize_play(p, sid, teams_by_id, str(drive.get("id", ""))) for p in records(drive.get("plays"))]
            for play in normalized_plays:
                if play["id"]:
                    unique_plays[play["id"]] = play
            result["drives"].append({"id": str(drive.get("id", "")), "team": abbr(mapping(drive.get("team")).get("abbreviation")),
                                     "description": drive.get("description"), "result": drive.get("displayResult") or drive.get("result"),
                                     "yards": numeric(drive.get("yards")), "plays": numeric(drive.get("offensivePlays")),
                                     "duration": mapping(drive.get("timeElapsed")).get("displayValue"),
                                     "start": {**period_clock(drive.get("start")), "fieldPosition": mapping(drive.get("start")).get("text")},
                                     "end": {**period_clock(drive.get("end")), "fieldPosition": mapping(drive.get("end")).get("text")},
                                     "playIds": [p["id"] for p in normalized_plays], "sourceIds": [sid]})
        result["plays"] = sorted(unique_plays.values(), key=lambda p: (p["sequence"] if p["sequence"] is not None else math.inf, p["id"]))
        result["scoringPlays"] = [normalize_play(p, sid, teams_by_id) for p in records(summary.get("scoringPlays"))]
        for p in result["scoringPlays"]:
            p["scoringPlay"] = True
        result["availability"]["participation"] = {a: [{"espnId": p["espnId"], "name": p["name"], "categories": p["categories"]} for p in players] for a, players in result["players"].items()}
        result["venueInfo"] = mapping(mapping(summary.get("gameInfo")).get("venue")).get("address")
        result["attendance"] = numeric(mapping(summary.get("gameInfo")).get("attendance"))
        provider_venue = mapping(mapping(summary.get("gameInfo")).get("venue")).get("fullName")
        if provider_venue and provider_venue != game.get("venue"):
            result["disagreements"].append({"field": "venue", "sourceIds": ["nflverse_games", sid],
                                          "values": [game.get("venue"), provider_venue],
                                          "action": "Primary source venue label retained; provider label difference disclosed (stadium sponsorship names may vary)"})
        result["providerVenue"] = provider_venue
        for field in ("drives", "plays", "scoringPlays"):
            if not result[field]:
                result["unavailable"].append({"field": field, "reason": "No verified rows supplied by the final summary"})
        if not result["stats"] or not any(any(v is not None for v in team.values()) for team in result["stats"].values()):
            result["unavailable"].append({"field": "teamStatistics", "reason": "Team boxscore values were not supplied by the final summary"})
        if not any(result["players"].values()):
            result["unavailable"].append({"field": "playerStatistics", "reason": "Player boxscore rows were not supplied by the final summary"})
    has_team_stats = [any(v is not None for v in result["stats"].get(a, {}).values()) for a in (game["home_team"], game["away_team"])]
    has_players = [bool(result["players"].get(a)) for a in (game["home_team"], game["away_team"])]
    if not any(has_players):
        result["availability"]["status"] = "unavailable"
        result["availability"]["note"] = "Game-specific statistical participant rows and historical availability reports are unavailable. Current injury lists are not substituted."
    boxscore_status = "verified" if gate and all([*has_team_stats, *has_players]) else "partial" if gate and any([*has_team_stats, *has_players]) else "unavailable"
    if boxscore_status == "unavailable":
        result["unavailable"].append({"field": "boxscore", "reason": "Final score verified separately; detailed boxscore data are not supplied"})
    result["provenance"] = {"identityAndScore": {"status": "verified", "sourceIds": ["nflverse_games"], "season": game["season"], "week": game["week"]},
                            "quarters": {"status": result.get("verification", {}).get("quarterArithmetic", "unavailable"), "sourceIds": [sid], "origin": "reported"},
                            "boxscore": {"status": boxscore_status, "sourceIds": [sid], "origin": "reported"},
                            "plays": {"status": "verified" if gate and result["plays"] else "unavailable", "sourceIds": [sid], "origin": "reported"},
                            "historicalAvailability": {"status": "unavailable", "sourceIds": [], "note": result["availability"]["note"]}}
    referenced = set(result["sourceIds"])
    for t in result["statsProvenance"].values():
        for ids in t.get("fieldSources", {}).values():
            referenced.update(ids)
    for players in result["players"].values():
        for p in players:
            referenced.update(p.get("positionProvenance", {}).get("sourceIds", []))
            for ids in p["provenance"].get("fieldSources", {}).values():
                referenced.update(ids)
    for d in result["disagreements"]:
        referenced.update(d.get("sourceIds", []))
    result["sources"] = [source if source_id == sid else all_sources[source_id] for source_id in sorted(referenced) if source_id == sid or source_id in all_sources]
    return result


def reconcile_known_player_conflicts(report, matchup_book):
    """Retain known research-source differences in older accepted boxscores.

    A null basic cell in the research book may already represent an unresolved
    provider conflict. It must not be silently skipped when validating another
    summary. This only transfers event-specific statistics, never present-day
    roster membership, jersey numbers or claims about historical QB starters.
    """
    before = json.dumps(report, sort_keys=True)
    source_book = {source["id"]: source for source in matchup_book.get("sources", [])}
    report_sources = {source["id"]: source for source in report.get("sources", [])}
    for issue in matchup_book.get("disagreements", []):
        if issue.get("gameId") != report["id"] or not issue.get("playerId") or issue.get("field") not in (*BASIC_FIELDS, "fumbles"):
            continue
        club = matchup_book.get("teams", {}).get(issue.get("team"), {})
        players = club.get("players", {})
        players = list(players.values()) if isinstance(players, dict) else players
        identity = next((p for p in players if str(p.get("id")) == str(issue["playerId"])), None)
        assert identity and identity.get("espnId"), (report["id"], issue["playerId"], "Known conflict lacks canonical player identity")
        espn_id = str(identity["espnId"])
        player = next((p for p in report.get("players", {}).get(issue["team"], []) if str(p.get("espnId")) == espn_id), None)
        if not player or issue["field"] not in player.get("stats", {}):
            continue  # A missing historical contributor/statistic is already unavailable.
        for source_id in issue.get("sourceIds", []):
            source = source_book.get(source_id)
            assert source and source.get("status") == "verified" and source.get("url") and source.get("retrievedAt"), (report["id"], "Conflict source provenance incomplete")
            report_sources[source_id] = source
        key = f"players.{issue['field']}"
        # This producer retains [original NFLverse value, later ESPN value],
        # while its sourceIds list is alphabetically sorted. Never zip them.
        primary_ids = [s for s in issue.get("sourceIds", []) if s == "nflverse_player_stats" or s.startswith("nflverse_player_stats_")]
        provider_ids = [s for s in issue.get("sourceIds", []) if s.startswith("espn_")]
        assert primary_ids and provider_ids and len(issue.get("values", [])) == 2, (report["id"], "Known conflict value/source association is unavailable")
        readings = [{"value": issue["values"][0], "sourceIds": primary_ids},
                    {"value": issue["values"][1], "sourceIds": provider_ids}]
        existing = next((d for d in report["disagreements"] if d.get("team") == issue["team"] and str(d.get("playerId")) == espn_id and d["field"] == key), None)
        if existing is None:
            existing = {"team": issue["team"], "playerId": espn_id, "field": key,
                        "values": list(issue.get("values", [])), "sourceIds": list(issue.get("sourceIds", [])),
                        "action": "Player field unavailable: an unresolved event-specific research-source disagreement is retained", "origin": "research-source-disagreement", "readings": readings}
            report["disagreements"].append(existing)
        else:
            existing["values"] = list(dict.fromkeys([*existing.get("values", []), *issue.get("values", [])]))
            existing["sourceIds"] = list(dict.fromkeys([*existing.get("sourceIds", []), *issue.get("sourceIds", [])]))
            existing["readings"] = [json.loads(value) for value in dict.fromkeys(json.dumps(reading, sort_keys=True) for reading in [*existing.get("readings", []), *readings])]
        player["stats"][issue["field"]] = None
        if issue["field"] == "attempts":
            player["stats"]["passingAttempts"] = None
        if issue["field"] == "carries":
            player["stats"]["rushingAttempts"] = None
        player["provenance"]["status"] = "disputed"
        player["provenance"]["fieldSources"][issue["field"]] = list(dict.fromkeys([*player["provenance"]["fieldSources"].get(issue["field"], []), *issue.get("sourceIds", [])]))
    report["sources"] = [report_sources[source_id] for source_id in sorted(report_sources)]
    return json.dumps(report, sort_keys=True) != before


def disagreement_catalog(entries, detail_dir, team_book, matchup_book):
    """Share all accepted report differences without overwriting raw books.

    Raw-byte dependencies on the index bind this catalog to its consumers.
    Each issue also binds to its checksum-verified, event-specific report.
    Venue label aliases remain disclosures; true conflicts stay unavailable.
    """
    identities = {}
    for book in (team_book, matchup_book):
        for team_abbr, club in book.get("teams", {}).items():
            players = club.get("players", {})
            players = list(players.values()) if isinstance(players, dict) else players
            for player in [*club.get("roster", []), *players]:
                if player.get("espnId") and player.get("id"):
                    key = (team_abbr, str(player["espnId"]))
                    value = (str(player["id"]), player.get("name"))
                    if key in identities:
                        assert identities[key][0] == value[0], (key, "Conflicting canonical player identity")
                    identities[key] = value
    catalog = []
    for game_id, entry in sorted(entries.items()):
        path = Path(detail_dir) / f"{game_id}.json"
        assert digest(path) == entry["sha256"], (game_id, "Cannot catalog an unverified report body")
        report = json.loads(path.read_bytes())
        sources = {source["id"]: source for source in report["sources"]}
        for ordinal, issue in enumerate(report.get("disagreements", [])):
            report_field = issue["field"]
            scope = "player" if report_field.startswith("players.") else "team" if report_field.startswith("stats.") else "venue" if report_field == "venue" else "event"
            field = report_field.split(".", 1)[-1]
            espn_id = str(issue["playerId"]) if issue.get("playerId") is not None else None
            gsis_id, player_name = identities.get((issue.get("team"), espn_id), (None, None))
            readings = issue.get("readings")
            if readings is None:
                # The report normalizer compares an independently sourced
                # input value with this event's ESPN report. Identify that
                # explicit provider by ID, not by the order of sourceIds.
                provider_id = f"espn_game_report_{report['espnEventId']}"
                primary_ids = [source_id for source_id in issue.get("sourceIds", []) if source_id != provider_id]
                values = issue.get("values", [issue.get("primary"), issue.get("provider")])
                if len(values) == 2 and primary_ids and provider_id in issue.get("sourceIds", []):
                    readings = [{"value": values[0], "sourceIds": primary_ids}, {"value": values[1], "sourceIds": [provider_id]}]
                else:
                    readings = [{"value": value, "sourceIds": issue.get("sourceIds", []), "note": "Source-reported total and source-derived arithmetic differ; see the issue action"} for value in values]
            catalog.append({
                "id": f"{game_id}:{ordinal}", "gameId": game_id,
                "season": report["season"], "week": report["week"],
                "scope": scope, "team": issue.get("team"), "field": field,
                "reportField": report_field, "playerEspnId": espn_id,
                "playerGsisId": gsis_id, "playerName": player_name,
                "values": issue.get("values", [issue.get("primary"), issue.get("provider")]),
                "sourceIds": issue.get("sourceIds", []),
                "readings": readings,
                "sources": [sources[source_id] for source_id in issue.get("sourceIds", [])],
                "resolution": "disclosed-alias" if scope == "venue" else "unavailable",
                "action": issue.get("action", "Value unavailable pending source reconciliation"),
                "detailUrl": entry["detailUrl"], "reportSha256": entry["sha256"],
                "reportRetrievedAt": report.get("retrievedAt"),
            })
    return catalog


def validate(index_path=INDEX, detail_dir=DETAILS):
    index = json.loads(Path(index_path).read_text())
    team_path = ROOT / "assets/data/team-details.json"
    matchup_path = ROOT / "assets/data/matchup-breakdown.json"
    assert index["dependencies"]["teamDetailsSha256"] == digest(team_path), "Report index requires refresh after team-detail source changes"
    assert index["dependencies"]["matchupBreakdownSha256"] == digest(matchup_path), "Report index requires refresh after matchup source changes"
    history_path = ROOT / "assets/data/player-history.json"
    assert index["dependencies"].get("playerHistorySha256") == (digest(history_path) if history_path.exists() else None), "Report index requires refresh after player-history source changes"
    team_book = json.loads(team_path.read_bytes())
    matchup_book = json.loads(matchup_path.read_bytes())
    assert index.get("integrityCatalog", {}).get("schemaVersion") == 1, "Report integrity catalog unavailable"
    assert index["integrityCatalog"]["dependencies"] == index["dependencies"], "Integrity catalog source bindings differ"
    assert index.get("knownDisagreements") == disagreement_catalog(index["games"], detail_dir, team_book, matchup_book), "Report integrity catalog is incomplete or differs from verified report bodies"
    linked = {g["id"]: g for t in [*team_book["teams"].values(), *matchup_book["teams"].values()]
              for g in [*t.get("games", []), *t.get("headToHeadGames", [])]
              if g.get("status") == "final" and g.get("espnEventId")}
    assert set(linked).issubset(index["games"]), "A linked historical game is missing its report route"
    counts = {"games": 0, "verified": 0, "disputed": 0, "unavailable": 0, "players": 0, "plays": 0, "drives": 0, "quarterChecks": 0}
    for game_id, entry in index["games"].items():
        assert entry["id"] == game_id and entry["status"] == "final"
        path = Path(detail_dir) / f"{game_id}.json"
        assert digest(path) == entry["sha256"], (game_id, "checksum")
        report = json.loads(path.read_text())
        assert not reconcile_known_player_conflicts(report, matchup_book), (game_id, "Known research-source statistic conflict was not propagated into the report")
        assert report["id"] == game_id and report["espnEventId"] == entry["espnEventId"]
        assert index["eventIdToGameId"][str(report["espnEventId"]) ] == game_id
        if game_id in linked:
            assert all(report.get(key) == linked[game_id].get(key) for key in ("espnEventId", "home_team", "away_team", "home_score", "away_score", "season", "week")), (game_id, "linked game context")
        sources = {s["id"]: s for s in report["sources"]}
        assert all(i in sources for i in report["sourceIds"]), (game_id, "missing source")
        for source in sources.values():
            assert source.get("url") and source.get("retrievedAt")
        assert sources["nflverse_games"]["status"] == "verified", (game_id, "primary source unavailable")
        if report["verification"]["status"] == "verified":
            assert report["verification"]["scoreCrosscheck"] == "verified"
            assert all(sources[s]["status"] == "verified" for s in report["verification"]["sourceIds"])
        for team in (report["home_team"], report["away_team"]):
            quarters = report["quarters"].get(team)
            if quarters is not None:
                score = report["home_score"] if team == report["home_team"] else report["away_score"]
                assert all(isinstance(v, (int, float)) for v in quarters) and sum(quarters) == score
                counts["quarterChecks"] += 1
            stats = report["stats"].get(team, {})
            if all(stats.get(k) is not None for k in ("totalOffense", "netPassing", "rushing")):
                assert stats["totalOffense"] == stats["netPassing"] + stats["rushing"], (game_id, team, "offense arithmetic")
            for p in report["players"].get(team, []):
                assert p["espnId"] and p["name"] and p["participation"] == "played"
                for ids in p["provenance"]["fieldSources"].values():
                    assert all(s in sources for s in ids), (game_id, p["name"], "player field source")
                counts["players"] += 1
        counts["games"] += 1
        counts[report["verification"]["status"]] += 1
        counts["plays"] += len(report["plays"])
        counts["drives"] += len(report["drives"])
        assert report["availability"]["historicalInactives"] is None
        scoring = report["scoringPlays"]
        if scoring:
            assert scoring[-1]["homeScore"] == report["home_score"] and scoring[-1]["awayScore"] == report["away_score"], (game_id, "scoring final score")
            if all(report["quarters"].get(a) is not None for a in (report["home_team"], report["away_team"])):
                points = {a: [0] * len(report["quarters"][a]) for a in (report["home_team"], report["away_team"])}
                last = {"homeScore": 0, "awayScore": 0}
                for play in scoring:
                    period = play["quarter"]
                    assert isinstance(period, int) and period >= 1
                    for team, key in ((report["home_team"], "homeScore"), (report["away_team"], "awayScore")):
                        assert period <= len(points[team]) and play[key] is not None
                        points[team][period - 1] += play[key] - last[key]
                        last[key] = play[key]
                assert points == report["quarters"], (game_id, "scoring progression and quarter score disagreement")
    return {"status": "passed", **counts}


def install_candidate(staged_index, staged_details, output_path, detail_path):
    """Install only a validated candidate, rolling back filesystem errors.

    Directory and index installation are two atomic filesystem operations,
    rather than one cross-file transaction. A reader must keep using the index
    checksum gate during that short interval. Published Git commits contain the
    complete pair, and rejected validation/input drift never reaches this step.
    """
    output_path = Path(output_path)
    detail_path = Path(detail_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    prepared_index = output_path.with_name(f".{output_path.name}.installing")
    previous_details = Path(staged_details).parent / "previous-details"
    installed_details = False
    try:
        shutil.copyfile(staged_index, prepared_index)
        if detail_path.exists():
            detail_path.replace(previous_details)
        Path(staged_details).replace(detail_path)
        installed_details = True
        prepared_index.replace(output_path)
    except BaseException:
        if installed_details and detail_path.exists():
            detail_path.replace(staged_details)
        if previous_details.exists():
            previous_details.replace(detail_path)
        raise
    finally:
        if prepared_index.exists():
            prepared_index.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", help="Public-summary audit cache outside the deployed repository")
    parser.add_argument("--use-cache", action="store_true", help="Replay checksum/source-verified raw cache retaining retrieval times")
    parser.add_argument("--refresh-history", action="store_true", help="Explicitly refetch older finals for source corrections")
    parser.add_argument("--index-only", action="store_true", help="Rebind verified existing report routes to current book context without provider retrieval or statistic recalculation; refuses any missing/mismatched game")
    parser.add_argument("--check", action="store_true", help="Validate saved index, all detail checksums and arithmetic; no network")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--output", type=Path, default=INDEX)
    parser.add_argument("--detail-dir", type=Path, default=DETAILS)
    args = parser.parse_args()
    if args.check:
        print(json.dumps(validate(args.output, args.detail_dir), indent=2))
        return
    team_path = ROOT / "assets/data/team-details.json"
    matchup_path = ROOT / "assets/data/matchup-breakdown.json"
    team_bytes = team_path.read_bytes()
    matchup_bytes = matchup_path.read_bytes() if matchup_path.exists() else None
    team_checksum = hashlib.sha256(team_bytes).hexdigest()
    matchup_checksum = hashlib.sha256(matchup_bytes).hexdigest() if matchup_bytes else None
    history_path = ROOT / "assets/data/player-history.json"
    history_checksum = digest(history_path) if history_path.exists() else None
    teams = json.loads(team_bytes)
    matchup = json.loads(matchup_bytes) if matchup_bytes else {}
    all_sources = {s["id"]: s for s in [*teams["sources"], *matchup.get("sources", [])]}
    games = {}
    linked_team_rows = [*teams["teams"].values(), *matchup.get("teams", {}).values()]
    for t in linked_team_rows:
        for game in [*t.get("games", []), *t.get("headToHeadGames", [])]:
            if game["status"] == "final" and game.get("espnEventId"):
                assert re.fullmatch(r"[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}", str(game["id"])), "Invalid canonical game identifier"
                if game["id"] in games:
                    for key in ("home_team", "away_team", "home_score", "away_score", "espnEventId"):
                        assert games[game["id"]][key] == game[key], (game["id"], key, "team-history mismatch")
                else:
                    games[game["id"]] = game
    player_checks, positions = {}, {}
    for team_abbr, t in matchup.get("teams", {}).items():
        for player in t.get("players", {}).values():
            for log in player.get("gameLog", []):
                if log.get("team") == team_abbr and player.get("espnId"):
                    player_checks[(log["gameId"], team_abbr, str(player["espnId"]))] = log
        for player in t.get("roster", []):
            if player.get("espnId"):
                positions[(teams["season"], team_abbr, str(player["espnId"]))] = player.get("position")
    previous_index_checksum = digest(args.output) if args.output.exists() else None
    previous = json.loads(args.output.read_text()) if args.output.exists() else {"games": {}}
    result_games, to_fetch, reused, retained_archives = {}, [], 0, 0
    for game_id, game in games.items():
        path = args.detail_dir / f"{game_id}.json"
        old = previous.get("games", {}).get(game_id)
        recent = game["season"] == teams["season"] and game["week"] >= max(1, teams["currentWeek"] - 1)
        can_reuse = old and path.exists() and digest(path) == old.get("sha256") and old.get("verification", {}).get("status") == "verified"
        if can_reuse and not args.refresh_history and (not recent or args.index_only):
            report = json.loads(path.read_text())
            can_reuse = all(report.get(k) == game.get(k) for k in ("espnEventId", "home_team", "away_team", "home_score", "away_score", "season", "week"))
        if can_reuse and not args.refresh_history and (not recent or args.index_only):
            result_games[game_id] = old
            reused += 1
        else:
            if args.index_only:
                raise ValueError(f"Index-only rebind refused: {game_id} has no verified report with matching final context. Run the ordinary data refresh.")
            to_fetch.append(game)
    # A new weekly opponent rotates the five-game H2H window. Previously
    # verified report routes remain addressable for saved links and browser
    # history; they are not recrawled or relabeled as newly retrieved data.
    for path in sorted(args.detail_dir.glob("*.json")):
        if path.stem in games or not re.fullmatch(r"[0-9]{4}_[0-9]{2}_[A-Z]{2,3}_[A-Z]{2,3}", path.stem):
            continue
        try:
            report = json.loads(path.read_bytes())
            if report.get("id") != path.stem or report.get("status") != "final" or report.get("verification", {}).get("status") != "verified":
                continue
            sources = {s["id"]: s for s in report.get("sources", [])}
            if not all(s in sources and sources[s].get("status") == "verified" for s in report["verification"].get("sourceIds", [])):
                continue
            old = previous.get("games", {}).get(report["id"])
            if old and old.get("sha256") == digest(path):
                entry = dict(old)
            else:
                entry = {key: report.get(key) for key in ("id", "espnEventId", "season", "seasonType", "week", "status", "home_team", "away_team", "home_score", "away_score", "venue", "kickoffUtc", "retrievedAt", "verification", "sourceIds")}
                entry.update(detailUrl=f"assets/data/game-reports/{report['id']}.json", sha256=digest(path), bytes=path.stat().st_size,
                             disagreementCount=len(report.get("disagreements", [])), datasetStatus="partial" if report.get("disagreements") else "verified")
            entry["retainedArchive"] = True
            result_games[report["id"]] = entry
            retained_archives += 1
        except (OSError, ValueError, KeyError, TypeError):
            continue
    args.detail_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".game-reports-stage-", dir=args.detail_dir.parent) as stage:
        stage_root = Path(stage)
        staged_details = stage_root / "game-reports"
        if args.detail_dir.exists():
            shutil.copytree(args.detail_dir, staged_details)
        else:
            staged_details.mkdir()
        staged_index = stage_root / "game-reports.json"
        print(json.dumps({"completedGames": len(games), "reusedArchivalReports": reused, "summariesToRetrieve": len(to_fetch), "workers": min(4, max(1, args.workers))}), flush=True)
        def build(game):
            summary, source = fetch_summary(game["espnEventId"], args.cache_dir, args.use_cache)
            old = previous.get("games", {}).get(game["id"])
            path = args.detail_dir / f"{game['id']}.json"
            # A temporary provider outage never destroys a preceding, identically
            # contextualized verified final report. Its old retrieval time and bytes
            # are retained, with the failed revalidation exposed by the index.
            if summary is None and old and path.exists() and digest(path) == old.get("sha256"):
                prior_report = json.loads(path.read_text())
                if prior_report.get("verification", {}).get("status") == "verified" and all(prior_report.get(k) == game.get(k) for k in ("espnEventId", "home_team", "away_team", "home_score", "away_score", "season", "week")):
                    preserved = dict(old)
                    preserved["revalidation"] = {"status": "unavailable", "checkedAt": source["retrievedAt"], "error": source.get("error"),
                                                  "note": "Previous verified final report retained with its original source timestamp after a temporary retrieval failure."}
                    return game["id"], preserved
            report = normalize_report(game, summary, source, all_sources, player_checks, positions)
            checksum, size = atomic_json(staged_details / path.name, report)
            entry = {key: report.get(key) for key in ("id", "espnEventId", "season", "seasonType", "week", "status", "home_team", "away_team", "home_score", "away_score", "venue", "kickoffUtc", "retrievedAt", "verification", "sourceIds")}
            entry.update(detailUrl=f"assets/data/game-reports/{game['id']}.json", sha256=checksum, bytes=size,
                         disagreementCount=len(report["disagreements"]),
                         datasetStatus="partial" if report["disagreements"] or report["provenance"]["boxscore"]["status"] != "verified" else report["verification"]["status"])
            return game["id"], entry
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, max(1, args.workers))) as pool:
            futures = {pool.submit(build, game): game["id"] for game in to_fetch}
            completed = 0
            for future in concurrent.futures.as_completed(futures):
                game_id, entry = future.result()
                result_games[game_id] = entry
                completed += 1
                if completed % 25 == 0 or completed == len(to_fetch):
                    print(json.dumps({"retrieved": completed, "of": len(to_fetch), "latest": game_id}), flush=True)
        assert digest(team_path) == team_checksum, "Team-detail source changed during report construction; retry against stable inputs"
        assert not matchup_bytes or digest(matchup_path) == matchup_checksum, "Matchup source changed during report construction; retry against stable inputs"
        assert (digest(history_path) if history_path.exists() else None) == history_checksum, "Player-history source changed during report construction; retry against stable inputs"
        for game_id, entry in result_games.items():
            path = staged_details / f"{game_id}.json"
            report = json.loads(path.read_bytes())
            if reconcile_known_player_conflicts(report, matchup):
                atomic_json(path, report)
                entry.update(sha256=digest(path), bytes=path.stat().st_size,
                             disagreementCount=len(report["disagreements"]), datasetStatus="partial")
        dependencies = {"teamDetailsSha256": team_checksum, "matchupBreakdownSha256": matchup_checksum, "playerHistorySha256": history_checksum}
        snapshot = {"schemaVersion": 1, "season": teams["season"], "currentWeek": teams["currentWeek"],
                    "retrievedAt": min((e["retrievedAt"] for e in result_games.values() if e.get("retrievedAt")), default=None),
                    "generatedAt": now(), "dependencies": dependencies,
                    "integrityCatalog": {"schemaVersion": 1, "dependencies": dependencies,
                                         "note": "Known differences from checksum-verified event reports. Consumers preserve raw books, mask true conflicts before aggregation, and disclose source-specific venue labels without asserting their equivalence."},
                    "knownDisagreements": disagreement_catalog(result_games, staged_details, teams, matchup),
                    "sources": [s for s in teams["sources"] if s["id"] == "nflverse_games"],
                    "games": dict(sorted(result_games.items())), "eventIdToGameId": {str(e["espnEventId"]): k for k, e in sorted(result_games.items())},
                    "coverage": {"status": "verified" if all(e["verification"]["status"] == "verified" and not e.get("disagreementCount") and e.get("datasetStatus", "verified") == "verified" for e in result_games.values()) else "partial",
                                 "completedGames": len(games), "reports": len(result_games), "reusedArchivalReports": reused,
                                 "retainedArchiveReports": retained_archives, "retrievedThisRun": len(to_fetch),
                                 "note": "All completed regular-season games addressable by the current team-history feed, plus previously verified reports retained when weekly H2H windows rotate. Every report is lazy-loaded and checksum bound. Cached archival retrieval times are retained."},
                    "refreshPolicy": {"newGames": "retrieve", "recentFinals": "current and preceding selected feed week", "olderFinals": "reuse validated report; --refresh-history for corrections"}}
        atomic_json(staged_index, snapshot)
        checks = validate(staged_index, staged_details)
        assert digest(team_path) == team_checksum, "Team-detail input changed before installation; previous report files retained"
        assert (digest(history_path) if history_path.exists() else None) == history_checksum, "Player-history input changed before installation; previous report files retained"
        assert digest(matchup_path) == matchup_checksum, "Matchup input changed before installation; previous report files retained"
        assert (digest(args.output) if args.output.exists() else None) == previous_index_checksum, "Another report-index writer changed the snapshot; previous report files retained"
        install_candidate(staged_index, staged_details, args.output, args.detail_dir)
        print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    main()
