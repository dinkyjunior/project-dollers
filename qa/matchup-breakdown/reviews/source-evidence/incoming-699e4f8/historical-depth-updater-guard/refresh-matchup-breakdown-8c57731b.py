#!/usr/bin/env python3
"""Build sourced matchup research, retaining the last good file on failure.

Run after the current and team-detail builders with their shared --cache-dir.
Regular-season statistical rows, source-designated starting-QB roles and snap
counts are separate evidence. Missing rows, routes, pressure or inactives never
become zero. Public HTTPS only; cached bytes require matching source receipts.
"""
import argparse
import collections
import concurrent.futures
import copy
import csv
import datetime as dt
import gzip
import hashlib
import html
import importlib.util
import io
import json
import math
import re
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/data/matchup-breakdown.json"
ROLE_EVIDENCE = ROOT / "qa/matchup-breakdown/data/starting-role-evidence.json"
UTC = dt.timezone.utc
RELEASE = "https://github.com/nflverse/nflverse-data/releases/download"
OFFENSE = {"QB", "RB", "FB", "WR", "TE"}
DISPLAY_STATS = {"completions", "attempts", "passingYards", "passingTD", "interceptions", "sacks", "sackYardsLost",
                 "carries", "rushingYards", "rushingTD", "receptions", "targets", "receivingYards", "receivingTD",
                 "passingAirYards", "passingYardsAfterCatch", "passingFirstDowns", "passingTwoPointConversions",
                 "sackFumbles", "sackFumblesLost", "rushingFumbles", "rushingFumblesLost", "rushingFirstDowns",
                 "rushingTwoPointConversions", "receivingFumbles", "receivingFumblesLost", "receivingAirYards",
                 "receivingYardsAfterCatch", "receivingFirstDowns", "receivingTwoPointConversions", "specialTeamsTD",
                 "fumbles", "fumblesLost", "games", "completionPct", "yardsPerCarry", "yardsPerReception",
                 "offensiveTD", "touchdownsAccountedFor", "passerRating", "yardsPerAttempt"}


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


refresh = module("matchup_core", "refresh-data.py")
details = module("matchup_details", "refresh-team-details.py")
COUNT_FIELDS = {**refresh.STAT_FIELDS, **refresh.EXTRA_COUNT_FIELDS}
ADVANCED_FIELDS = ("snaps", "offensiveSnapPct", "routes", "redZoneTargets", "redZoneReceptions",
                   "redZoneReceivingTD", "redZonePassAttempts", "redZonePassTD", "dropbacks", "qbHits",
                   "pressures", "blitz", "scrambles", "scrambleYards", "designedRuns", "designedRunYards",
                   "deepAttempts", "deepCompletions", "deepYards", "teamTargets", "targetShare", "sackRate",
                   "offensiveSnaps", "blitzes", "averageDepthOfTarget", "redZoneRushAttempts")


def digest(body):
    return hashlib.sha256(body).hexdigest()


def stamp():
    return refresh.iso(dt.datetime.now(UTC))


def num(value):
    try:
        number = refresh.number(value)
        return number if number is None or math.isfinite(number) else None
    except (ValueError, TypeError):
        return None


def blob(item, cache_dir):
    source_id, spec = item
    cache = Path(cache_dir) / spec["cache"] if cache_dir else None
    metadata = {"id": source_id, "url": spec["url"], "provider": spec.get("provider", "nflverse"),
                "required": spec.get("required", False)}
    try:
        if cache and cache.exists():
            saved = json.loads(cache.with_suffix(".meta.json").read_text())
            body = cache.read_bytes()
            if saved.get("status") != "verified" or saved.get("url") != spec["url"] or saved.get("sha256") != digest(body):
                raise ValueError("Cached source bytes/URL/status do not match its receipt")
            if not saved.get("retrievedAt") or saved.get("httpStatus") != 200:
                raise ValueError("Cached source has no corroborated HTTP retrieval time/status")
            metadata.update(saved)
            metadata.update(id=source_id, provider=spec.get("provider", "nflverse"), required=spec.get("required", False))
        else:
            request = urllib.request.Request(spec["url"], headers={"User-Agent": "ProjectDollarDataRefresh/1.0 public-data-audit"})
            with urllib.request.urlopen(request, timeout=90, context=refresh.verified_ssl_context()) as response:
                body = response.read()
                if response.status != 200:
                    raise ValueError(f"Unexpected source HTTP {response.status}")
                metadata.update(httpStatus=response.status, etag=response.headers.get("ETag"),
                                lastModified=response.headers.get("Last-Modified"), retrievedAt=stamp())
            metadata.update(status="verified", sha256=digest(body), bytes=len(body), tlsVerified=True)
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(body)
                cache.with_suffix(".meta.json").write_text(json.dumps(metadata))
        metadata.update({key: spec[key] for key in ("season", "watch") if key in spec})
        if not body:
            raise ValueError("Empty source body")
        return source_id, body, metadata
    except Exception as exc:
        metadata.update(status="unavailable", retrievedAt=stamp(), error=str(exc))
        if spec.get("required"):
            raise RuntimeError(f"Required matchup source {source_id} failed; prior snapshot retained: {exc}") from exc
        return source_id, None, metadata


def rows(body, compressed=False):
    if body is None:
        return []
    stream = gzip.GzipFile(fileobj=io.BytesIO(body)) if compressed else io.BytesIO(body)
    return csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))


def specifications(season):
    specs = {key: value for key, value in refresh.source_specs(season).items()
             if key in {"nflverse_games", "nflverse_roster", "nflverse_player_stats", "nflverse_injuries", "nflverse_depth"}}
    specs[f"nflverse_player_stats_{season-1}"] = {"url": f"{RELEASE}/stats_player/stats_player_week_{season-1}.csv",
                                                "cache": f"stats{season-1}.csv", "required": False}
    for year in range(refresh.HISTORY_FIRST_SEASON, season - 1):
        specs[f"nflverse_player_stats_{year}"] = {"url": f"{RELEASE}/stats_player/stats_player_week_{year}.csv",
                                                "cache": f"stats{year}.csv", "required": False}
    specs["nflverse_player_ids"] = {"url": f"{RELEASE}/players/players.csv", "cache": "players.csv", "required": False}
    for year in (season - 1, season):
        specs[f"nflverse_snaps_{year}"] = {"url": f"{RELEASE}/snap_counts/snap_counts_{year}.csv",
                                           "cache": f"snaps{year}.csv", "required": False, "season": year, "watch": year == season}
        specs[f"nflverse_pbp_{year}"] = {"url": f"{RELEASE}/pbp/play_by_play_{year}.csv.gz",
                                         "cache": f"pbp{year}.csv.gz", "required": False, "season": year, "watch": year == season}
    for abbr in ("DAL", "TB", "PIT"):
        specs[f"espn_matchup_depth_{abbr}"] = {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/depthcharts",
                                               "cache": f"matchup-espn-depth-{abbr}.json", "required": False, "provider": "ESPN", "season": season, "watch": True}
        specs[f"espn_matchup_roster_{abbr}"] = {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/roster",
                                                "cache": f"matchup-espn-roster-{abbr}.json", "required": False, "provider": "ESPN", "season": season, "watch": True}
    return specs


def summary_specifications(team_details):
    specs = {}
    for abbr in ("DAL", "TB", "PIT"):
        recent = sorted([game for game in team_details["teams"][abbr]["games"] if game["status"] == "final"],
                        key=lambda game: (game["gameday"], game["id"]), reverse=True)[:5]
        for game in recent:
            event_id = game.get("espnEventId")
            if event_id:
                specs[f"espn_matchup_summary_{event_id}"] = {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event_id}",
                    "cache": f"matchup-espn-summary-{event_id}.json", "required": False, "provider": "ESPN", "gameId": game["id"]}
    return specs


def fixture_specifications(base, team_details):
    """Read actual event status/availability, never infer live state from time."""
    specs = {}
    for team in team_details["teams"].values():
        for game in team["games"]:
            relevant = (game["season"] == base["season"]
                        and (game["week"] == base["currentWeek"] or game["id"] == team["upcomingGameId"]))
            event = game.get("espnEventId")
            if relevant and event:
                specs[f"espn_fixture_summary_{event}"] = {
                    "url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event}",
                    "cache": f"matchup-espn-fixture-{event}.json", "required": False, "provider": "ESPN",
                    "gameId": game["id"], "season": base["season"], "watch": True}
    return specs


