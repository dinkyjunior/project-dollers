#!/usr/bin/env python3
"""Independent team-details audit against separately retrieved public sources.

This checks the emitted snapshot, not the builder's functions. Source responses
remain outside Git; the receipt records their original URLs, hashes and times.
The default is offline and refuses unverified or absent reference responses.
Use --refresh to retrieve fresh independent evidence with strict TLS.
"""
import argparse
import collections
import concurrent.futures
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
import ssl
import unicodedata
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
UTC = dt.timezone.utc
ALIASES = {"WSH": "WAS", "LAR": "LA", "JAC": "JAX", "OAK": "LV", "SD": "LAC"}
STAT_KEYS = ("netPassing", "rushing", "totalOffense", "thirdDownMade", "thirdDownAttempts", "redZoneTD", "redZoneAttempts", "turnovers", "penaltyYards")
PLAYER_CHECK_FIELDS = {
    "completions": "completions", "attempts": "attempts", "passingYards": "passing_yards", "passingTD": "passing_tds", "interceptions": "passing_interceptions",
    "sacks": "sacks_suffered", "sackYardsLost": "sack_yards_lost", "carries": "carries", "rushingYards": "rushing_yards", "rushingTD": "rushing_tds",
    "receptions": "receptions", "targets": "targets", "receivingYards": "receiving_yards", "receivingTD": "receiving_tds",
    "tackles": "def_tackles_solo", "assistedTackles": "def_tackle_assists", "defensiveSacks": "def_sacks", "defensiveInterceptions": "def_interceptions", "passesDefended": "def_pass_defended",
    "fieldGoalsMade": "fg_made", "fieldGoalAttempts": "fg_att", "punts": "pt_att", "puntYards": "pt_yards",
    "passingFirstDowns": "passing_first_downs", "rushingFirstDowns": "rushing_first_downs", "receivingFirstDowns": "receiving_first_downs",
    "rushingFumbles": "rushing_fumbles", "rushingFumblesLost": "rushing_fumbles_lost", "receivingFumbles": "receiving_fumbles", "receivingFumblesLost": "receiving_fumbles_lost",
    "fumbles": "fumbles_total", "fumblesLost": "fumbles_lost_total", "penalties": "penalties", "penaltyYards": "penalty_yards",
    "passingTwoPointConversions": "passing_2pt_conversions", "rushingTwoPointConversions": "rushing_2pt_conversions", "receivingTwoPointConversions": "receiving_2pt_conversions",
    "specialTeamsTD": "special_teams_tds", "quarterbackHits": "def_qb_hits", "forcedFumbles": "def_fumbles_forced", "tacklesForLoss": "def_tackles_for_loss",
    "passingAirYards": "passing_air_yards", "passingYardsAfterCatch": "passing_yards_after_catch", "receivingAirYards": "receiving_air_yards", "receivingYardsAfterCatch": "receiving_yards_after_catch",
    "sackFumbles": "sack_fumbles", "sackFumblesLost": "sack_fumbles_lost", "rushing20Plus": "rushing_20", "rushing40Plus": "rushing_40", "receiving20Plus": "receiving_20", "receiving40Plus": "receiving_40",
    "tacklesWithAssist": "def_tackles_with_assist", "tackleForLossYards": "def_tackles_for_loss_yards", "defensiveSackYards": "def_sack_yards", "interceptionReturnYards": "def_interception_yards",
    "defensiveTD": "def_tds", "defensiveFumbles": "def_fumbles", "safeties": "def_safeties", "puntBlocks": "def_punt_blocks", "extraPointBlocks": "def_pat_blocks", "fieldGoalBlocks": "def_fg_blocks",
    "fumbleRecoveriesOwn": "fumble_recovery_own", "fumbleRecoveryYardsOwn": "fumble_recovery_yards_own", "fumbleRecoveriesOpponent": "fumble_recovery_opp", "fumbleRecoveryYardsOpponent": "fumble_recovery_yards_opp", "fumbleRecoveryTD": "fumble_recovery_tds",
    "puntReturns": "punt_returns", "puntReturnYards": "punt_return_yards", "kickoffReturns": "kickoff_returns", "kickoffReturnYards": "kickoff_return_yards",
    "fieldGoalsMissed": "fg_missed", "fieldGoalsBlocked": "fg_blocked", "extraPointsMade": "pat_made", "extraPointAttempts": "pat_att", "extraPointsMissed": "pat_missed", "extraPointsBlocked": "pat_blocked",
    "puntsBlocked": "pt_blocked", "puntsInside20": "pt_inside_20", "puntTouchbacks": "pt_touchback", "puntsFairCaught": "pt_fair_caught", "puntsReturned": "pt_returned", "puntReturnYardsAllowed": "pt_return_yards", "puntReturnTDAllowed": "pt_return_tds", "netPuntYards": "pt_net_yards",
}
URLS = {
    "nflverse-games": "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
    "espn-dal-team": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/dal",
    "espn-dal-schedule-2026": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/dal/schedule?season=2026&seasontype=2",
    "espn-dal-schedule-2025": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/dal/schedule?season=2025&seasontype=2",
    "espn-dal-roster": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/dal/roster",
    "nflverse-roster-2026": "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv",
    "nflverse-injuries-2026": "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv",
    "nflverse-teams": "https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv",
    "official-cowboys-schedule": "https://www.dallascowboys.com/schedule/",
    "official-nfl-dal-schedule-root": "https://www.nfl.com/teams/dallas-cowboys/schedule/",
    **{f"nflverse-player-stats-{year}": f"https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{year}.csv" for year in (2025, 2026)},
}


