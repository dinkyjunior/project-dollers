#!/usr/bin/env python3
"""Build verified, replaceable team-detail data without modifying the NFL feed.

Regular-season games only. Source failure retains the preceding snapshot; optional
statistics remain null. Audit caches require matching source hashes and retain
their original retrieval timestamps.
Run after refresh-data.py, optionally sharing that run's --cache-dir.
"""
import argparse
import collections
import concurrent.futures
import csv
import datetime as dt
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import tempfile
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/data/team-details.json"
UTC = dt.timezone.utc
_spec = importlib.util.spec_from_file_location("pd_refresh", ROOT / "scripts/refresh-data.py")
refresh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(refresh)
FIELDS = ("netPassing", "rushing", "totalOffense", "thirdDownMade", "thirdDownAttempts",
          "redZoneTD", "redZoneAttempts", "turnovers", "penaltyYards")
PLAYER_FIELDS = {**refresh.STAT_FIELDS, **refresh.EXTRA_COUNT_FIELDS}
ALIASES = {"WSH": "WAS", "LAR": "LA", "JAC": "JAX"}


def checked_fetch_source(item, cache_dir):
    source_id, spec = item
    cache = Path(cache_dir) / spec["cache"] if cache_dir else None
    if cache and cache.exists():
        try:
            saved = json.loads(cache.with_suffix(".meta.json").read_text())
            if saved.get("status") != "verified" or saved.get("url") != spec["url"] or saved.get("sha256") != hashlib.sha256(cache.read_bytes()).hexdigest():
                raise ValueError("Cache checksum/source metadata do not corroborate cached bytes")
        except (OSError, ValueError, TypeError) as exc:
            if spec["required"]:
                raise RuntimeError(f"Required source {source_id} has an unverified cache: {exc}") from exc
            return source_id, [], {"id": source_id, "url": spec["url"], "provider": spec.get("provider", "nflverse"), "required": False,
                                   "status": "unavailable", "retrievedAt": refresh.iso(dt.datetime.now(UTC)), "error": f"Cached source refused: {exc}"}
    return refresh.fetch_source(item, cache_dir)


def team_abbr(value):
    return ALIASES.get(value, value)


def source_time(sources):
    times = [s["retrievedAt"] for s in sources if s.get("status") == "verified"]
    return min(times) if times else None


def numeric(value):
    try:
        result = refresh.number(value)
        return result if result is None or math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def strict_sum(rows, field):
    numbers = [numeric(row.get(field)) for row in rows]
    return sum(numbers) if numbers and all(n is not None for n in numbers) else None


def player_totals(rows):
    result = {name: strict_sum(rows, field) for name, field in PLAYER_FIELDS.items()}
    result["sackYardsLost"] = abs(result["sackYardsLost"]) if result["sackYardsLost"] is not None else None
    result["games"] = len({row["game_id"] for row in rows}) if rows else None
    result["offensiveTD"] = refresh.known_sum(result["rushingTD"], result["receivingTD"])
    result["touchdownsAccountedFor"] = refresh.known_sum(result["passingTD"], result["rushingTD"], result["receivingTD"])
    result["totalTD"] = result["offensiveTD"]
    return result


def team_stats(rows, source_id):
    gross = strict_sum(rows, "passing_yards")
    sack = strict_sum(rows, "sack_yards_lost")
    rushing = strict_sum(rows, "rushing_yards")
    net = gross - abs(sack) if gross is not None and sack is not None else None
    values = {field: None for field in FIELDS}
    values.update(netPassing=net, rushing=rushing, totalOffense=refresh.known_sum(net, rushing),
                  turnovers=refresh.known_sum(strict_sum(rows, "passing_interceptions"), strict_sum(rows, "fumbles_lost_total")))
    provenance = {"status": "verified" if net is not None and rushing is not None else "unavailable", "origin": "computed",
                  "sourceIds": [source_id], "fieldSources": {k: [source_id] for k, v in values.items() if v is not None},
                  "formula": "netPassing = sum(passing_yards) - abs(sum(sack_yards_lost)); totalOffense = netPassing + rushing; turnovers = passing_interceptions + fumbles_lost_total",
                  "note": "Complete numeric player rows only. Penalties and efficiency attempts require team-level game statistics; missing values are not zero."}
    return values, provenance