def fixture_report(game, abbr, body, source, espn_ids, current_week=None):
    """Event-scoped provider reports; no complete official inactive-list claim."""
    if not body or source.get("status") != "verified":
        return None
    data = json.loads(body)
    header = data.get("header", {})
    event = str(game.get("espnEventId"))
    competitions = header.get("competitions", [])
    if not competitions:
        return None
    competition = competitions[0]
    clubs = {refresh.canonical_team(row.get("team", {}).get("abbreviation", ""))
             for row in competition.get("competitors", [])}
    context = header.get("season", {})
    if (str(header.get("id")) != event or str(competition.get("id")) != event
            or context.get("year") != game["season"] or context.get("type") != 2
            or header.get("week") != game["week"] or clubs != {game["home_team"], game["away_team"]}):
        raise ValueError(f"Fixture event/season/week/teams mismatch: {game['id']}/{event}")
    status = competition.get("status", {}).get("type", {})
    if game["status"] == "final" and status.get("completed") is False:
        raise ValueError(f"Final schedule versus unfinished event: {game['id']}; partial game cannot enter final windows")
    source_ids = [source["id"]]
    future_bulletin = current_week is not None and game["week"] > current_week and status.get("state") == "pre"
    people = []
    for group in data.get("injuries", []):
        if refresh.canonical_team(group.get("team", {}).get("abbreviation", "")) != abbr:
            continue
        for item in group.get("injuries", []):
            athlete = item.get("athlete", {})
            espn_id = str(athlete.get("id") or "")
            fantasy = item.get("details", {}).get("fantasyStatus", {})
            inactive = any(str(fantasy.get(key, "")).upper() == "INACTIVE" for key in ("description", "abbreviation"))
            people.append({"gameId": game["id"], "eventId": event, "team": abbr,
                "season": game["season"], "week": game["week"], "playerId": espn_ids.get(espn_id),
                "espnId": espn_id or None, "name": athlete.get("displayName") or athlete.get("fullName"),
                "position": athlete.get("position", {}).get("abbreviation"),
                "reportStatus": item.get("status") or None, "reportedInactive": True if inactive else None,
                "officialConfirmed": False, "practiceStatus": None,
                "injury": item.get("details", {}).get("type"), "sourceTimestamp": item.get("date"),
                "sourceIds": source_ids, "identitySourceIds": ["nflverse_player_ids"] if espn_ids.get(espn_id) else [],
                "retrievedAt": source["retrievedAt"], "confirmation": "provider-reported",
                "sourceField": "injuries[].injuries[].status + details.fantasyStatus"})
    # A scheduled endpoint demonstrably reuses the preceding game's INACTIVE
    # objects. Advancing the core week does not give those dated objects new
    # game applicability; preserve them as a bulletin until corroborated.
    future_bulletin = future_bulletin or (status.get("state") == "pre"
        and any(person.get("reportedInactive") is True for person in people))
    by_side = {row.get("homeAway"): num(row.get("score")) for row in competition.get("competitors", [])}
    observed_score = {"home": by_side.get("home"), "away": by_side.get("away"),
                      "isFinal": status.get("completed") is True, "sourceIds": source_ids}
    event_status = {key: status.get(key) for key in ("name", "state", "completed", "description", "detail", "shortDetail")}
    event_status.update({key: competition.get("status", {}).get(key) for key in ("displayClock", "period", "displayPeriod")})
    bulletin = []
    if future_bulletin:
        for person in people:
            bulletin.append({**person, "requestedGameId": game["id"], "requestedEventId": event,
                "requestedWeek": game["week"], "gameId": None, "eventId": None, "week": None,
                "reportedInactive": None, "reportWeek": None,
                "note": "Current-team bulletin reused by a future event endpoint. No future-game inactive or availability confirmation."})
        people = []
    return {"gameId": game["id"], "eventId": event, "season": game["season"], "week": game["week"],
        "sourceIds": source_ids, "retrievedAt": source["retrievedAt"], "publishedAt": data.get("meta", {}).get("lastUpdatedAt"),
        "eventStatus": event_status, "liveScore": observed_score if status.get("state") in {"in", "post"} else None,
        "availability": {"players": people, "currentTeamBulletin": bulletin,
            "context": "current-team-bulletin" if future_bulletin else "event-scoped-provider-report",
            "completeOfficialList": False, "confirmation": "provider-reported",
            "sourceIds": source_ids, "note": "ESPN event-scoped reports, including explicit fantasy INACTIVE. Not an exhaustive official inactive list; absence does not establish active/healthy status."},
        "statisticsWindow": "Only completed corroborated regular-season games enter historical windows. Partial live boxscore is excluded; attempts never establish a QB start."}


def bulletin_projection_unknown(report, current_week, weekly_injuries, qb_ids):
    """A reused bulletin cannot supply pregame QB eligibility.

    An explicitly dated, same-week NFL injury record for a QB can support a
    depth-chart inference separately. No record/omission establishes health.
    """
    if report["availability"]["context"] != "current-team-bulletin":
        return False
    return report["week"] != current_week or not any(
        row.get("week") == report["week"] and row.get("playerId") in qb_ids
        and "nflverse_injuries" in row.get("sourceIds", [])
        and (row.get("reportStatus") or row.get("practiceStatus"))
        for row in weekly_injuries)


def reviewed_role_evidence():
    """Reviewed event/quote mappings, revalidated against actual public bodies.

    Prose is evidence, never executable instructions. A disagreement is retained
    rather than deciding which provider is right or inferring from attempts.
    """
    return json.loads(ROLE_EVIDENCE.read_text())


def role_specifications(evidence):
    specs = {}
    for item in evidence["contradictions"] + evidence["affirmativeFirstPlay"]:
        source_id = item["sourceId"]
        event = source_id.rsplit("_", 1)[-1]
        specs[source_id] = {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event}",
                            "cache": f"matchup-espn-start-summary-{event}.json", "provider": "ESPN/AP", "required": False}
    for item in evidence["unresolvedRoleRows"]:
        event = item["espnEventId"]
        specs[f"espn_start_summary_{event}"] = {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={event}",
                                                "cache": f"matchup-espn-start-summary-{event}.json", "provider": "ESPN/AP", "required": False}
    return specs


def verified_role_quote(item, bodies, sources, raw_games):
    source_id = item["sourceId"]
    body = bodies.get(source_id)
    if not body or sources.get(source_id, {}).get("status") != "verified":
        return None
    data = json.loads(body)
    event_id = source_id.rsplit("_", 1)[-1]
    schedule_event = str(raw_games.get(item["gameId"], {}).get("espn") or "")
    article = data.get("article", {})
    if str(data.get("header", {}).get("id")) != event_id or schedule_event != event_id:
        raise ValueError(f"Starter evidence does not match its scheduled event: {item['gameId']}/{event_id}")
    # AP article.story is HTML (athlete names are links). Compare its exact
    # rendered text, not raw markup; retain the untouched response/body hash.
    def rendered_text(value):
        value = " ".join(html.unescape(re.sub(r"<[^>]*>", " ", value)).split())
        return re.sub(r"\s+([.,!?;:])", r"\1", value)
    text = rendered_text(article.get("story", ""))
    if rendered_text(item["quote"]) not in text:
        return None  # Changed recap cannot silently establish the previous claim.
    return {"quote": item["quote"], "quoteField": "article.story", "publishedAt": article.get("published"),
            "eventId": event_id, "sourceIds": ["nflverse_games", source_id],
            "retrievedAt": sources[source_id]["retrievedAt"], "sha256": sources[source_id]["sha256"]}


def starting_role(player_id, entry, raw_games, final_games, bodies, sources, evidence):
    game_id = entry["gameId"]
    raw = raw_games[game_id]
    starter = raw.get("home_qb_id" if entry["team"] == final_games[game_id]["home_team"] else "away_qb_id") or None
    role = {"value": player_id == starter if starter else None, "candidate": player_id == starter if starter else False,
            "status": "verified" if starter else "unavailable", "sourceIds": ["nflverse_games"] if starter else [],
            "note": "Explicit starting-QB identifier in the published game schedule; never inferred from pass attempts"}
    for item in evidence["contradictions"]:
        if item["gameId"] != game_id or player_id not in {item["primaryQBId"], item["secondaryQBId"]}:
            continue
        quote = verified_role_quote(item, bodies, sources, raw_games)
        if starter == item["secondaryQBId"] and quote:
            return {**role, "sourceIds": quote["sourceIds"], "corroborated": True, "evidence": quote,
                    "note": "Explicit schedule role now agrees with the independently published recap"}
        # Even if a secondary source becomes unavailable, do not erase a known
        # contradiction. Dated exact evidence is retained, not represented fresh.
        retained = quote or {key: item.get(key) for key in ("quote", "quoteField", "publishedAt", "retrievedAt", "sha256")}
        return {"value": None, "candidate": True, "reportedValue": player_id == starter, "status": "disputed",
                "sourceIds": ["nflverse_games", item["sourceId"]], "evidence": retained,
                "retainedEvidence": quote is None, "primaryPlayerId": item["primaryQBId"], "secondaryPlayerId": item["secondaryQBId"],
                "note": "Schedule and event-matched AP recap disagree on starting QB. Both candidate roles remain null; no provider chosen."}
    if role["value"] is True and entry["sourceIds"] == ["nflverse_games"]:
        for item in evidence["affirmativeFirstPlay"]:
            if item["gameId"] == game_id and item["playerId"] == player_id:
                quote = verified_role_quote(item, bodies, sources, raw_games)
                if quote:
                    return {**role, "sourceIds": quote["sourceIds"], "corroborated": True, "evidence": quote,
                            "note": "Schedule starting-QB role corroborated by explicit first-play recap; one snap is a start, statistics remain unavailable"}
        return {**role, "value": None, "reportedValue": True, "status": "unavailable",
                "note": "Schedule-designated QB with no statistical row or independent role corroboration. Candidate retained; confirmed start/statistical GP unavailable."}
    return role