def timestamp(value):
    return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def number(value):
    if value is None or str(value).strip() in ("", "NA", "NaN", "nan", "null"):
        return None
    n = float(value)
    if not math.isfinite(n):
        raise ValueError(f"Nonfinite source number {value!r}")
    return int(n) if n.is_integer() else n


def canonical(value):
    return ALIASES.get(value, value)


def text_normalized(value):
    return " ".join(unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode().casefold().split())


def source_kickoff(row):
    if not row.get("gameday") or not row.get("gametime"):
        return None
    return dt.datetime.fromisoformat(f"{row['gameday']}T{row['gametime']}").replace(tzinfo=ZoneInfo("America/New_York")).astimezone(UTC)


def refresh(cache, urls):
    context = ssl.create_default_context()
    ca = Path("/usr/local/share/ca-certificates/environment-proxy-ca.crt")
    if ca.exists():
        context.load_verify_locations(cafile=str(ca))
    cache.mkdir(parents=True, exist_ok=True)

    def fetch(item):
        key, url = item
        meta = {"id": key, "url": url, "retrievedAt": dt.datetime.now(UTC).isoformat()}
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ProjectDollarIndependentDataAudit/1.0"})
            with urllib.request.urlopen(req, timeout=45, context=context) as response:
                body = response.read()
                meta.update(httpStatus=response.status, sha256=hashlib.sha256(body).hexdigest(), bytes=len(body), etag=response.headers.get("ETag"), lastModified=response.headers.get("Last-Modified"))
            (cache / f"{key}.body").write_bytes(body)
            meta["status"] = "retrieved"
        except Exception as exc:
            meta.update(status="unavailable", error=str(exc))
        (cache / f"{key}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fetch, urls.items()))


class Audit:
    def __init__(self):
        self.checks = collections.Counter()
        self.failures = []
        self.conflicts = []
        self.sources = []
        self.facts = {}

    def require(self, condition, group, detail):
        self.checks[group] += 1
        if not condition:
            self.failures.append({"group": group, "detail": detail})

    def equal(self, actual, expected, group, detail):
        self.require(actual == expected, group, {"context": detail, "actual": actual, "expected": expected})

    def read(self, cache, key, required=True, json_format=True):
        path = cache / f"{key}.meta.json"
        if not path.exists():
            self.require(not required, "referenceSources", f"Missing independent response metadata: {key}")
            return None
        meta = json.loads(path.read_text())
        self.sources.append(meta)
        if meta.get("status") != "retrieved":
            self.require(not required, "referenceSources", {"id": key, "error": meta.get("error")})
            return None
        body_path = cache / f"{key}.body"
        if not body_path.exists():
            self.require(False, "referenceSources", f"Missing retrieved body: {key}")
            return None
        body = body_path.read_bytes()
        self.equal(hashlib.sha256(body).hexdigest(), meta.get("sha256"), "referenceHashes", key)
        self.equal(len(body), meta.get("bytes"), "referenceHashes", key)
        self.require(meta.get("httpStatus") == 200, "referenceSources", key)
        self.require(str(meta.get("url", "")).startswith("https://"), "referenceSources", key)
        self.require(timestamp(meta["retrievedAt"]).tzinfo is not None, "referenceTimestamps", key)
        return json.loads(body) if json_format else list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))