def pair(value):
    if not isinstance(value, str):
        return None, None
    parts = value.split("-")
    if len(parts) != 2:
        return None, None
    first, second = map(numeric, parts)
    return first, second


def summary_statistics(summary):
    result = {}
    for row in summary.get("boxscore", {}).get("teams", []):
        abbr = team_abbr(row.get("team", {}).get("abbreviation"))
        raw = {s.get("name"): s.get("displayValue") for s in row.get("statistics", [])}
        third_made, third_attempts = pair(raw.get("thirdDownEff"))
        red_td, red_attempts = pair(raw.get("redZoneAttempts"))
        _, penalty_yards = pair(raw.get("totalPenaltiesYards"))
        # ESPN's team statistic netPassingYards already accounts for sacks.
        result[abbr] = {"netPassing": numeric(raw.get("netPassingYards")), "rushing": numeric(raw.get("rushingYards")),
                        "totalOffense": numeric(raw.get("totalYards")), "thirdDownMade": third_made,
                        "thirdDownAttempts": third_attempts, "redZoneTD": red_td, "redZoneAttempts": red_attempts,
                        "turnovers": numeric(raw.get("turnovers")), "penaltyYards": penalty_yards}
    return result


def fetch_depth(season, cache_dir):
    """Keep latest published rows per team while avoiding a 59 MB list of dicts."""
    spec = refresh.source_specs(season)["nflverse_depth"]
    meta = {"id": "nflverse_depth", "url": spec["url"], "provider": "nflverse (ESPN-derived)", "required": False}
    try:
        cache = Path(cache_dir) / spec["cache"] if cache_dir else None
        if cache and cache.exists():
            body = cache.read_bytes()
            meta_path = cache.with_suffix(".meta.json")
            saved = json.loads(meta_path.read_text()) if meta_path.exists() else {}
            if saved.get("status") == "verified" and saved.get("url") == spec["url"] and saved.get("sha256") == hashlib.sha256(body).hexdigest():
                meta.update(saved)
            else:
                raise ValueError("Cached depth source lacks corroborating checksum/source metadata")
        else:
            request = urllib.request.Request(spec["url"], headers={"User-Agent": "ProjectDollarDataRefresh/1.0 public-data-audit"})
            with urllib.request.urlopen(request, timeout=75, context=refresh.verified_ssl_context()) as response:
                body = response.read()
                meta.update(httpStatus=response.status, etag=response.headers.get("ETag"), lastModified=response.headers.get("Last-Modified"))
            meta["retrievedAt"] = refresh.iso(dt.datetime.now(UTC))
        meta.update(status="verified", sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))
        if cache and not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(body)
            cache.with_suffix(".meta.json").write_text(json.dumps(meta))
        latest, rows = {}, collections.defaultdict(list)
        for row in csv.DictReader(io.StringIO(body.decode("utf-8-sig"))):
            if row.get("season") not in (None, "", str(season)):
                continue
            abbr, stamp = row.get("team"), row.get("dt") or ""
            if not abbr or not stamp:
                continue
            if stamp > latest.get(abbr, ""):
                latest[abbr], rows[abbr] = stamp, []
            if stamp == latest[abbr]:
                rows[abbr].append(row)
        return "nflverse_depth", dict(rows), meta
    except Exception as exc:
        meta.update(status="unavailable", retrievedAt=refresh.iso(dt.datetime.now(UTC)), error=str(exc))
        return "nflverse_depth", {}, meta


def normalize_game(raw, now, stat_rows):
    kickoff = refresh.kickoff(raw)
    away_score, home_score = numeric(raw.get("away_score")), numeric(raw.get("home_score"))
    # Impossible future final scores cannot certify completed games.
    complete = away_score is not None and home_score is not None and (kickoff is None or kickoff <= now)
    if not complete:
        away_score = home_score = None
    location = raw.get("location")
    neutral = True if location == "Neutral" else False if location in ("Home", "Away") else None
    result = {"id": raw["game_id"], "season": int(raw["season"]), "seasonType": "REG", "week": int(raw["week"]),
              "gameday": raw["gameday"], "kickoffUtc": refresh.iso(kickoff) if kickoff else None,
              "status": "final" if complete else "scheduled", "home_team": raw["home_team"], "away_team": raw["away_team"],
              "home_score": home_score, "away_score": away_score, "venue": raw.get("stadium") or None,
              "neutral": neutral, "neutralSite": neutral, "espnEventId": raw.get("espn") or None,
              "homeRest": numeric(raw.get("home_rest")), "awayRest": numeric(raw.get("away_rest")),
              "roof": raw.get("roof") or None, "surface": raw.get("surface") or None,
              "sourceIds": ["nflverse_games"], "stats": {}, "statsProvenance": {}}
    if complete:
        source = "nflverse_player_stats" if result["season"] == now.year else f"nflverse_player_stats_{result['season']}"
        for abbr in (result["home_team"], result["away_team"]):
            values, provenance = team_stats(stat_rows.get((result["id"], abbr), []), source)
            result["stats"][abbr], result["statsProvenance"][abbr] = values, provenance
            if any(value is not None for value in values.values()) and source not in result["sourceIds"]:
                result["sourceIds"].append(source)
    return result