def crosscheck_statistics(histories, bodies, sources):
    """Null disputed cells; agreeing yards remain eligible for yard rankings."""
    espn_ids = {}
    for row in rows(bodies["nflverse_roster"]):
        if row.get("espn_id") and row.get("gsis_id"):
            espn_ids[str(row["espn_id"])] = row["gsis_id"]
    mapping = {"passingYards": "passingYards", "passingTouchdowns": "passingTD", "interceptions": "interceptions",
               "rushingAttempts": "carries", "rushingYards": "rushingYards", "rushingTouchdowns": "rushingTD",
               "receptions": "receptions", "receivingYards": "receivingYards", "receivingTouchdowns": "receivingTD",
               "receivingTargets": "targets"}
    disagreements, checked = [], 0
    for source_id, body in bodies.items():
        if not source_id.startswith("espn_matchup_summary_") or body is None:
            continue
        data = json.loads(body)
        event_id = str(data.get("header", {}).get("id") or source_id.rsplit("_", 1)[-1])
        for team in data.get("boxscore", {}).get("players", []):
            abbr = details.team_abbr(team.get("team", {}).get("abbreviation"))
            for category in team.get("statistics", []):
                if category.get("name") not in {"passing", "rushing", "receiving"}:
                    continue
                for athlete in category.get("athletes", []):
                    player_id = espn_ids.get(str(athlete.get("athlete", {}).get("id")))
                    entries = histories.get(player_id, {})
                    entry = next((entry for entry in entries.values() if entry["team"] == abbr and entry.get("espnEventId") == event_id), None)
                    if not entry:
                        continue
                    values = dict(zip(category.get("keys", []), athlete.get("stats", [])))
                    reported = {target: num(values[key]) for key, target in mapping.items() if key in values}
                    if "completions/passingAttempts" in values:
                        pair = values["completions/passingAttempts"].split("/")
                        if len(pair) == 2:
                            reported.update(completions=num(pair[0]), attempts=num(pair[1]))
                    if "sacks-sackYardsLost" in values:
                        pair = values["sacks-sackYardsLost"].split("-", 1)
                        if len(pair) == 2:
                            reported.update(sacks=num(pair[0]), sackYardsLost=abs(num(pair[1])) if num(pair[1]) is not None else None)
                    for field, value in reported.items():
                        original = entry["stats"].get(field)
                        if original is None or value is None:
                            continue
                        checked += 1
                        if original != value:
                            issue = {"team": abbr, "playerId": player_id, "gameId": entry["gameId"], "field": field,
                                     "values": [original, value], "sourceIds": entry["sourceIds"] + [source_id],
                                     "action": "Disputed cell and dependent rates/totals unavailable; agreeing fields remain verified"}
                            disagreements.append(issue)
                            entry.setdefault("disagreements", []).append(issue)
                            entry["stats"][field] = None
                            dependent = {"targets": ["targetShare"], "completions": ["completionPct", "passerRating"],
                                         "attempts": ["completionPct", "passerRating", "yardsPerAttempt"],
                                         "passingYards": ["passerRating", "yardsPerAttempt"], "passingTD": ["passerRating", "touchdownsAccountedFor"],
                                         "interceptions": ["passerRating"], "rushingYards": ["yardsPerCarry"], "carries": ["yardsPerCarry"],
                                         "receivingYards": ["yardsPerReception"], "receptions": ["yardsPerReception"]}
                            for key in dependent.get(field, []):
                                if key in entry["stats"]:
                                    entry["stats"][key] = None
                        else:
                            entry.setdefault("crosscheck", {"status": "verified", "sourceIds": [], "fields": []})
                            if source_id not in entry["crosscheck"]["sourceIds"]:
                                entry["crosscheck"]["sourceIds"].append(source_id)
                            if field not in entry["crosscheck"]["fields"]:
                                entry["crosscheck"]["fields"].append(field)
    return disagreements, checked


def source_provenance(source_ids, sources, season=None, week=None, origin="reported", note=None):
    available = [key for key in source_ids if sources.get(key, {}).get("status") == "verified"]
    times = [sources[key]["retrievedAt"] for key in available]
    result = {"status": "verified" if available else "unavailable", "origin": origin,
              "sourceIds": available, "retrievedAt": min(times) if times else None}
    if season is not None:
        result["season"] = season
    if week is not None:
        result["week"] = week
    if note:
        result["note"] = note
    return result


def normalize_stats(row):
    values = refresh.aggregate_stats([row])
    values["yardsPerAttempt"] = refresh.ratio(values["passingYards"], values["attempts"])
    return {key: value for key, value in values.items() if key in DISPLAY_STATS}


def pbp_statistics(body, final_games):
    """Explicit PBP counts, with complete-game score corroboration.

    NFLverse standard PBP does not provide pressures, route runs or blitz labels.
    QB hits are displayed as hits, never substituted for pressure.
    """
    output = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.Counter()))
    coverage, targets, seen_games = set(), collections.Counter(), set()
    required = {"game_id", "posteam", "season_type", "play_type", "passer_player_id", "receiver_player_id",
                "rusher_player_id", "qb_dropback", "qb_hit", "qb_scramble", "qb_kneel", "sack", "yardline_100",
                "pass_attempt", "complete_pass", "pass_touchdown", "air_yards", "home_score", "away_score",
                "desc", "qtr", "game_seconds_remaining", "total_home_score", "total_away_score",
                "rush_attempt", "rushing_yards", "passing_yards", "two_point_attempt", "play_deleted"}
    reader = rows(body, True)
    if not required.issubset(reader.fieldnames or []):
        return {}, {}, {"status": "unavailable", "note": "PBP schema lacks required explicit fields"}
    for row in reader:
        game_id, team = row.get("game_id"), row.get("posteam")
        if game_id not in final_games or row.get("season_type") != "REG":
            continue
        game = final_games[game_id]
        seen_games.add(game_id)
        score_pair = num(row.get("total_home_score")), num(row.get("total_away_score"))
        quarter, seconds = num(row.get("qtr")), num(row.get("game_seconds_remaining"))
        end_game = row.get("desc", "").strip().upper() in {"END GAME", "END OF GAME"}
        end_clock = quarter is not None and (quarter > 4 or quarter == 4 and seconds == 0)
        if end_game and end_clock and score_pair == (game["home_score"], game["away_score"]):
            coverage.add(game_id)
        if not team or row.get("play_deleted") == "1" or row.get("play_type") == "no_play" or row.get("two_point_attempt") == "1":
            continue
        passer, receiver, rusher = (row.get(f"{role}_player_id") for role in ("passer", "receiver", "rusher"))
        # Scrambles are recorded under rusher_player_id, with an empty passer ID.
        # They still belong in this QB's dropback/scramble denominator.
        if not passer and row.get("qb_scramble") == "1":
            passer = rusher
        red = num(row.get("yardline_100")) is not None and 0 < num(row.get("yardline_100")) <= 20
        if receiver and row.get("pass_attempt") == "1" and row.get("sack") != "1":
            targets[(game_id, team)] += 1
            stats = output[game_id][receiver]
            if red:
                stats["redZoneTargets"] += 1
                stats["redZoneReceptions"] += row.get("complete_pass") == "1"
                stats["redZoneReceivingTD"] += row.get("pass_touchdown") == "1"
        if passer:
            stats = output[game_id][passer]
            stats["dropbacks"] += row.get("qb_dropback") == "1"
            stats["qbHits"] += row.get("qb_hit") == "1"
            if row.get("qb_scramble") == "1":
                stats["scrambles"] += 1
                if num(row.get("rushing_yards")) is not None:
                    stats["scrambleYards"] += num(row["rushing_yards"])
            attempt = row.get("pass_attempt") == "1" and row.get("sack") != "1"
            if red and attempt:
                stats["redZonePassAttempts"] += 1
                stats["redZonePassTD"] += row.get("pass_touchdown") == "1"
            if attempt and num(row.get("air_yards")) is not None and num(row["air_yards"]) >= 20:
                stats["deepAttempts"] += 1
                stats["deepCompletions"] += row.get("complete_pass") == "1"
                if num(row.get("passing_yards")) is not None:
                    stats["deepYards"] += num(row["passing_yards"])
        if rusher and row.get("rush_attempt") == "1" and row.get("qb_scramble") != "1" and row.get("qb_kneel") != "1":
            stats = output[game_id][rusher]
            stats["designedRuns"] += 1
            if num(row.get("rushing_yards")) is not None:
                stats["designedRunYards"] += num(row["rushing_yards"])
        if rusher and red and row.get("rush_attempt") == "1" and row.get("qb_kneel") != "1":
            output[game_id][rusher]["redZoneRushAttempts"] += 1
    valid = coverage
    return {key: value for key, value in output.items() if key in valid}, {key: value for key, value in targets.items() if key[0] in valid}, {
        "status": "verified" if valid else "unavailable", "completeGames": sorted(valid),
        "rejectedGames": sorted(seen_games - valid), "note": "Explicit END GAME marker, final quarter/clock and evolving total-score corroboration required; no-play/deleted/two-point plays excluded"}