def summary_values(summary):
    result = {}
    for team in summary.get("boxscore", {}).get("teams", []):
        abbr = canonical(team["team"]["abbreviation"])
        raw = {s["name"]: s.get("displayValue") for s in team.get("statistics", [])}
        values = {"netPassing": number(raw.get("netPassingYards")), "rushing": number(raw.get("rushingYards")), "totalOffense": number(raw.get("totalYards")), "turnovers": number(raw.get("turnovers"))}
        for name, a, b in (("thirdDownEff", "thirdDownMade", "thirdDownAttempts"), ("redZoneAttempts", "redZoneTD", "redZoneAttempts"), ("totalPenaltiesYards", "penalties", "penaltyYards")):
            match = re.fullmatch(r"(\d+)[-/](\d+)", str(raw.get(name, "")))
            values[a], values[b] = (int(match[1]), int(match[2])) if match else (None, None)
        result[abbr] = values
    return result


def player_team_values(rows):
    def total(field):
        values = [number(row.get(field)) for row in rows]
        return sum(values) if values and all(v is not None for v in values) else None
    passing, sacks, rushing = total("passing_yards"), total("sack_yards_lost"), total("rushing_yards")
    net = passing - abs(sacks) if passing is not None and sacks is not None else None
    return {"netPassing": net, "rushing": rushing, "totalOffense": net + rushing if net is not None and rushing is not None else None}


def player_expected(rows):
    result = {}
    for name, field in PLAYER_CHECK_FIELDS.items():
        values = [number(row.get(field)) for row in rows]
        result[name] = sum(values) if values and all(v is not None for v in values) else None
    if result["sackYardsLost"] is not None:
        result["sackYardsLost"] = abs(result["sackYardsLost"])
    result["games"] = len({row["game_id"] for row in rows}) if rows else None
    for name, fields in (("offensiveTD", ("rushingTD", "receivingTD")), ("touchdownsAccountedFor", ("passingTD", "rushingTD", "receivingTD"))):
        values = [result[field] for field in fields]
        result[name] = sum(values) if all(v is not None for v in values) else None
    # The snapshot retains this compatibility alias for offensive TDs scored;
    # passing TDs are separately credited to the passer, avoiding double-counts.
    result["totalTD"] = result["offensiveTD"]
    return result