def record(games, abbr, season):
    wins = losses = ties = pf = pa = 0
    form = []
    for game in sorted(games, key=lambda g: (g["gameday"], g["id"])):
        if game["season"] != season or game["status"] != "final":
            continue
        own, opp = (game["home_score"], game["away_score"]) if game["home_team"] == abbr else (game["away_score"], game["home_score"])
        result = "W" if own > opp else "L" if own < opp else "T"
        wins += result == "W"; losses += result == "L"; ties += result == "T"
        pf += own; pa += opp; form.append(result)
    played = wins + losses + ties
    return {"w": wins, "l": losses, "ties": ties, "record": f"{wins}–{losses}" + (f"–{ties}" if ties else ""),
            "pct": round((wins + ties / 2) / played, 3) if played else None,
            "pointsFor": pf if played else None, "pointsAgainst": pa if played else None,
            "form": form[-5:], "games": played, "status": "verified", "origin": "computed", "sourceIds": ["nflverse_games"]}


def enrich_games(games, cache_dir, enrich_abbr, disagreements):
    eligible = [g for g in games if g["status"] == "final" and enrich_abbr in (g["home_team"], g["away_team"]) and g["espnEventId"]]
    specs = {f"espn_summary_{g['espnEventId']}": {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={g['espnEventId']}",
             "cache": f"espn-summary-{g['espnEventId']}.json", "format": "json", "provider": "ESPN", "required": False} for g in eligible}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda item: checked_fetch_source(item, cache_dir), specs.items()))
    raw = {key: rows for key, rows, _ in results}
    sources = {key: meta for key, _, meta in results}
    for game in eligible:
        source = f"espn_summary_{game['espnEventId']}"
        if sources[source]["status"] != "verified":
            continue
        summary = raw[source]
        competitions = summary.get("header", {}).get("competitions", [])
        competition = competitions[0] if competitions else {}
        if not competition.get("status", {}).get("type", {}).get("completed"):
            disagreements.append({"gameId": game["id"], "issue": "ESPN summary does not corroborate final status", "sourceIds": ["nflverse_games", source],
                                  "action": "Preserve primary final-score provenance and flag the disagreement; ESPN summary statistics excluded"})
            continue
        competitors = {team_abbr(c.get("team", {}).get("abbreviation")): numeric(c.get("score")) for c in competition.get("competitors", [])}
        if any(competitors.get(game[f"{side}_team"]) != game[f"{side}_score"] for side in ("home", "away")):
            disagreements.append({"gameId": game["id"], "issue": "Final score differs between providers; summary statistics excluded", "sourceIds": ["nflverse_games", source], "alternativeScores": competitors,
                                  "action": "Preserve primary score with explicit disagreement; do not merge contradictory ESPN statistics"})
            continue
        for abbr, values in summary_statistics(summary).items():
            if abbr not in game["stats"]:
                continue
            provenance = game["statsProvenance"][abbr]
            for field, value in values.items():
                if value is None:
                    continue
                existing = game["stats"][abbr][field]
                if existing is not None and existing != value:
                    disagreements.append({"gameId": game["id"], "team": abbr, "field": field, "issue": "Statistical sources disagree",
                                          "sourceIds": [*provenance["fieldSources"].get(field, []), source], "values": [existing, value], "action": "Value unavailable pending reconciliation"})
                    game["stats"][abbr][field] = None
                    provenance.setdefault("disputedFields", []).append(field)
                    provenance["status"] = "disputed"
                    continue
                game["stats"][abbr][field] = value
                provenance["fieldSources"].setdefault(field, []).append(source)
            if source not in provenance["sourceIds"]:
                provenance["sourceIds"].append(source)
        game["sourceIds"].append(source)
        game["crossCheck"] = {"status": "verified", "sourceIds": ["nflverse_games", source], "note": "Final score and team identity corroborated by ESPN. Derived nflverse player statistics compared where ESPN publishes matching team statistics."}
    return list(sources.values())