def latest_depth(body, season):
    latest, result = {}, collections.defaultdict(list)
    for row in rows(body):
        if row.get("season") != str(season) or not row.get("team") or not row.get("dt"):
            continue
        team, timestamp = details.team_abbr(row["team"]), row["dt"]
        if timestamp > latest.get(team, ""):
            latest[team], result[team] = timestamp, []
        if timestamp == latest[team]:
            result[team].append({"name": row.get("player_name"), "playerId": row.get("gsis_id") or None,
                                 "espnId": row.get("espn_id") or None, "position": row.get("pos_abb"),
                                 "rank": num(row.get("pos_rank")), "unit": row.get("pos_grp"),
                                 "sourceTimestamp": timestamp, "sourceIds": ["nflverse_depth"]})
    return result


def espn_depth(body, abbr, espn_ids):
    if body is None:
        return [], []
    data = json.loads(body)
    if details.team_abbr(data.get("team", {}).get("abbreviation")) != abbr:
        raise ValueError(f"ESPN depth team mismatch for {abbr}")
    depth, injuries = [], []
    for group in data.get("depthchart", []):
        for position in group.get("positions", {}).values():
            abbreviation = position.get("position", {}).get("abbreviation")
            for rank, athlete in enumerate(position.get("athletes", []), 1):
                player_id = espn_ids.get(str(athlete.get("id")))
                depth.append({"name": athlete.get("displayName"), "playerId": player_id,
                              "espnId": str(athlete.get("id")), "position": abbreviation, "rank": rank,
                              "unit": group.get("name"), "sourceTimestamp": data.get("timestamp"),
                              "sourceIds": [f"espn_matchup_depth_{abbr}"]})
                for injury in athlete.get("injuries", []):
                    item = {"playerId": player_id, "name": athlete.get("displayName"), "position": abbreviation,
                            "reportStatus": injury.get("status"), "practiceStatus": None,
                            "injury": injury.get("details", {}).get("type") or injury.get("shortComment") or None,
                            "season": None, "week": None, "gameId": None,
                            "context": "current-team-bulletin", "gameApplicability": "unavailable",
                            "note": "Dated ESPN depth-chart news; no published season, game or report week. Does not establish selected-fixture eligibility.",
                            "sourceTimestamp": injury.get("date"), "sourceIds": [f"espn_matchup_depth_{abbr}"]}
                    if item not in injuries:
                        injuries.append(item)
    return depth, injuries


def qualify_injury_reports(weekly_injuries, direct_injuries):
    """Keep explicitly published weekly reports separate from undated scope.

    A depth-chart injury's timestamp dates news, not a game-week report. Even
    matching player names or agreeing status cannot supply its missing scope.
    Preserve NFL participation and status exactly; dated provider news remains
    visible separately and cannot override or dispute a different weekly report.
    """
    weekly = copy.deepcopy(weekly_injuries)
    bulletins = []
    for item in direct_injuries:
        bulletin = {**copy.deepcopy(item), "season": None, "week": None, "gameId": None,
                    "context": "current-team-bulletin", "gameApplicability": "unavailable"}
        if bulletin.get("playerId"):
            bulletin["identitySourceIds"] = ["nflverse_player_ids"]
        if bulletin not in bulletins:
            bulletins.append(bulletin)
    return weekly, bulletins