def run(args):
    audit = Audit()
    data_bytes = args.data.read_bytes()
    data = json.loads(data_bytes)
    if args.refresh:
        refresh(args.cache, URLS)
    nfl_games = audit.read(args.cache, "nflverse-games", json_format=False) or []
    espn_schedules = {year: audit.read(args.cache, f"espn-dal-schedule-{year}") for year in (2025, 2026)}
    espn_team = audit.read(args.cache, "espn-dal-team") or {}
    espn_roster = audit.read(args.cache, "espn-dal-roster") or {}
    for key in ("official-cowboys-schedule", "official-nfl-dal-schedule-root"):
        audit.read(args.cache, key, required=False)
    stats_by_game = collections.defaultdict(list)
    stats_by_player = collections.defaultdict(list)
    for year in (2025, 2026):
        for row in audit.read(args.cache, f"nflverse-player-stats-{year}", json_format=False) or []:
            if row.get("season_type") == "REG":
                stats_by_game[(row["game_id"], canonical(row["team"]))].append(row)
                stats_by_player[row["player_id"]].append(row)
    independent_roster = audit.read(args.cache, "nflverse-roster-2026", json_format=False) or []
    season = data.get("season")
    audit.equal(season, 2026, "context", "Requested current NFL season")
    audit.equal(data.get("schemaVersion"), 1, "context", "Dataset schema")
    now = timestamp(data.get("generatedAt") or data["retrievedAt"])
    audit.require(now.tzinfo is not None, "context", "Snapshot has timezone-aware retrieval")
    source_ids = {s["id"] for s in data.get("sources", [])}
    source_map = {s["id"]: s for s in data.get("sources", [])}
    for source in data.get("sources", []):
        audit.require(str(source.get("url", "")).startswith("https://"), "provenance", source.get("id"))
        audit.require(bool(source.get("retrievedAt")), "provenance", source.get("id"))
        if source.get("status") == "verified":
            audit.require(bool(re.fullmatch(r"[0-9a-f]{64}", str(source.get("sha256", "")))), "provenance", source.get("id"))
            audit.require(timestamp(source["retrievedAt"]) <= now, "provenance", {"source": source["id"], "reason": "Retrieval cannot follow snapshot generation"})
    for meta_path in sorted(args.builder_cache.glob("*.meta.json")):
        meta = json.loads(meta_path.read_text())
        source = source_map.get(meta.get("id"))
        if not source or source.get("status") != "verified":
            continue
        stem = meta_path.name.removesuffix(".meta.json")
        bodies = [p for p in args.builder_cache.glob(stem + ".*") if p != meta_path and not p.name.endswith(".tmp")]
        audit.require(len(bodies) == 1, "primarySourceEvidence", meta.get("id"))
        if len(bodies) != 1:
            continue
        digest = hashlib.sha256()
        size = 0
        with bodies[0].open("rb") as stream:
            while chunk := stream.read(262144):
                digest.update(chunk)
                size += len(chunk)
        audit.equal(digest.hexdigest(), source.get("sha256"), "primarySourceHashes", source["id"])
        audit.equal(size, source.get("bytes"), "primarySourceHashes", source["id"])
        audit.equal(meta.get("retrievedAt"), source.get("retrievedAt"), "primarySourceTimes", source["id"])
    raw_games = {g["game_id"]: g for g in nfl_games if g["season"] in ("2025", "2026") and g["game_type"] == "REG"}
    espn_events = {str(event["id"]): event for schedule in espn_schedules.values() if schedule for event in schedule.get("events", [])}
    candidate_games = {}
    for abbr, team in data.get("teams", {}).items():
        audit.require(bool(team.get("games")), "teamCoverage", abbr)
        seen = set()
        for game in team.get("games", []):
            gid = game["id"]
            audit.require(gid not in seen, "gameIdentity", {"team": abbr, "game": gid})
            seen.add(gid)
            source = raw_games.get(gid)
            audit.require(source is not None, "schedule", {"team": abbr, "game": gid, "reason": "Not a verified regular-season fixture"})
            if not source:
                continue
            candidate_games[gid] = game
            audit.require(abbr in (game["home_team"], game["away_team"]), "gameIdentity", {"team": abbr, "game": gid})
            for field in ("home_team", "away_team", "gameday"):
                audit.equal(game.get(field), source.get(field), "schedule", {"team": abbr, "game": gid, "field": field})
            audit.equal(game.get("season"), int(source["season"]), "schedule", gid)
            audit.equal(game.get("week"), int(source["week"]), "schedule", gid)
            expected_kickoff = source_kickoff(source)
            actual_kickoff = timestamp(game["kickoffUtc"]) if game.get("kickoffUtc") else None
            espn_event = espn_events.get(str(game.get("espnEventId")))
            espn_comp = espn_event["competitions"][0] if espn_event else {}
            espn_tbd = espn_event and (espn_event.get("timeValid") is False or espn_comp.get("timeValid") is False or espn_comp.get("status", {}).get("isTBDFlex") is True)
            audit.equal(actual_kickoff.isoformat() if actual_kickoff else None, None if espn_tbd else expected_kickoff.isoformat() if expected_kickoff else None, "kickoff", gid)
            score_verified = all(number(source.get(f"{side}_score")) is not None for side in ("home", "away")) and (expected_kickoff is None or expected_kickoff <= now)
            audit.equal(game.get("status"), "final" if score_verified else "scheduled", "status", gid)
            for side in ("home", "away"):
                audit.equal(game.get(f"{side}_score"), number(source.get(f"{side}_score")) if score_verified else None, "score", {"game": gid, "side": side})
            audit.equal(game.get("neutral"), True if source.get("location") == "Neutral" else False if source.get("location") in ("Home", "Away") else None, "venue", gid)
            if text_normalized(game.get("venue")) != text_normalized(source.get("stadium")):
                disclosures = [d for d in game.get("sourceDisagreements", []) if d.get("field") == "venue"]
                audit.require(bool(disclosures), "venueConflictDisclosure", {"game": gid, "candidate": game.get("venue"), "nflverse": source.get("stadium")})
                audit.conflicts.append({"game": gid, "field": "venue", "candidate": game.get("venue"), "nflverse": source.get("stadium"), "disclosure": disclosures})
            else:
                audit.equal(text_normalized(game.get("venue")), text_normalized(source.get("stadium")), "venue", gid)
            audit.equal(str(game.get("espnEventId")), str(source.get("espn") or None), "eventIdentity", gid)
            audit.require(all(s in source_ids for s in game.get("sourceIds", [])), "provenance", gid)
            for stat_team, stats in game.get("stats", {}).items():
                provenance = game.get("statsProvenance", {}).get(stat_team, {})
                for field, value in stats.items():
                    audit.require(value is None or isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value), "statsTypes", {"game": gid, "team": stat_team, "field": field})
                    if value is not None:
                        ids = provenance.get("fieldSources", {}).get(field, [])
                        audit.require(bool(ids) and all(s in source_ids for s in ids), "statProvenance", {"game": gid, "team": stat_team, "field": field})
                if stats.get("netPassing") is not None and stats.get("rushing") is not None:
                    audit.equal(stats.get("totalOffense"), stats["netPassing"] + stats["rushing"], "statArithmetic", {"game": gid, "team": stat_team})
                reference = player_team_values(stats_by_game[(gid, stat_team)])
                for field, value in reference.items():
                    if value is not None and stats.get(field) is not None:
                        audit.equal(stats[field], value, "nflverseStatCrosscheck", {"game": gid, "team": stat_team, "field": field})
        final = [g for g in team.get("games", []) if g.get("season") == season and g.get("status") == "final"]
        wins = losses = ties = pf = pa = 0
        for game in final:
            home = game["home_team"] == abbr
            own, other = (game["home_score"], game["away_score"]) if home else (game["away_score"], game["home_score"])
            wins += own > other
            losses += own < other
            ties += own == other
            pf += own
            pa += other
        expected = {"w": wins, "l": losses, "ties": ties, "pointsFor": pf, "pointsAgainst": pa}
        for key, value in expected.items():
            audit.equal(team.get("record", {}).get(key), value, "records", {"team": abbr, "field": key})
        played = wins + losses + ties
        audit.equal(team.get("record", {}).get("pct"), round((wins + ties / 2) / played, 3) if played else None, "records", {"team": abbr, "field": "pct"})
        primary_roster = {row.get("gsis_id") or row.get("espn_id"): row for row in independent_roster if row.get("team") == abbr and row.get("season") == str(season) and row.get("status") != "CUT" and (row.get("gsis_id") or row.get("espn_id"))}
        # Only the approved Dallas team has a bundled roster; other team routes
        # expose source-backed form, with roster coverage explicitly unavailable.
        if team.get("dataStatus", {}).get("roster") == "verified":
            audit.equal(sorted(p["id"] for p in team.get("roster", [])), sorted(primary_roster), "rosterMembership", abbr)
        else:
            audit.equal(team.get("roster", []), [], "rosterUnavailable", abbr)
        for player in team.get("roster", []):
            identity = player["id"]
            original = primary_roster.get(identity)
            if original:
                audit.equal(player.get("name"), original.get("full_name"), "rosterIdentity", identity)
                audit.equal(player.get("position"), original.get("position") or None, "rosterIdentity", identity)
                audit.equal(player.get("espnId"), original.get("espn_id") or None, "rosterIdentity", identity)
            rows = [row for row in stats_by_player[identity] if row["game_id"] in raw_games and number(raw_games[row["game_id"]].get("home_score")) is not None and number(raw_games[row["game_id"]].get("away_score")) is not None and (source_kickoff(raw_games[row["game_id"]]) is None or source_kickoff(raw_games[row["game_id"]]) <= now)]
            current_rows = [row for row in rows if row.get("season") == str(season)]
            if current_rows:
                expected_stats = player_expected(current_rows)
                audit.equal(sorted((player.get("seasonStats") or {}).keys()), sorted(expected_stats.keys()), "playerStatFieldCoverage", identity)
                for field, value in expected_stats.items():
                    audit.equal((player.get("seasonStats") or {}).get(field), value, "playerSeasonStats", {"player": identity, "field": field})
            else:
                audit.equal(player.get("seasonStats"), None, "playerMissingStats", identity)
            historical = sorted(rows, key=lambda row: row["game_id"], reverse=True)[:5]
            audit.equal([g["gameId"] for g in player.get("last5", [])], [row["game_id"] for row in historical], "playerLast5Coverage", identity)
            for actual, row in zip(player.get("last5", []), historical):
                audit.equal(sorted(actual.get("stats", {}).keys()), sorted(player_expected([row]).keys()), "playerStatFieldCoverage", {"player": identity, "game": row["game_id"]})
                audit.equal(actual.get("team"), row["team"], "playerOriginalClub", {"player": identity, "game": row["game_id"]})
                audit.equal(actual.get("opponent"), row["opponent_team"], "playerOriginalClub", {"player": identity, "game": row["game_id"]})
                audit.equal(actual.get("season"), int(row["season"]), "playerOriginalClub", {"player": identity, "game": row["game_id"]})
                audit.require(bool(actual.get("sourceIds")) and all(s in source_ids for s in actual.get("sourceIds", [])), "playerProvenance", {"player": identity, "game": row["game_id"]})
                for field, value in player_expected([row]).items():
                    audit.equal(actual.get("stats", {}).get(field), value, "playerGameStats", {"player": identity, "game": row["game_id"], "field": field})
    dal = data.get("teams", {}).get("DAL", {})
    dal_games = {g["id"]: g for g in dal.get("games", [])}
    dal_by_espn = {str(g.get("espnEventId")): g for g in dal.get("games", [])}
    if args.refresh:
        refresh(args.cache, {f"espn-summary-{g['espnEventId']}": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={g['espnEventId']}" for g in dal.get("games", []) if g.get("status") == "final" and g.get("espnEventId")})
    for year, schedule in espn_schedules.items():
        if not schedule:
            continue
        # ESPN's response `season` is the active league season. The request's
        # actual archive context lives in requestedSeason and event dates.
        audit.equal(schedule.get("requestedSeason", schedule.get("season", {})).get("year"), year, "espnContext", year)
        for event in schedule.get("events", []):
            comp = event["competitions"][0]
            game = dal_by_espn.get(str(event["id"]))
            audit.require(game is not None, "espnScheduleCoverage", event["id"])
            if not game:
                continue
            tbd = event.get("timeValid") is False or comp.get("timeValid") is False or comp.get("status", {}).get("isTBDFlex") is True
            audit.equal(timestamp(game["kickoffUtc"]).isoformat() if game.get("kickoffUtc") else None, None if tbd else timestamp(event["date"]).isoformat(), "espnKickoff", game["id"])
            audit.equal(game.get("neutral"), comp.get("neutralSite"), "espnVenue", game["id"])
            venue_expected = text_normalized(comp.get("venue", {}).get("fullName"))
            venue_actual = text_normalized(game.get("venue"))
            if venue_actual != venue_expected:
                conflicts = [d for d in data.get("disagreements", []) if d.get("gameId") == game["id"] and d.get("field") == "venue"]
                audit.require(bool(conflicts), "espnVenueConflictDisclosure", {"game": game["id"], "candidate": game.get("venue"), "ESPN": comp.get("venue", {}).get("fullName")})
                audit.conflicts.append({"game": game["id"], "field": "venue", "candidate": game.get("venue"), "ESPN": comp.get("venue", {}).get("fullName"), "disclosure": conflicts})
            else:
                audit.equal(venue_actual, venue_expected, "espnVenue", game["id"])
            for competitor in comp.get("competitors", []):
                side = competitor["homeAway"]
                audit.equal(game.get(f"{side}_team"), canonical(competitor["team"]["abbreviation"]), "espnTeams", game["id"])
                score = competitor.get("score")
                score_value = number(score.get("value")) if isinstance(score, dict) else number(score)
                audit.equal(game.get(f"{side}_score"), score_value if comp["status"]["type"].get("completed") else None, "espnScores", game["id"])
    espn_record = next((r for r in espn_team.get("team", {}).get("record", {}).get("items", []) if r.get("type") == "total"), {})
    record_values = {r["name"]: r["value"] for r in espn_record.get("stats", [])}
    for field, espn_field in (("w", "wins"), ("l", "losses"), ("ties", "ties"), ("pointsFor", "pointsFor"), ("pointsAgainst", "pointsAgainst")):
        audit.equal(dal.get("record", {}).get(field), record_values.get(espn_field), "espnRecord", field)
    independent_injuries = audit.read(args.cache, "nflverse-injuries-2026", json_format=False) or []
    upcoming = next((g for g in dal.get("games", []) if g["id"] == dal.get("upcomingGameId")), None)
    injury_week = upcoming["week"] if upcoming else data.get("currentWeek")
    reference_injuries = [row for row in independent_injuries if row.get("team") == "DAL" and row.get("season") == str(season) and int(row["week"]) == injury_week]
    candidate_injuries = dal.get("injuries", {}).get("players", [])
    audit.equal(len(candidate_injuries), len(reference_injuries), "injuryCoverage", "Published upcoming-game reports")
    injury_by_id = {row.get("gsis_id") or row.get("full_name"): row for row in reference_injuries}
    for injury in candidate_injuries:
        original = injury_by_id.get(injury.get("playerId") or injury.get("name"))
        audit.require(original is not None, "injuryIdentity", injury.get("name"))
        if original:
            for field, primary in (("reportStatus", "report_status"), ("practiceStatus", "practice_status"), ("position", "position")):
                audit.equal(injury.get(field), original.get(primary) or None, "injuryReports", {"player": injury.get("name"), "field": field})
            audit.equal(injury.get("injury"), original.get("report_primary_injury") or original.get("practice_primary_injury") or None, "injuryReports", injury.get("name"))
            audit.equal(injury.get("week"), injury_week, "injuryReports", injury.get("name"))
            audit.require(bool(injury.get("sourceIds")) and all(s in source_ids for s in injury.get("sourceIds", [])), "injuryProvenance", injury.get("name"))
    identity_rows = audit.read(args.cache, "nflverse-teams", json_format=False) or []
    # The source includes historical franchises; exact current abbreviations
    # take precedence over relocation aliases for current team identities.
    identities = {canonical(row["team_abbr"]): row for row in identity_rows}
    identities.update({row["team_abbr"]: row for row in identity_rows})
    for abbr, candidate in data.get("teams", {}).items():
        original = identities.get(abbr)
        audit.require(original is not None, "teamIdentity", abbr)
        if original:
            for field, source_field in (("fullName", "team_name"), ("conference", "team_conf"), ("division", "team_division")):
                audit.equal(candidate.get(field), original.get(source_field), "teamIdentity", {"team": abbr, "field": field})
    depth_cache = args.builder_cache / "depth2026.csv"
    if depth_cache.exists():
        latest = ""
        depth_rows = []
        with depth_cache.open(newline="", encoding="utf-8-sig") as stream:
            for row in csv.DictReader(stream):
                if row.get("team") != "DAL" or row.get("season") not in (None, "", str(season)):
                    continue
                stamp = row.get("dt") or ""
                if stamp > latest:
                    latest, depth_rows = stamp, []
                if stamp == latest:
                    depth_rows.append(row)
        candidates = dal.get("depth", {}).get("players", [])
        signature = lambda row: (row.get("gsis_id") or None, row.get("pos_abb"), number(row.get("pos_rank")), row.get("pos_grp"), row.get("dt"))
        actual_signature = lambda row: (row.get("playerId"), row.get("position"), row.get("rank"), row.get("unit"), row.get("sourceTimestamp"))
        audit.equal(sorted(map(actual_signature, candidates), key=str), sorted(map(signature, depth_rows), key=str), "depthChart", "Latest primary published order; not confirmed starters")
    for path in sorted(args.cache.glob("espn-summary-*.meta.json")):
        key = path.name.removesuffix(".meta.json")
        summary = audit.read(args.cache, key)
        if not summary:
            continue
        event_id = str(summary.get("header", {}).get("id"))
        game = dal_by_espn.get(event_id)
        audit.require(game is not None, "summaryEventIdentity", event_id)
        if not game:
            continue
        for abbr, values in summary_values(summary).items():
            for field in STAT_KEYS:
                reference = values.get(field)
                actual = game.get("stats", {}).get(abbr, {}).get(field)
                if reference is not None:
                    audit.equal(actual, reference, "espnSummaryStats", {"game": game["id"], "team": abbr, "field": field})
    roster_by_id = {str(p["id"]): p for group in espn_roster.get("athletes", []) for p in group.get("items", [])}
    roster_checks = []
    for player in dal.get("roster", []):
        espn_id = str(player.get("espnId") or "")
        reference = roster_by_id.get(espn_id)
        if reference:
            candidate_jersey = player.get("jersey")
            result = {"name": player.get("name"), "espnId": espn_id, "espnName": reference.get("displayName"), "candidateJersey": candidate_jersey, "espnJersey": reference.get("jersey"), "candidatePosition": player.get("position"), "espnPosition": reference.get("position", {}).get("abbreviation")}
            roster_checks.append(result)
            primary = next((r for r in independent_roster if r.get("gsis_id") == player["id"]), None)
            primary_number = number(primary.get("jersey_number")) if primary else None
            secondary_number = number(reference.get("jersey"))
            if primary_number is not None and secondary_number is not None and primary_number != secondary_number:
                disclosures = [d for d in data.get("disagreements", []) if d.get("playerId") == player["id"] and d.get("field") == "jersey"]
                audit.require(bool(disclosures) and player.get("jersey") is None and player.get("number") is None, "jerseyConflictDisclosure", result)
                audit.conflicts.append({"player": player["id"], "field": "jersey", "nflverse": primary_number, "ESPN": secondary_number, "disclosure": disclosures})
            else:
                audit.equal(candidate_jersey, primary_number, "jerseyNumber", player["id"])
    next_games = sorted((g for g in dal.get("games", []) if g.get("season") == season and g.get("status") == "scheduled" and g.get("kickoffUtc") and timestamp(g["kickoffUtc"]) >= now), key=lambda g: g["kickoffUtc"])
    if next_games:
        game = next_games[0]
        kickoff = timestamp(game["kickoffUtc"])
        audit.facts["DallasNextGame"] = {"gameId": game["id"], "eventId": game.get("espnEventId"), "home": game["home_team"], "away": game["away_team"], "venue": game["venue"], "week": game["week"], "kickoffUtc": kickoff.isoformat(), "kickoffSydney": kickoff.astimezone(ZoneInfo("Australia/Sydney")).isoformat()}
        espn_next = espn_team.get("team", {}).get("nextEvent", [])
        audit.require(bool(espn_next), "nextEvent", "ESPN next event present")
        if espn_next:
            audit.equal(str(game.get("espnEventId")), str(espn_next[0]["id"]), "nextEvent", "Upcoming opponent/event")
    audit.facts.update(DallasRecord=dal.get("record"), DallasLast5=[{"gameId": g["id"], "season": g["season"], "week": g["week"], "home": g["home_team"], "away": g["away_team"], "homeScore": g["home_score"], "awayScore": g["away_score"], "neutral": g["neutral"]} for g in sorted((g for g in dal.get("games", []) if g.get("status") == "final"), key=lambda g: g.get("kickoffUtc") or g["gameday"], reverse=True)[:5]], DallasRosterCrosschecks=roster_checks)
    report = {"status": "passed" if not audit.failures else "failed", "auditedAt": dt.datetime.now(UTC).isoformat(), "dataFile": str(args.data.relative_to(ROOT)) if args.data.is_relative_to(ROOT) else str(args.data), "dataSha256": hashlib.sha256(data_bytes).hexdigest(), "season": season, "snapshotRetrievedAt": data.get("retrievedAt"), "teams": len(data.get("teams", {})), "uniqueGames": len(candidate_games), "checks": dict(audit.checks), "failures": audit.failures, "documentedProviderDifferences": audit.conflicts, "facts": audit.facts, "independentSources": audit.sources, "officialSourceLimitation": "Official team domain was blocked by proxy and NFL team schedule returned404. ESPN plus independently retrieved nflverse corroboration is recorded; no direct official corroboration is claimed.", "limitations": ["No claim that polling provides an upstream live push feed.", "Future injury/inactive publications cannot be inferred from absence.", "This receipt verifies snapshot data, not browser rendering or every UI interaction."]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"status": report["status"], "checks": sum(audit.checks.values()), "failures": len(audit.failures), "dataSha256": report["dataSha256"], "output": str(args.output)}))
    return 0 if not audit.failures else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "assets/data/team-details.json")
    parser.add_argument("--cache", type=Path, default=Path("/workspace/recovery-qa/team-details/sources-independent"))
    parser.add_argument("--builder-cache", type=Path, default=Path("/workspace/recovery-qa/team-details/source-cache"), help="Original builder responses for source hash and published depth-order verification")
    parser.add_argument("--output", type=Path, default=ROOT / "qa/team-details/reviews/sources/source-audit.json")
    parser.add_argument("--refresh", action="store_true", help="Retrieve independent public evidence; ordinary runs use saved original responses")
    raise SystemExit(run(parser.parse_args()))