def enrich_context(games, teams, cache_dir, abbr, season, disagreements):
    if not abbr:
        return []
    specs = {f"espn_schedule_{abbr}_{year}": {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/schedule?season={year}&seasontype=2",
               "cache": f"espn-{abbr.lower()}-schedule-{year}.json", "format": "json", "provider": "ESPN", "required": False} for year in (season - 1, season)}
    specs[f"espn_roster_{abbr}"] = {"url": f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{abbr.lower()}/roster",
              "cache": f"espn-{abbr.lower()}-roster.json", "format": "json", "provider": "ESPN", "required": False}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda item: checked_fetch_source(item, cache_dir), specs.items()))
    for source_id, data, meta in results:
        if meta["status"] != "verified":
            continue
        if source_id.startswith("espn_schedule"):
            indexed = {event["id"]: event for event in data.get("events", [])}
            for game in games:
                event = indexed.get(game.get("espnEventId"))
                if not event or event.get("season", {}).get("year") != game["season"]:
                    continue
                competitions = event.get("competitions", [])
                comp = competitions[0] if competitions else {}
                game["sourceIds"].append(source_id)
                if event.get("timeValid") is False or comp.get("timeValid") is False:
                    issue = {"gameId": game["id"], "field": "kickoffUtc", "issue": "ESPN marks kickoff time unconfirmed/TBD", "sourceIds": ["nflverse_games", source_id],
                             "values": [game["kickoffUtc"], event.get("date")], "action": "Kickoff time unavailable until confirmed"}
                    disagreements.append(issue)
                    game["kickoffUtc"], game["kickoffStatus"] = None, "unavailable"
                    game.setdefault("sourceDisagreements", []).append(issue)
                elif event.get("date") and game.get("kickoffUtc"):
                    espn_time = dt.datetime.fromisoformat(event["date"].replace("Z", "+00:00"))
                    nfl_time = dt.datetime.fromisoformat(game["kickoffUtc"].replace("Z", "+00:00"))
                    if espn_time != nfl_time:
                        issue = {"gameId": game["id"], "field": "kickoffUtc", "issue": "Published kickoff times disagree", "sourceIds": ["nflverse_games", source_id], "values": [game["kickoffUtc"], event["date"]], "action": "Kickoff unavailable pending reconciliation"}
                        disagreements.append(issue); game.setdefault("sourceDisagreements", []).append(issue)
                        game["kickoffUtc"], game["kickoffStatus"] = None, "disputed"
                    else:
                        game["kickoffStatus"] = "verified"
                venue = comp.get("venue", {}).get("fullName")
                def normalized(text):
                    return "".join(c for c in unicodedata.normalize("NFKD", text or "").lower() if c.isalnum())
                if venue and normalized(venue) != normalized(game.get("venue")):
                    issue = {"gameId": game["id"], "field": "venue", "issue": "Venue display names differ between providers", "sourceIds": ["nflverse_games", source_id],
                             "values": [game["venue"], venue], "action": "Display current ESPN event venue with both source labels retained"}
                    disagreements.append(issue); game.setdefault("sourceDisagreements", []).append(issue)
                    game["venueSourceId"], game["venue"] = source_id, venue
                if isinstance(comp.get("neutralSite"), bool) and game["neutral"] != comp["neutralSite"]:
                    issue = {"gameId": game["id"], "field": "neutral", "issue": "Venue classification differs between providers", "sourceIds": ["nflverse_games", source_id], "values": [game["neutral"], comp["neutralSite"]], "action": "Venue classification unavailable"}
                    disagreements.append(issue); game.setdefault("sourceDisagreements", []).append(issue)
                    game["neutral"] = game["neutralSite"] = None
        else:
            espn_players = {str(p["id"]): p for group in data.get("athletes", []) for p in group.get("items", [])}
            for player in teams[abbr]["roster"]:
                other = espn_players.get(player.get("espnId"))
                if not other:
                    player["verification"] = {"status": "unavailable", "sourceIds": ["nflverse_roster", source_id], "note": "Player identity not corroborated in retrieved ESPN roster; this does not establish absence from team."}
                    continue
                player["verification"] = {"status": "verified", "sourceIds": ["nflverse_roster", source_id], "note": "Current ESPN athlete ID corroborates roster identity; positions may use different taxonomy."}
                jersey = numeric(other.get("jersey"))
                if jersey is not None and player["jersey"] is not None and jersey != player["jersey"]:
                    issue = {"playerId": player["id"], "team": abbr, "field": "jersey", "issue": "Jersey numbers disagree", "sourceIds": ["nflverse_roster", source_id], "values": [player["jersey"], jersey], "action": "Jersey number unavailable pending reconciliation"}
                    disagreements.append(issue)
                    player["jersey"] = player["number"] = None
                    player["verification"]["status"] = "disputed"
                    player["verification"]["issues"] = [issue]
    return [meta for _, _, meta in results]