def build(base, team_details, bodies, source_list, dependencies, previous=None):
    season = base["season"]
    role_evidence = reviewed_role_evidence()
    sources = {source["id"]: source for source in source_list}
    # Keep the exact provenance of dependency facts separately from fresh feeds.
    dependency_sources = []
    for source in team_details["sources"]:
        dependency_sources.append({**source, "id": "team_" + source["id"]})
    sources.update({source["id"]: source for source in dependency_sources})
    all_games = {}
    for team in team_details["teams"].values():
        for game in team["games"]:
            all_games[game["id"]] = game
    final_games = {key: game for key, game in all_games.items() if game["status"] == "final"}
    raw_games = {row["game_id"]: row for row in rows(bodies["nflverse_games"])
                 if row.get("game_type") == "REG" and refresh.HISTORY_FIRST_SEASON <= int(row["season"]) <= season}
    for key, game in final_games.items():
        row = raw_games.get(key)
        if row is None or (row["home_team"], row["away_team"], num(row.get("home_score")), num(row.get("away_score"))) != (
                game["home_team"], game["away_team"], game["home_score"], game["away_score"]):
            raise ValueError(f"Schedule/source disagreement for {key}; refresh the linked team snapshot first")
    roster_rows = [row for row in rows(bodies["nflverse_roster"]) if row.get("season") == str(season)
                   and row.get("status") not in {"CUT", "RET"} and row.get("gsis_id") and row.get("team") in team_details["teams"]]
    if len({row["team"] for row in roster_rows}) != 32:
        raise ValueError("Current roster does not cover all 32 linked teams")
    weekly_opponents = {}
    fixture_reports = collections.defaultdict(dict)
    team_details = copy.deepcopy(team_details)
    for abbr, team in team_details["teams"].items():
        team["nextScheduledGameId"] = team["upcomingGameId"]
        for game in team["games"]:
            sid = f"espn_fixture_summary_{game.get('espnEventId')}"
            if sid not in sources:
                continue
            report = fixture_report(game, abbr, bodies.get(sid), sources[sid], {}, base["currentWeek"])
            if report:
                fixture_reports[abbr][game["id"]] = report
                # A clock passing kickoff cannot establish live state. Retain an
                # actual provider-reported live fixture until the source says final.
                if report["eventStatus"]["state"] == "in" and report["eventStatus"]["completed"] is False:
                    team["upcomingGameId"] = game["id"]
    current_ids = {row["gsis_id"] for row in roster_rows if row.get("position") in OFFENSE}
    current_qbs = {row["gsis_id"] for row in roster_rows if row.get("position") == "QB"}
    player_clubs = {row["gsis_id"]: row["team"] for row in roster_rows}
    for abbr, team in team_details["teams"].items():
        fixture = next((game for game in team["games"] if game["id"] == team["upcomingGameId"]), None)
        weekly_opponents[abbr] = (fixture["away_team"] if fixture["home_team"] == abbr else fixture["home_team"]) if fixture else None
    for key, row in raw_games.items():
        if key in final_games or int(row["season"]) >= season - 1:
            continue
        if num(row.get("home_score")) is not None and num(row.get("away_score")) is not None:
            final_games[key] = details.normalize_game(row, dt.datetime.now(UTC), {})
            final_games[key]["home_team"] = refresh.canonical_team(row["home_team"])
            final_games[key]["away_team"] = refresh.canonical_team(row["away_team"])
    identity_rows = {row["gsis_id"]: row for row in rows(bodies.get("nflverse_player_ids")) if row.get("gsis_id")}
    # The public identity map covers injured linemen whose current roster CSV
    # omits ESPN IDs. Match exact provider IDs, never fuzzy player names.
    espn_ids = {str(row["espn_id"]): row["gsis_id"] for row in identity_rows.values() if row.get("espn_id")}
    for row in roster_rows:
        if not row.get("espn_id"):
            continue
        existing = espn_ids.get(str(row["espn_id"]))
        if existing and existing != row["gsis_id"]:
            raise ValueError(f"Provider identity IDs disagree for ESPN player {row['espn_id']}")
        espn_ids[str(row["espn_id"])] = row["gsis_id"]
    for reports in fixture_reports.values():
        for report in reports.values():
            for person in report["availability"]["players"] + report["availability"]["currentTeamBulletin"]:
                person["playerId"] = espn_ids.get(person["espnId"])
                person["identitySourceIds"] = ["nflverse_player_ids"] if person["playerId"] else []
        current_people = [(report, person) for report in reports.values()
                          for person in report["availability"]["players"]]
        for report in reports.values():
            for person in report["availability"]["currentTeamBulletin"]:
                matched = next(((prior_report, prior) for prior_report, prior in current_people
                    if prior.get("espnId") == person.get("espnId")
                    and prior.get("sourceTimestamp") == person.get("sourceTimestamp")
                    and prior.get("reportStatus") == person.get("reportStatus")
                    and prior.get("injury") == person.get("injury")), None)
                if matched:
                    prior_report, prior = matched
                    person["reportWeek"] = prior_report["week"]
                    person["contextGameId"] = prior_report["gameId"]
                    person["contextEventId"] = prior_report["eventId"]
                    person["contextSourceIds"] = prior_report["sourceIds"]
    pfr_ids = {row["pfr_id"]: row["gsis_id"] for row in identity_rows.values() if row.get("pfr_id")}
    histories = collections.defaultdict(dict)
    required = set(refresh.STAT_FIELDS.values()) | {"game_id", "player_id", "team", "opponent_team", "season", "week", "season_type"}
    for year in range(refresh.HISTORY_FIRST_SEASON, season + 1):
        source_id = "nflverse_player_stats" if year == season else f"nflverse_player_stats_{year}"
        reader = rows(bodies.get(source_id))
        if year == season and not required.issubset(reader.fieldnames or []):
            raise ValueError("Current statistical source lacks required game/statistic columns")
        for row in reader:
            if row.get("season_type") != "REG" or row.get("game_id") not in final_games:
                continue
            if row.get("position") not in OFFENSE:
                continue
            row["team"] = refresh.canonical_team(row.get("team"))
            row["opponent_team"] = refresh.canonical_team(row.get("opponent_team"))
            if year < season - 1 and row.get("player_id") not in current_ids:
                continue
            game, player_id = final_games[row["game_id"]], row["player_id"]
            if row["team"] not in {game["home_team"], game["away_team"]} or int(row["season"]) != year:
                raise ValueError(f"Statistical row does not match linked game context: sourceYear={year} game={row.get('game_id')} team={row.get('team')} season={row.get('season')} linked={game['home_team']}/{game['away_team']}")
            if game["id"] in histories[player_id]:
                raise ValueError(f"Duplicate player-game statistics: {player_id}/{game['id']}")
            histories[player_id][game["id"]] = {"gameId": game["id"], "season": year, "week": int(row["week"]),
                "team": row["team"], "opponent": row["opponent_team"], "kickoffUtc": game["kickoffUtc"],
                "homeAway": "neutral" if game.get("neutral") else "home" if row["team"] == game["home_team"] else "away",
                "stats": normalize_stats(row), "sourceIds": [source_id],
                "espnEventId": str(game["espnEventId"]) if game.get("espnEventId") else None,
                "appearance": {"status": "recorded", "sourceIds": [source_id],
                               "note": "A published statistical row; not a fabricated appearance or absent-game zero"},
                "provenance": source_provenance([source_id], sources, year, int(row["week"]), "computed",
                                              "Reported weekly counts; rates computed from numeric inputs")}
    # A source-designated role with no statistical row is retained as a candidate
    # with unknown statistics/participation. It is not independently confirmed.
    # Skipping it would silently substitute an older game in the requested window.
    missing_start_rows = []
    for player_id in current_qbs:
        opponent = weekly_opponents.get(player_clubs[player_id])
        starting_games = sorted([game for game in final_games.values() if player_id in {
                raw_games[game["id"]].get("home_qb_id"), raw_games[game["id"]].get("away_qb_id")}],
                key=lambda game: (game["gameday"], game["id"]), reverse=True)
        chosen = {game["id"] for game in starting_games[:5]}
        chosen.update(game["id"] for game in [game for game in starting_games
            if opponent in (game["home_team"], game["away_team"])][:5])
        for game in starting_games:
            if game["id"] not in chosen or game["id"] in histories[player_id]:
                continue
            raw = raw_games[game["id"]]
            team = game["home_team"] if raw.get("home_qb_id") == player_id else game["away_team"]
            entry = {"gameId": game["id"], "season": game["season"], "week": game["week"], "team": team,
                     "opponent": game["away_team"] if team == game["home_team"] else game["home_team"],
                     "kickoffUtc": game["kickoffUtc"], "homeAway": "neutral" if game.get("neutral") else "home" if team == game["home_team"] else "away",
                     "espnEventId": str(game["espnEventId"]) if game.get("espnEventId") else None,
                     "stats": dict.fromkeys(sorted(DISPLAY_STATS)), "sourceIds": ["nflverse_games"],
                     "appearance": {"status": "unavailable", "sourceIds": ["nflverse_games"],
                                    "note": "Provider-designated starting QB; no weekly statistical row. No zero statistics or statistical GP invented."},
                     "provenance": source_provenance(["nflverse_games"], sources, game["season"], game["week"], "reported",
                                                     "Published schedule-designated QB identity and game context; starting-role corroboration and player statistics evaluated separately")}
            histories[player_id][game["id"]] = entry
            missing_start_rows.append({"playerId": player_id, "gameId": game["id"], "sourceIds": ["nflverse_games"],
                                       "note": "Schedule-designated starting-role candidate with unavailable statistical row; no zero values or statistical GP"})
    # Historical opponent rows are genuine but bounded to the requested five,
    # plus five explicit QB starts where a relief appearance would differ.
    for player_id, history in histories.items():
        archived = sorted([entry for entry in history.values() if entry["season"] < season-1],
                          key=lambda entry: (entry["kickoffUtc"] or "", entry["gameId"]), reverse=True)
        opponent = weekly_opponents.get(player_clubs.get(player_id))
        opponent_rows = [entry for entry in archived if entry["opponent"] == opponent]
        recent_rows = [entry for entry in history.values() if entry["season"] >= season - 1]
        recent_opponent_rows = [entry for entry in recent_rows if entry["opponent"] == opponent]
        retained = {entry["gameId"] for entry in archived[:max(0, 5-len(recent_rows))]}
        retained.update(entry["gameId"] for entry in opponent_rows[:max(0, 5-len(recent_opponent_rows))])
        starters = [entry for entry in archived if player_id == raw_games[entry["gameId"]].get(
            "home_qb_id" if entry["team"] == final_games[entry["gameId"]]["home_team"] else "away_qb_id")]
        recent_starters = [entry for entry in recent_rows if player_id == raw_games[entry["gameId"]].get(
            "home_qb_id" if entry["team"] == final_games[entry["gameId"]]["home_team"] else "away_qb_id")]
        retained.update(entry["gameId"] for entry in starters[:max(0, 5-len(recent_starters))])
        retained.update(entry["gameId"] for entry in [row for row in starters if row["opponent"] == opponent][
            :max(0, 5-len([row for row in recent_starters if row["opponent"] == opponent]))])
        # Both sides of a reviewed role contradiction must survive historical
        # trimming. Unknown recent roles cannot disappear in favour of older ones.
        retained.update(item["gameId"] for item in role_evidence["contradictions"]
                        if player_id in {item["primaryQBId"], item["secondaryQBId"]})
        for entry in archived:
            if entry["gameId"] not in retained:
                del history[entry["gameId"]]
    stat_disagreements, crosschecked_cells = crosscheck_statistics(histories, bodies, sources)
    # A failed secondary source cannot silently erase a known numeric dispute.
    for old_issue in (previous or {}).get("disagreements", []):
        if not old_issue.get("gameId") or not old_issue.get("playerId"):
            continue
        entry = histories.get(old_issue["playerId"], {}).get(old_issue["gameId"])
        field = old_issue.get("field")
        secondary = [key for key in old_issue.get("sourceIds", []) if key.startswith("espn_matchup_summary_")]
        if not entry or not field or not secondary or any(bodies.get(key) is not None for key in secondary):
            continue
        issue = {**old_issue, "retainedEvidence": True,
                 "action": "Dated disagreement retained because secondary revalidation is unavailable; cell remains null"}
        for key in old_issue["sourceIds"]:
            prior_source = next((source for source in (previous or {}).get("sources", []) if source["id"] == key), None)
            if prior_source and key not in sources:
                sources[key] = {**prior_source, "retainedEvidence": True}
        entry["stats"][field] = None
        entry.setdefault("disagreements", []).append(issue)
        stat_disagreements.append(issue)
    snapshots = {}
    snap_sources = {}
    for year in (season - 1, season):
        source_id = f"nflverse_snaps_{year}"
        for row in rows(bodies.get(source_id)):
            if row.get("game_type") != "REG" or row.get("game_id") not in final_games:
                continue
            player_id = pfr_ids.get(row.get("pfr_player_id"))
            if not player_id:
                continue  # No name-based guess to link two different athletes.
            key = (player_id, row["game_id"])
            if key in snapshots:
                raise ValueError(f"Duplicate player snap row {key}")
            snapshots[key] = {"snaps": num(row.get("offense_snaps")),
                              "offensiveSnapPct": num(row.get("offense_pct")) * 100 if num(row.get("offense_pct")) is not None else None}
            snap_sources[key] = source_id
    pbp_values, team_targets, pbp_coverage = {}, {}, {}
    for year in (season - 1, season):
        source_id = f"nflverse_pbp_{year}"
        if bodies.get(source_id) is None:
            pbp_coverage[str(year)] = {"status": "unavailable", "sourceIds": [source_id]}
            continue
        values, targets, coverage = pbp_statistics(bodies[source_id], final_games)
        pbp_values.update(values)
        team_targets.update(targets)
        pbp_coverage[str(year)] = {**coverage, "sourceIds": [source_id]}
    for player_id, history in histories.items():
        for game_id, entry in history.items():
            game = final_games[game_id]
            entry["started"] = starting_role(player_id, entry, raw_games, final_games, bodies, sources, role_evidence)
            advanced = dict.fromkeys(ADVANCED_FIELDS)
            field_sources = {}
            snap_key = (player_id, game_id)
            if snap_key in snapshots:
                advanced.update(snapshots[snap_key])
                advanced["offensiveSnaps"] = advanced["snaps"]
                field_sources.update({key: [snap_sources[snap_key]] for key, value in snapshots[snap_key].items() if value is not None})
                if advanced["offensiveSnaps"] is not None:
                    field_sources["offensiveSnaps"] = [snap_sources[snap_key]]
                if advanced["snaps"] is not None and advanced["snaps"] > 0:
                    entry["appearance"] = {"status": "verified", "sourceIds": [snap_sources[snap_key]], "note": "Positive published offensive snap count"}
            coverage = pbp_coverage.get(str(entry["season"]), {})
            source_id = f"nflverse_pbp_{entry['season']}"
            if game_id in coverage.get("completeGames", []):
                counts = pbp_values.get(game_id, {}).get(player_id, {})
                for key in ("redZoneTargets", "redZoneReceptions", "redZoneReceivingTD", "redZonePassAttempts", "redZonePassTD", "dropbacks", "qbHits",
                            "scrambles", "scrambleYards", "designedRuns", "designedRunYards", "deepAttempts", "deepCompletions", "deepYards", "redZoneRushAttempts"):
                    advanced[key] = counts.get(key, 0)
                    field_sources[key] = [source_id]
                advanced["teamTargets"] = team_targets.get((game_id, entry["team"]), 0)
                advanced["targetShare"] = refresh.ratio(entry["stats"]["targets"] * 100 if entry["stats"]["targets"] is not None else None, advanced["teamTargets"])
                advanced["sackRate"] = refresh.ratio(entry["stats"]["sacks"] * 100 if entry["stats"]["sacks"] is not None else None, advanced["dropbacks"])
                field_sources["teamTargets"] = [source_id]
                if advanced["targetShare"] is not None:
                    field_sources["targetShare"] = [source_id] + entry["sourceIds"]
                if advanced["sackRate"] is not None:
                    field_sources["sackRate"] = [source_id] + entry["sourceIds"]
            entry["advanced"] = advanced
            entry["advancedProvenance"] = {"status": "verified" if field_sources else "unavailable", "origin": "computed",
                                          "fieldSources": field_sources, "retrievedAt": min([sources[key]["retrievedAt"] for ids in field_sources.values() for key in ids], default=None),
                                          "season": entry["season"], "week": entry["week"],
                                          "contract": "provenance.advanced"}
    depth = latest_depth(bodies.get("nflverse_depth"), season)
    injuries = collections.defaultdict(list)
    for row in rows(bodies.get("nflverse_injuries")):
        if row.get("season") != str(season) or not row.get("team"):
            continue
        injuries[row["team"]].append({"playerId": row.get("gsis_id") or None, "name": row.get("full_name"), "position": row.get("position"),
                                     "week": int(row["week"]), "reportStatus": row.get("report_status") or None,
                                     "practiceStatus": row.get("practice_status") or None,
                                     "injury": row.get("report_primary_injury") or row.get("practice_primary_injury") or None,
                                     "sourceIds": ["nflverse_injuries"]})
    role_disagreements = []
    for item in role_evidence["contradictions"]:
        raw = raw_games.get(item["gameId"], {})
        quote = verified_role_quote(item, bodies, sources, raw_games)
        if quote and item["secondaryQBId"] in {raw.get("home_qb_id"), raw.get("away_qb_id")}:
            continue  # A later primary correction genuinely resolves the disagreement.
        role_disagreements.append({"team": refresh.canonical_team(raw.get("home_team") if raw.get("home_qb_id") == item["primaryQBId"] else raw.get("away_team")),
            "gameId": item["gameId"], "field": "startingQuarterback", "status": "disputed",
            "playerIds": [item["primaryQBId"], item["secondaryQBId"]],
            "values": [item["primaryQBId"], item["secondaryQBId"]], "sourceIds": ["nflverse_games", item["sourceId"]],
            "evidence": quote or {key: item.get(key) for key in ("quote", "quoteField", "publishedAt", "retrievedAt", "sha256")},
            "retainedEvidence": quote is None, "action": "Both roles disputed/null; preserve candidates in requested QB window without selecting a provider or substituting older starts"})
    teams, disagreements = {}, stat_disagreements + role_disagreements
    for abbr, original in team_details["teams"].items():
        direct_roster = json.loads(bodies[f"espn_matchup_roster_{abbr}"]) if bodies.get(f"espn_matchup_roster_{abbr}") else {}
        espn_roster = {str(athlete["id"]): athlete for group in direct_roster.get("athletes", [])
                       for athlete in group.get("items", []) if athlete.get("id")}
        team = {key: copy.deepcopy(original[key]) for key in ("abbr", "name", "fullName", "conference", "division", "record", "games", "upcomingGameId")}
        team["nextScheduledGameId"] = original["nextScheduledGameId"]
        team["researchGameId"] = team["upcomingGameId"]
        team["fixtureReports"] = fixture_reports.get(abbr, {})
        default_report = team["fixtureReports"].get(team["upcomingGameId"])
        team["defaultResearchFixtureEvidence"] = {"gameId": team["upcomingGameId"],
            "sourceIds": default_report["sourceIds"] if default_report else ["team_nflverse_games"],
            "note": "Actual provider-reported live event preferred; otherwise published next scheduled fixture. No game status inferred from clock."}
        opponent = weekly_opponents[abbr]
        h2h = sorted([game for game in final_games.values()
                      if opponent and {game["home_team"], game["away_team"]} == {abbr, opponent}],
                     key=lambda game: (game["gameday"], game["id"]), reverse=True)[:5]
        team["headToHeadGames"] = copy.deepcopy(h2h)
        team["headToHeadCoverage"] = {"opponent": opponent, "count": len(h2h), "sourceIds": ["nflverse_games"],
                                       "retrievedAt": sources["nflverse_games"]["retrievedAt"], "seasonTypes": ["REG"],
                                       "note": "Latest five completed regular-season meetings since 2005; no padded rows or postseason substitutions"}
        for game in team["headToHeadGames"]:
            if game["season"] >= season - 1:
                game["sourceIds"] = ["team_" + key for key in game.get("sourceIds", [])]
                for provenance in game.get("statsProvenance", {}).values():
                    provenance["sourceIds"] = ["team_" + key for key in provenance.get("sourceIds", [])]
                    provenance["fieldSources"] = {key: ["team_" + sid for sid in ids] for key, ids in provenance.get("fieldSources", {}).items()}
        for game in team["games"]:
            game["sourceIds"] = ["team_" + key for key in game.get("sourceIds", [])]
            for provenance in game.get("statsProvenance", {}).values():
                provenance["sourceIds"] = ["team_" + key for key in provenance.get("sourceIds", [])]
                provenance["fieldSources"] = {key: ["team_" + sid for sid in ids] for key, ids in provenance.get("fieldSources", {}).items()}
        team["record"]["sourceIds"] = ["team_" + key for key in team["record"].get("sourceIds", [])]
        team["roster"], team["players"] = [], {}
        for row in roster_rows:
            if row["team"] != abbr:
                continue
            identity = {"id": row["gsis_id"], "name": row["full_name"], "position": row.get("position") or None,
                        "jersey": num(row.get("jersey_number")), "number": row.get("jersey_number") or None,
                        "team": abbr, "status": row.get("status"), "espnId": row.get("espn_id") or None,
                        "sourceIds": ["nflverse_roster"], "provenance": source_provenance(["nflverse_roster"], sources, season)}
            crosscheck = espn_roster.get(str(identity["espnId"]))
            if crosscheck:
                jersey = num(crosscheck.get("jersey"))
                if jersey is not None and identity["jersey"] is not None and jersey != identity["jersey"]:
                    disagreements.append({"team": abbr, "playerId": identity["id"], "field": "jersey", "values": [identity["jersey"], jersey],
                                          "sourceIds": ["nflverse_roster", f"espn_matchup_roster_{abbr}"], "action": "Jersey unavailable until sources agree"})
                    identity["jersey"] = identity["number"] = None
                espn_status = crosscheck.get("status", {}).get("name")
                if identity["status"] == "DEV" and espn_status == "Active":
                    disagreements.append({"team": abbr, "playerId": identity["id"], "field": "rosterStatus", "values": [identity["status"], espn_status],
                                          "sourceIds": ["nflverse_roster", f"espn_matchup_roster_{abbr}"], "action": "Status disagreement shown; historical statistical eligibility does not imply game-day activation"})
                    identity["statusEvidence"] = {"status": "disputed", "values": [identity["status"], espn_status],
                                                  "sourceIds": ["nflverse_roster", f"espn_matchup_roster_{abbr}"]}
                    identity["status"] = None
                identity["sourceIds"].append(f"espn_matchup_roster_{abbr}")
            elif direct_roster:
                identity["rosterCrosscheck"] = {"status": "unavailable", "sourceIds": [f"espn_matchup_roster_{abbr}"],
                                                "note": "Not present in this ESPN roster response; absence does not establish release or inactivity"}
            if any(player["id"] == identity["id"] for player in team["roster"]):
                raise ValueError(f"Duplicate current roster identity {abbr}/{identity['id']}")
            team["roster"].append(identity)
            if identity["position"] in OFFENSE:
                game_log = sorted(histories.get(identity["id"], {}).values(), key=lambda entry: (entry["kickoffUtc"] or str(entry["season"]), entry["gameId"]), reverse=True)
                team["players"][identity["id"]] = {**identity, "gameLog": game_log,
                    "weeklyOpponentHistory": {"opponent": weekly_opponents[abbr], "seasonTypes": ["REG"],
                        "availableSeasons": [year for year in range(refresh.HISTORY_FIRST_SEASON, season+1) if sources.get("nflverse_player_stats" if year == season else f"nflverse_player_stats_{year}", {}).get("status") == "verified"],
                        "unavailableSeasons": [year for year in range(refresh.HISTORY_FIRST_SEASON, season+1) if sources.get("nflverse_player_stats" if year == season else f"nflverse_player_stats_{year}", {}).get("status") != "verified"],
                        "note": "Latest five published NFL regular-season statistical rows and five source-designated QB role candidates against the upcoming weekly opponent; verified/disputed/unavailable roles explicit, prior clubs included, never padded"}}
                if identity["position"] == "QB":
                    candidate_rows = [entry for entry in game_log if entry["started"].get("candidate")]
                    team["players"][identity["id"]]["qbStartCoverage"] = {
                        "verifiedCount": sum(entry["started"]["value"] is True and entry["started"]["status"] == "verified" for entry in candidate_rows),
                        "disputedGameIds": [entry["gameId"] for entry in candidate_rows if entry["started"]["status"] == "disputed"],
                        "unavailableGameIds": [entry["gameId"] for entry in candidate_rows if entry["started"]["status"] == "unavailable"],
                        "note": "Filter role candidates before taking latest requested window; unknown roles retain their slots and cannot be replaced with older verified starts"}
        upcoming = next((game for game in team["games"] if game["id"] == team["upcomingGameId"]), None)
        week = upcoming["week"] if upcoming else base["currentWeek"]
        team["depth"] = {"players": depth.get(abbr, []), "sourceStatus": "verified" if depth.get(abbr) else "unavailable",
                         "note": "Published depth order does not confirm game-day starters", "sourceIds": ["nflverse_depth"]}
        weekly_injuries = [row for row in injuries.get(abbr, []) if row["week"] == week]
        direct_depth, direct_injuries = espn_depth(bodies.get(f"espn_matchup_depth_{abbr}"), abbr, espn_ids)
        if direct_depth:
            old_qbs = [(row["playerId"], row["rank"]) for row in team["depth"]["players"] if row["position"] == "QB"]
            new_qbs = [(row["playerId"], row["rank"]) for row in direct_depth if row["position"] == "QB"]
            if old_qbs and old_qbs != new_qbs:
                disagreements.append({"team": abbr, "field": "quarterbackDepthOrder", "values": [old_qbs, new_qbs],
                                      "sourceIds": ["nflverse_depth", f"espn_matchup_depth_{abbr}"], "action": "Projected QB unavailable until sources agree"})
            team["depth"] = {"players": direct_depth, "sourceStatus": "verified", "sourceIds": [f"espn_matchup_depth_{abbr}"],
                             "note": "Fresh published depth order; still not a confirmed game-day starter"}
        weekly_injuries, injury_bulletins = qualify_injury_reports(weekly_injuries, direct_injuries)
        team["injuries"] = {"players": weekly_injuries, "week": week, "sourceStatus": "verified" if weekly_injuries else "unavailable",
                            "currentTeamBulletin": injury_bulletins,
                            "bulletinSourceStatus": "verified" if injury_bulletins else "unavailable",
                            "sourceIds": sorted({key for row in weekly_injuries for key in row["sourceIds"]}),
                            "note": "Explicitly published weekly injury/participation only. Dated depth-chart news is preserved separately as current-team bulletins with unknown game applicability; absence does not prove health. Out report is not a confirmed inactive list."}
        candidates = sorted([row for row in team["depth"]["players"] if row["position"] == "QB" and row.get("rank") is not None], key=lambda row: row["rank"])
        selected = None
        for candidate in candidates:
            injury = next((row for row in weekly_injuries if row.get("playerId") == candidate.get("playerId")), {})
            status = (injury.get("reportStatus") or "").lower()
            if status not in {"out", "injured reserve", "inactive"} and candidate.get("playerId") in team["players"]:
                selected = candidate
                break
        qb_ids = {player["id"] for player in team["players"].values() if player["position"] == "QB"}
        disputed = any(item["team"] == abbr and (item["field"] == "quarterbackDepthOrder" or
                        item["field"] == "reportStatus" and item.get("playerId") in qb_ids) for item in disagreements)
        team["qbEvidence"] = {"playerId": selected["playerId"] if selected and not disputed else None,
                              "status": "inferred" if selected and not disputed else "disputed" if disputed else "unavailable",
                              "projected": bool(selected and not disputed), "confirmed": False,
                              "depthRank": selected["rank"] if selected and not disputed else None,
                              "sourceIds": sorted(set(team["depth"]["sourceIds"] + team["injuries"]["sourceIds"])),
                              "retrievedAt": min([sources[key]["retrievedAt"] for key in team["depth"]["sourceIds"] + team["injuries"]["sourceIds"] if sources.get(key, {}).get("status") == "verified"], default=None),
                              "season": season, "week": week,
                              "note": "Projected from published QB depth excluding reported Out/IR/inactive. Inference, not confirmed starting lineup; disputed evidence prevents projection."}
        for player in team["players"].values():
            if player["position"] == "QB":
                injury = next((row for row in weekly_injuries if row.get("playerId") == player["id"]), {})
                own_depth = next((row for row in candidates if row.get("playerId") == player["id"]), {})
                projected = team["qbEvidence"]["playerId"] == player["id"]
                player["qbEvidence"] = {**team["qbEvidence"], "playerId": player["id"],
                                        "selectedPlayerId": team["qbEvidence"]["playerId"], "projected": projected,
                                        "depthRank": own_depth.get("rank"),
                                        "status": "inferred" if projected else "verified" if own_depth else "unavailable",
                                        "note": team["qbEvidence"]["note"] if projected else "Published QB depth/injury evidence; no game-day starter confirmation",
                                        "reportStatus": injury.get("reportStatus"), "practiceStatus": injury.get("practiceStatus"),
                                        "injury": injury.get("injury"), "injurySourceIds": injury.get("sourceIds", [])}
        for report in team["fixtureReports"].values():
            # Keep published weekly practice separate from latest event-scoped
            # game availability. An Out coach-decision report is not an injury.
            for person in report["availability"]["players"]:
                prior = next((row for row in injuries.get(abbr, [])
                              if row["week"] == report["week"] and row.get("playerId") == person.get("playerId") and person.get("playerId")), None)
                if prior:
                    person["weeklyReport"] = copy.deepcopy(prior)
            blocked = {person["playerId"] for person in report["availability"]["players"]
                       if person.get("reportedInactive") is True or (person.get("reportStatus") or "").lower() in {"out", "injured reserve", "inactive"}}
            same_week = [row for row in injuries.get(abbr, []) if row["week"] == report["week"]]
            if report["week"] == team["injuries"]["week"]:
                same_week = weekly_injuries
            blocked.update(row.get("playerId") for row in same_week
                           if (row.get("reportStatus") or "").lower() in {"out", "injured reserve", "inactive"})
            qb_conflict = any(prior.get("playerId") in qb_ids and prior.get("reportStatus") and person.get("reportStatus")
                              and prior["reportStatus"].lower() != person["reportStatus"].lower()
                              for prior in same_week for person in report["availability"]["players"]
                              if prior.get("playerId") == person.get("playerId"))
            event_disputed = disputed or qb_conflict
            future_unknown = bulletin_projection_unknown(report, base["currentWeek"], injuries.get(abbr, []), qb_ids)
            event_selected = next((candidate for candidate in candidates
                                   if candidate.get("playerId") in team["players"] and candidate["playerId"] not in blocked), None)
            event_source_ids = sorted(set(team["depth"]["sourceIds"] + report["sourceIds"]
                                      + [sid for row in same_week for sid in row.get("sourceIds", [])]))
            report["qbEvidence"] = {**team["qbEvidence"], "gameId": report["gameId"], "eventId": report["eventId"],
                "week": report["week"], "playerId": event_selected["playerId"] if event_selected and not event_disputed and not future_unknown else None,
                "publishedDepthPlayerId": event_selected["playerId"] if event_selected else None,
                "depthRank": event_selected.get("rank") if event_selected and not event_disputed and not future_unknown else None,
                "projected": bool(event_selected and not event_disputed and not future_unknown), "confirmed": False,
                "status": "disputed" if event_disputed else "unavailable" if future_unknown or not event_selected else "inferred",
                "sourceIds": event_source_ids,
                "availabilityContext": report["availability"]["context"],
                "note": ("Future-game availability unavailable: reused current-team bulletin cannot confirm next-week eligibility or inactivity."
                         if report["week"] != base["currentWeek"] else
                         "Pregame QB eligibility unavailable: dated team bulletin has no independently corroborated same-week QB injury report.") if future_unknown else
                        "Inference from published depth, same-week weekly injuries and this exact event's provider-reported availability. No confirmed starter field; live attempts never establish a start."}
        team["dataStatus"] = {"weatherForecast": "unavailable", "travelItinerary": "unavailable", "confirmedInactives": "unavailable",
                              "routes": "unavailable", "pressures": "unavailable", "blitz": "unavailable"}
        teams[abbr] = team
    return {"schemaVersion": 1, "season": season, "currentWeek": base["currentWeek"], "throughWeek": team_details["throughWeek"],
            "retrievedAt": min([source["retrievedAt"] for source in source_list if source.get("required") and source.get("status") == "verified"]),
            "generatedAt": stamp(), "sources": list(sources.values()), "teams": teams, "disagreements": disagreements,
            "dependencies": dependencies,
            "coverage": {"teams": 32, "seasons": [season - 1, season], "seasonTypes": ["REG"], "pbp": pbp_coverage,
                         "personalOpponentSeasons": list(range(refresh.HISTORY_FIRST_SEASON, season+1)), "crosscheckedNumericCells": crosschecked_cells,
                         "startingQBMissingStatistics": missing_start_rows,
                         "startingRoleDisagreements": role_disagreements,
                         "startingRoleUncorroborated": [{"playerId": player_id, "gameId": entry["gameId"], "sourceIds": entry["started"]["sourceIds"], "status": "unavailable"}
                             for player_id, history in histories.items() if player_id in current_qbs for entry in history.values()
                             if entry["started"].get("candidate") and entry["started"]["status"] == "unavailable"],
                         "personalHistory": "Every 2025–2026 regular-season statistical row plus older 2005–2024 rows needed to fill five actual personal games, weekly-opponent games or explicit QB starts; prior clubs included; never padded",
                         "gameLog": "Actual statistical rows plus explicit schedule-role candidates with statistics-null placeholders. Role candidates do not establish statistical GP or participation; no absent-game DNP/zero. Positive offensive snaps corroborate participation.",
                         "quarterbackStarts": "Explicit nflverse games.csv home_qb_id/away_qb_id, independently crosschecked for missing-stat roles. Reviewed recap contradictions mark BOTH roles disputed/null; uncorroborated missing-stat roles unavailable; explicit first-play role corroboration retained. Candidate windows preserve unknown slots rather than substituting older starts.",
                         "advancedUnavailable": ["routes", "pressures", "blitz", "confirmedInactives", "observedPreGamePrice", "verifiedTravelItinerary", "weatherForecast"]},
            "provenance": {"selection": "Select latest completed team REG games AFTER season/venue filters; player counts use matching team and game IDs; statistical GP is not a padded five-game appearance count.",
                           "advanced": "Routes/pressures/blitz unavailable. Snaps and published per-game percentages from PFR-derived NFLverse snap source; no exact full-window snap-share inferred from rounded percentages. Red zone: 1–20 opponent yards. Deep: air yards>=20. Designed runs exclude scrambles/kneels. Red-zone rush attempts exclude kneels. Sack rate: sacks/dropbacks; target share: player targets/team targeted passes. PBP games require corroborated final score.",
                           "ranking": "Current published roster pool excluding CUT/RET; includes DEV and reported Out players for historical analysis, not a projected active lineup. Rank by verified total yards in the selected team-game window; null/missing totals are unranked. Per-game counts divide by actual recorded GP; AVG is yards/carries, not average of per-game averages.",
                           "dataIntegrity": "Verified reported counts and computed rates, inferred future QB projection, and unavailable advanced fields are explicitly separated. Disputes prevent projections.",
                           "refresh": "Repository source snapshots; browser revalidation can pick up updated snapshots. Not a connected real-time provider push feed."}}