def build_snapshot(base, datasets, metadata, now, season, cache_dir=None, enrich_abbr="DAL", roster_teams=None):
    raw_games = [r for r in datasets["nflverse_games"] if r["season"] in (str(season), str(season - 1)) and r["game_type"] == "REG"]
    current_games = [r for r in raw_games if r["season"] == str(season)]
    expected_teams = {team["abbr"] for team in base["teams"]}
    actual_teams = {r[side] for r in current_games for side in ("home_team", "away_team")}
    if not current_games or actual_teams != expected_teams:
        raise ValueError("Current-season schedule does not cover the expected teams; preceding snapshot retained")
    required_columns = {"game_id", "player_id", "team", "season", "week", "season_type", "passing_yards", "sack_yards_lost", "rushing_yards"}
    if not datasets.get("nflverse_player_stats") or not required_columns.issubset(datasets["nflverse_player_stats"][0]):
        raise ValueError("Current player-stat source is absent or has an incompatible schema; preceding snapshot retained")
    final_ids = {r["game_id"] for r in raw_games if numeric(r.get("home_score")) is not None and numeric(r.get("away_score")) is not None and (refresh.kickoff(r) is None or refresh.kickoff(r) <= now)}
    team_rows, player_rows = collections.defaultdict(list), collections.defaultdict(list)
    seen = set()
    for key in ("nflverse_player_stats", f"nflverse_player_stats_{season - 1}"):
        for row in datasets.get(key, []):
            if row.get("season_type") != "REG" or row.get("game_id") not in final_ids:
                continue
            identity = row["game_id"], row["team"], row["player_id"]
            if identity in seen:
                raise ValueError(f"Duplicate player statistics: {identity}")
            seen.add(identity)
            team_rows[(row["game_id"], row["team"])].append(row)
            player_rows[row["player_id"]].append(row)
    games = [normalize_game(r, now, team_rows) for r in raw_games]
    # Explicit requested season is used even when refreshing an archive in Jan/Feb.
    for game in games:
        if game["status"] == "final":
            wanted = "nflverse_player_stats" if game["season"] == season else f"nflverse_player_stats_{game['season']}"
            for prov in game["statsProvenance"].values():
                prov["sourceIds"] = [wanted]
                prov["fieldSources"] = {k: [wanted] for k in prov["fieldSources"]}
            game["sourceIds"] = ["nflverse_games"] + ([wanted] if any(v is not None for x in game["stats"].values() for v in x.values()) else [])
    disagreements = []
    sources = list(metadata.values()) + [s for s in base.get("sources", []) if s["id"] == "nflverse_teams"]
    roster_teams = set(roster_teams or ([enrich_abbr] if enrich_abbr else []))
    if enrich_abbr:
        sources.extend(enrich_games(games, cache_dir, enrich_abbr, disagreements))
    teams = {}
    for identity in base["teams"]:
        abbr = identity["abbr"]
        team_games = sorted([g for g in games if abbr in (g["home_team"], g["away_team"])], key=lambda g: (g["gameday"], g["id"]), reverse=True)
        future = [g for g in team_games if g["season"] == season and g["status"] == "scheduled" and (g["kickoffUtc"] is None or dt.datetime.fromisoformat(g["kickoffUtc"].replace("Z", "+00:00")) >= now)]
        upcoming = min(future, key=lambda g: (g["gameday"], g["kickoffUtc"] or "")) if future else None
        roster = []
        for row in datasets.get("nflverse_roster", []):
            if abbr not in roster_teams or row.get("team") != abbr or row.get("status") == "CUT" or row.get("season") != str(season):
                continue
            player_id = row.get("gsis_id") or row.get("espn_id")
            if not player_id or any(p["id"] == player_id for p in roster):
                continue
            historical = sorted(player_rows.get(row.get("gsis_id"), []), key=lambda r: r["game_id"], reverse=True)
            current_rows = [r for r in historical if r.get("season") == str(season)]
            # Last five recorded statistical appearances, not fabricated game appearances.
            roster.append({"id": player_id, "name": row["full_name"], "jersey": numeric(row.get("jersey_number")),
                           "number": row.get("jersey_number") or None, "position": row.get("position") or None,
                           "status": row.get("status") or None, "espnId": row.get("espn_id") or None,
                           "headshotUrl": row.get("headshot_url") or None,
                           "seasonStats": player_totals(current_rows) if current_rows else None,
                           "last5": [{"gameId": r["game_id"], "season": int(r["season"]), "week": int(r["week"]),
                                      "team": r["team"], "opponent": r["opponent_team"], "stats": player_totals([r]),
                                      "sourceIds": ["nflverse_player_stats" if int(r["season"]) == season else f"nflverse_player_stats_{r['season']}"]} for r in historical[:5]],
                           "sourceIds": ["nflverse_roster", "nflverse_player_stats"],
                           "statsNote": "Last five recorded regular-season statistic rows across available 2025–2026 sources; absence of a row does not establish non-participation or zero."})
        depth = [{"name": r.get("player_name"), "playerId": r.get("gsis_id") or None, "espnId": r.get("espn_id") or None,
                  "position": r.get("pos_abb"), "rank": numeric(r.get("pos_rank")), "unit": r.get("pos_grp"),
                  "sourceTimestamp": r.get("dt"), "sourceIds": ["nflverse_depth"]} for r in datasets.get("nflverse_depth", {}).get(abbr, []) if abbr in roster_teams]
        injury_week = upcoming["week"] if upcoming else max([g["week"] for g in team_games if g["season"] == season], default=base.get("currentWeek"))
        injuries = [{"playerId": r.get("gsis_id") or None, "name": r.get("full_name"), "position": r.get("position"),
                     "week": int(r["week"]), "reportStatus": r.get("report_status") or None,
                     "practiceStatus": r.get("practice_status") or None, "injury": r.get("report_primary_injury") or r.get("practice_primary_injury") or None,
                     "sourceIds": ["nflverse_injuries"]} for r in datasets.get("nflverse_injuries", []) if abbr in roster_teams and r.get("team") == abbr and int(r["week"]) == injury_week]
        teams[abbr] = {**identity, "record": record(team_games, abbr, season), "games": team_games,
                       "upcomingGameId": upcoming["id"] if upcoming else None, "roster": roster,
                       "depth": {"players": depth, "sourceStatus": "verified" if depth else "unavailable", "sourceIds": ["nflverse_depth"], "note": "Published depth order is not a confirmed starter or game-day inactive list."},
                       "injuries": {"players": injuries, "sourceStatus": "verified" if injuries else "unavailable", "sourceIds": ["nflverse_injuries"], "week": injury_week, "note": "Absence from this weekly report does not prove health; confirmed inactives unavailable."},
                       "dataStatus": {"roster": metadata["nflverse_roster"]["status"] if abbr in roster_teams else "unavailable", "depth": metadata["nflverse_depth"]["status"] if depth else "unavailable",
                                      "injuries": metadata["nflverse_injuries"]["status"] if injuries else "unavailable",
                                      "weatherForecast": "unavailable", "travelItinerary": "unavailable", "confirmedInactives": "unavailable"}}
    sources.extend(enrich_context(games, teams, cache_dir, enrich_abbr, season, disagreements))
    return {"schemaVersion": 1, "season": season, "currentWeek": base["currentWeek"], "throughWeek": max([g["week"] for g in games if g["season"] == season and g["status"] == "final"], default=0),
            "retrievedAt": source_time(sources), "generatedAt": refresh.iso(dt.datetime.now(UTC)), "sources": sources, "teams": teams,
            "coverage": {"seasons": [season - 1, season], "seasonTypes": ["REG"], "teams": len(teams), "enrichedTeam": enrich_abbr,
                         "rosterTeams": sorted(roster_teams), "note": "No preseason or postseason. Last-five filtering uses season and venue before selecting newest games. Missing metrics are null; incomplete windows must not become full-window averages. Full roster research is bundled for the approved detail team only; other routes preserve real team form and schedule."},
            "disagreements": disagreements, "provenance": {"teamIdentity": next((s for s in base.get("sources", []) if s["id"] == "nflverse_teams"), None),
                  "schedule": "nflverse public games, original season/week and kickoff timezone America/New_York",
                  "teamStats": "Derived complete nflverse player-stat rows, corroborated by final game scores; ESPN team summaries enrich the selected team's published efficiency and penalty statistics. Disagreements explicitly null the field.",
                  "players": "Current nflverse roster; per-game and season figures are recorded statistical rows, not confirmed appearances. Depth is ESPN-derived order, not confirmed starters.",
                  "injuries": "Published weekly participation/report status; no entry does not prove healthy. Confirmed game-day inactives unavailable.",
                  "refresh": "Source-driven scheduled snapshots, not a provider push/live feed. Retrieval time is distinct from browser reload and generation time."}}