def validate(data, check_dependencies=True):
    assert data["schemaVersion"] == 1 and len(data["teams"]) == 32
    sources = {source["id"]: source for source in data["sources"]}
    assert len(sources) == len(data["sources"])
    if check_dependencies:
        assert data["dependencies"]["currentSha256"] == digest((ROOT / "assets/data/current.json").read_bytes()), "Core snapshot changed; refresh matchup data before publishing"
        assert data["dependencies"]["teamDetailsSha256"] == digest((ROOT / "assets/data/team-details.json").read_bytes()), "Team snapshot changed; refresh matchup data before publishing"
        assert data["dependencies"]["startingRoleEvidenceSha256"] == digest(ROLE_EVIDENCE.read_bytes()), "Reviewed starting-role evidence changed; refresh matchup data before publishing"
    logs = starts = disputed_starts = unknown_starts = 0
    for abbr, team in data["teams"].items():
        assert team["abbr"] == abbr and len(team["roster"]) > 20
        final_games = {game["id"]: game for game in team["games"] if game["status"] == "final"}
        for player_id, player in team["players"].items():
            assert player_id == player["id"] and player["position"] in OFFENSE
            seen = set()
            for entry in player["gameLog"]:
                assert entry["gameId"] not in seen
                seen.add(entry["gameId"])
                assert entry["season"] in data["coverage"]["personalOpponentSeasons"]
                assert entry["team"] != entry["opponent"] and entry["team"] in data["teams"]
                assert all(sources[key]["status"] == "verified" for key in entry["sourceIds"])
                assert entry["provenance"]["retrievedAt"] and entry["provenance"]["season"] == entry["season"] and entry["provenance"]["week"] == entry["week"]
                for value in entry["stats"].values():
                    assert value is None or isinstance(value, (int, float)) and math.isfinite(value)
                for field, value in entry["advanced"].items():
                    assert value is None or isinstance(value, (int, float)) and math.isfinite(value)
                    if value is not None:
                        assert entry["advancedProvenance"]["fieldSources"].get(field)
                        assert all(sources[key]["status"] == "verified" for key in entry["advancedProvenance"]["fieldSources"][field])
                assert all(entry["advanced"][field] is None for field in ("routes", "pressures", "blitz"))
                if entry["started"]["value"]:
                    assert player["position"] == "QB" and "nflverse_games" in entry["started"]["sourceIds"]
                    assert entry["started"]["status"] == "verified" and entry["started"]["candidate"] is True
                    starts += 1
                if entry["started"].get("candidate") and entry["started"]["status"] != "verified":
                    assert player["position"] == "QB" and entry["started"]["value"] is None
                    if entry["started"]["status"] == "disputed":
                        assert entry["started"]["evidence"]["quote"] and len(entry["started"]["sourceIds"]) >= 2
                        disputed_starts += 1
                    else:
                        assert entry["started"]["status"] == "unavailable"
                        unknown_starts += 1
                if entry["team"] == abbr and entry["season"] in data["coverage"]["seasons"]:
                    assert entry["gameId"] in final_games
                logs += 1
        qb = team["qbEvidence"]
        assert qb["confirmed"] is False and qb["status"] in {"inferred", "unavailable", "disputed"}
        if qb["playerId"]:
            assert qb["playerId"] in team["players"] and team["players"][qb["playerId"]]["position"] == "QB"
            assert not any(row.get("playerId") == qb["playerId"] and (row.get("reportStatus") or "").lower() == "out" for row in team["injuries"]["players"])
    return {"teams": 32, "players": sum(len(team["players"]) for team in data["teams"].values()),
            "playerGameRows": logs, "explicitQuarterbackStartRows": starts, "disputedStartingRoleRows": disputed_starts,
            "unavailableStartingRoleRows": unknown_starts, "sources": len(sources), "disagreements": len(data["disagreements"])}