def validate(data):
    assert data["schemaVersion"] == 1 and len(data["teams"]) == 32
    sources = {s["id"]: s for s in data["sources"]}
    game_ids = set()
    for abbr, team in data["teams"].items():
        assert team["abbr"] == abbr
        for game in team["games"]:
            assert abbr in (game["home_team"], game["away_team"])
            assert game["seasonType"] == "REG" and game["season"] in data["coverage"]["seasons"]
            game_ids.add(game["id"])
            if game["status"] == "final":
                assert game["home_score"] is not None and game["away_score"] is not None
                for stat_abbr, stats in game["stats"].items():
                    provenance = game["statsProvenance"][stat_abbr]
                    for field, value in stats.items():
                        assert value is None or isinstance(value, (int, float)) and math.isfinite(value)
                        if value is not None:
                            assert provenance["fieldSources"].get(field), (game["id"], field)
                            assert all(sources[s]["status"] == "verified" for s in provenance["fieldSources"][field])
                    if all(stats[f] is not None for f in ("netPassing", "rushing", "totalOffense")):
                        assert stats["netPassing"] + stats["rushing"] == stats["totalOffense"]
            else:
                assert game["home_score"] is None and game["away_score"] is None
    return {"teams": len(data["teams"]), "uniqueRegularSeasonGames": len(game_ids), "sourceCount": len(sources), "disagreements": len(data["disagreements"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir")
    parser.add_argument("--season", type=int)
    parser.add_argument("--enrich-team", default="DAL")
    parser.add_argument("--roster-team", action="append", help="Bundle full roster research for selected teams; defaults to the enriched team")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        print(json.dumps(validate(json.loads(OUTPUT.read_text())), indent=2))
        return
    base = json.loads((ROOT / "assets/data/current.json").read_text())
    season = args.season or base["season"]
    if base["season"] != season:
        raise ValueError("Refresh current.json for the requested season first; team identity context must match")
    specs = {k: v for k, v in refresh.source_specs(season).items() if k in ("nflverse_games", "nflverse_player_stats", "nflverse_roster", "nflverse_injuries")}
    specs[f"nflverse_player_stats_{season-1}"] = {"url": f"https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season-1}.csv", "cache": f"stats{season-1}.csv", "required": False}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(checked_fetch_source, item, args.cache_dir) for item in specs.items()]
        futures.append(pool.submit(fetch_depth, season, args.cache_dir))
        results = [future.result() for future in futures]
    datasets = {key: rows for key, rows, _ in results}
    metadata = {key: meta for key, _, meta in results}
    data = build_snapshot(base, datasets, metadata, dt.datetime.now(UTC), season, args.cache_dir, args.enrich_team, args.roster_team)
    checks = validate(data)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=OUTPUT.parent, suffix=".tmp", delete=False) as f:
        f.write(body); temporary = Path(f.name)
    temporary.replace(OUTPUT)
    print(json.dumps({**checks, "bytes": len(body.encode()), "sha256": hashlib.sha256(body.encode()).hexdigest(), "retrievedAt": data["retrievedAt"], "DallasRecord": data["teams"]["DAL"]["record"], "DallasUpcomingGame": data["teams"]["DAL"]["upcomingGameId"]}, indent=2))


if __name__ == "__main__":
    main()