def write_evidence(evidence_dir, specs, bodies, sources, checks, output_hash):
    directory = Path(evidence_dir)
    directory.mkdir(parents=True, exist_ok=True)
    archived = []
    for source in sources:
        source_id = source["id"]
        body = bodies.get(source_id)
        if body is None:
            archived.append({**source, "bodyPath": None})
            continue
        # Compress exact public CSV/JSON bodies for an audit copy, never alter facts.
        compressed = specs[source_id]["cache"].endswith(".gz")
        saved = body if compressed else gzip.compress(body, mtime=0)
        path = directory / "sources" / (source_id + ".source.gz")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(saved)
        archived.append({**source, "bodyPath": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
                         "archiveSha256": digest(saved), "archiveEncoding": "original-gzip" if compressed else "gzip-of-exact-response",
                         "decodedSourceSha256": None if compressed else digest(gzip.decompress(saved))})
    (directory / "source-manifest.json").write_text(json.dumps({"status": "verified", "generatedAt": stamp(),
        "snapshotSha256": output_hash, "checks": checks, "sources": archived,
        "note": "Public source responses retained exactly, with lossless gzip audit packaging; original TLS response bytes hashes and retrieval times retained."}, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--evidence-dir")
    args = parser.parse_args()
    if args.check:
        print(json.dumps(validate(json.loads(OUTPUT.read_text())), indent=2))
        return
    core_body, detail_body = ((ROOT / name).read_bytes() for name in ("assets/data/current.json", "assets/data/team-details.json"))
    base, team_details = json.loads(core_body), json.loads(detail_body)
    if base["season"] != team_details["season"] or len(team_details["teams"]) != 32:
        raise ValueError("Current and team snapshot context disagree; prior matchup file retained")
    specs = specifications(base["season"])
    specs.update(summary_specifications(team_details))
    specs.update(fixture_specifications(base, team_details))
    specs.update(role_specifications(reviewed_role_evidence()))
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda item: blob(item, args.cache_dir), specs.items()))
    bodies = {key: body for key, body, _ in results}
    source_list = [source for _, _, source in results]
    dependencies = {"currentSha256": digest(core_body), "teamDetailsSha256": digest(detail_body),
                    "currentRetrievedAt": base["retrievedAt"], "teamDetailsRetrievedAt": team_details["retrievedAt"],
                    "startingRoleEvidenceSha256": digest(ROLE_EVIDENCE.read_bytes()),
                    "season": base["season"], "currentWeek": base["currentWeek"]}
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else None
    data = build(base, team_details, bodies, source_list, dependencies, previous)
    checks = validate(data)
    body = (json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode()
    if args.evidence_dir:
        write_evidence(args.evidence_dir, specs, bodies, source_list, checks, digest(body))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", dir=OUTPUT.parent, suffix=".tmp", delete=False) as handle:
        handle.write(body)
        temporary = Path(handle.name)
    temporary.replace(OUTPUT)
    print(json.dumps({**checks, "bytes": len(body), "sha256": digest(body), "retrievedAt": data["retrievedAt"],
                      "DallasUpcoming": data["teams"]["DAL"]["upcomingGameId"], "DallasQB": data["teams"]["DAL"]["qbEvidence"],
                      "TampaBayQB": data["teams"]["TB"]["qbEvidence"]}, indent=2))


if __name__ == "__main__":
    main()
