#!/usr/bin/env python3
"""Refresh the offline NFL snapshot from public nflverse datasets.

No credentials, paywall bypass, or runtime requests are used. Required-source or
validation failure exits without replacing the last verified snapshot. Optional
datasets are explicitly unavailable when blocked. Run from any working folder:
  python3 scripts/refresh-data.py
  python3 scripts/refresh-data.py --check
"""
import argparse
import collections
import concurrent.futures
import csv
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
ET = ZoneInfo("America/New_York")
FEATURED_NAMES = ["Aaron Rodgers", "Jaylen Warren", "DK Metcalf", "Michael Pittman", "Pat Freiermuth"]
STAT_FIELDS = {
    "completions": "completions", "attempts": "attempts", "passingYards": "passing_yards",
    "passingTD": "passing_tds", "interceptions": "passing_interceptions",
    "sacks": "sacks_suffered", "sackYardsLost": "sack_yards_lost", "carries": "carries",
    "rushingYards": "rushing_yards", "rushingTD": "rushing_tds", "receptions": "receptions",
    "targets": "targets", "receivingYards": "receiving_yards", "receivingTD": "receiving_tds",
    "tackles": "def_tackles_solo", "assistedTackles": "def_tackle_assists",
    "defensiveSacks": "def_sacks", "defensiveInterceptions": "def_interceptions",
    "passesDefended": "def_pass_defended", "fieldGoalsMade": "fg_made", "fieldGoalAttempts": "fg_att",
    "punts": "pt_att", "puntYards": "pt_yards",
}


def iso(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def number(value):
    if value is None or str(value).strip() in ("", "NA", "NaN", "nan", "null"):
        return None
    n = float(value)
    return int(n) if n.is_integer() else n


def ratio(total, count, places=1):
    return round(total / count, places) if total is not None and count else None


def known_sum(*values):
    """Derived arithmetic stays unavailable when any input is unavailable."""
    return sum(values) if all(value is not None for value in values) else None


def kickoff(row):
    if not row.get("gameday") or not row.get("gametime"):
        return None
    return dt.datetime.fromisoformat(f"{row['gameday']}T{row['gametime']}").replace(tzinfo=ET)


def source_specs(season):
    release = "https://github.com/nflverse/nflverse-data/releases/download"
    return {
        "nflverse_games": {"url": "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv", "cache": "games.csv", "required": True},
        "nflverse_teams": {"url": f"{release}/teams/teams_colors_logos.csv", "cache": "team-colors.csv", "required": True},
        "nflverse_roster": {"url": f"{release}/rosters/roster_{season}.csv", "cache": f"roster{season}.csv", "required": True},
        "nflverse_player_stats": {"url": f"{release}/stats_player/stats_player_week_{season}.csv", "cache": f"stats{season}.csv", "required": True},
        "nflverse_depth": {"url": f"{release}/depth_charts/depth_charts_{season}.csv", "cache": f"depth{season}.csv", "required": False},
        "nflverse_injuries": {"url": f"{release}/injuries/injuries_{season}.csv", "cache": f"injuries{season}.csv", "required": False},
    }


def fetch_source(item, cache_dir):
    source_id, spec = item
    metadata = {"id": source_id, "url": spec["url"], "provider": "nflverse", "required": spec["required"]}
    try:
        cache = Path(cache_dir) / spec["cache"] if cache_dir else None
        if cache and cache.exists():
            body = cache.read_bytes()
            retrieved = dt.datetime.fromtimestamp(cache.stat().st_mtime, UTC)
        else:
            request = urllib.request.Request(spec["url"], headers={"User-Agent": "ProjectDollarDataRefresh/1.0 public-data-audit"})
            with urllib.request.urlopen(request, timeout=75) as response:
                body = response.read()
                metadata["httpStatus"] = response.status
            retrieved = dt.datetime.now(UTC)
        metadata.update({"retrievedAt": iso(retrieved), "status": "verified", "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
        if not rows:
            raise ValueError("Source contains no rows")
        return source_id, rows, metadata
    except Exception as exc:
        metadata.update({"retrievedAt": iso(dt.datetime.now(UTC)), "status": "unavailable", "error": str(exc)})
        if spec["required"]:
            raise RuntimeError(f"Required source {source_id} unavailable: {exc}") from exc
        return source_id, [], metadata


def aggregate_stats(rows):
    values = {}
    for key, field in STAT_FIELDS.items():
        inputs = [number(row.get(field)) for row in rows]
        # An explicit zero is a verified zero. A missing field/cell or absent
        # source row cannot establish a zero, including within season totals.
        values[key] = sum(inputs) if inputs and all(value is not None for value in inputs) else None
    # nflverse supplies sack_yards_lost as signed negative yardage; expose the
    # absolute loss so net passing = gross passing minus this positive value.
    values["sackYardsLost"] = abs(values["sackYardsLost"]) if values["sackYardsLost"] is not None else None
    values["games"] = len(set(row["game_id"] for row in rows)) if rows else None
    values["completionPct"] = ratio(values["completions"] * 100 if values["completions"] is not None else None, values["attempts"])
    values["yardsPerCarry"] = ratio(values["rushingYards"], values["carries"])
    values["yardsPerReception"] = ratio(values["receivingYards"], values["receptions"])
    values["passingYardsPerGame"] = ratio(values["passingYards"], values["games"])
    values["rushingYardsPerGame"] = ratio(values["rushingYards"], values["games"])
    values["receivingYardsPerGame"] = ratio(values["receivingYards"], values["games"])
    if values["attempts"] and all(values[key] is not None for key in ("completions", "passingYards", "passingTD", "interceptions")):
        a = values["attempts"]
        terms = [(values["completions"] / a - .3) * 5, (values["passingYards"] / a - 3) * .25,
                 values["passingTD"] / a * 20, 2.375 - values["interceptions"] / a * 25]
        values["passerRating"] = round(sum(max(0, min(2.375, term)) for term in terms) / 6 * 100, 1)
    else:
        values["passerRating"] = None
    return values


def record_string(record):
    text = f"{record['w']}–{record['l']}"
    return text + f"–{record['ties']}" if record["ties"] else text


def standings(teams, games, through_week):
    records = {abbr: {"id": abbr.lower(), "abbr": abbr, "name": team["name"], "fullName": team["fullName"],
                       "w": 0, "l": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0, "results": [], "rank": None}
               for abbr, team in teams.items()}
    for game in sorted(games, key=lambda item: (item["gameday"], int(item["week"]), item["game_id"])):
        if int(game["week"]) > through_week or not game.get("away_score") or not game.get("home_score"):
            continue
        away_score, home_score = number(game["away_score"]), number(game["home_score"])
        for team, score, other in [(game["away_team"], away_score, home_score), (game["home_team"], home_score, away_score)]:
            result = "W" if score > other else "L" if score < other else "T"
            records[team][{"W": "w", "L": "l", "T": "ties"}[result]] += 1
            records[team]["pointsFor"] += score
            records[team]["pointsAgainst"] += other
            records[team]["results"].append(result)
    for row in records.values():
        count = row["w"] + row["l"] + row["ties"]
        row["pct"] = f"{(row['w'] + row['ties'] / 2) / count:.3f}" if count else ".000"
        last = row["results"][-1:] or [""]
        length = next((i for i, result in enumerate(reversed(row["results"])) if result != last[0]), len(row["results"]))
        row["streak"] = f"{last[0]}{length}" if length else "—"
        row["record"] = record_string(row)
        row["pointDifferential"] = row["pointsFor"] - row["pointsAgainst"]
        del row["results"]
    groups = {conference: sorted([r for abbr, r in records.items() if teams[abbr]["conference"] == conference],
                                 key=lambda r: (-float(r["pct"]), -r["pointDifferential"], r["abbr"]))
              for conference in ("AFC", "NFC")}
    for rows in groups.values():
        for index, row in enumerate(rows, 1):
            row["sortIndex"] = index
    return records, groups


def decimal_odds(moneyline):
    if moneyline is None or moneyline == 0:
        return None
    return round(1 + (moneyline / 100 if moneyline > 0 else 100 / abs(moneyline)), 3)


def normalize_game(game, records):
    time = kickoff(game)
    completed = bool(game.get("away_score") and game.get("home_score"))
    away, home = game["away_team"], game["home_team"]
    away_ml, home_ml = number(game.get("away_moneyline")), number(game.get("home_moneyline"))
    return {"id": game["game_id"], "season": int(game["season"]), "week": int(game["week"]),
            "gameday": game["gameday"], "weekday": game.get("weekday"), "gametime": game.get("gametime") or None,
            "kickoffUtc": iso(time) if time else None, "kickoffTimeZone": "America/New_York",
            "away_team": away, "home_team": home, "away_record": records[away]["record"] if away in records else None,
            "home_record": records[home]["record"] if home in records else None,
            "away_score": number(game.get("away_score")), "home_score": number(game.get("home_score")),
            "status": "final" if completed else "scheduled", "venue": game.get("stadium") or None,
            "neutralSite": game.get("location") == "Neutral", "roof": game.get("roof") or None,
            "surface": game.get("surface") or None, "homeRest": number(game.get("home_rest")), "awayRest": number(game.get("away_rest")),
            "weather": {"status": "verified" if game.get("temp") else "unavailable", "tempF": number(game.get("temp")),
                        "windMph": number(game.get("wind")), "kind": "Recorded game conditions; not a forecast"},
            "odds": {"status": "verified" if away_ml is not None and home_ml is not None else "unavailable",
                     "awayMoneyline": away_ml, "homeMoneyline": home_ml, "awayDecimal": decimal_odds(away_ml),
                     "homeDecimal": decimal_odds(home_ml), "spread": number(game.get("spread_line")), "total": number(game.get("total_line")),
                     "kind": "Dataset line; sportsbook and line timestamp not supplied", "sourceId": "nflverse_games"},
            "sourceId": "nflverse_games"}


def card_stats(position, stats, has_data):
    pairs = ([('passingYards', 'PASS YDS'), ('passingTD', 'TD'), ('interceptions', 'INT'), ('passerRating', 'RATING')] if position == 'QB' else
             [('rushingYards', 'RUSH YDS'), ('carries', 'ATT'), ('receivingYards', 'REC YDS'), ('yardsPerCarry', 'YPC')] if position in ('RB', 'FB') else
             [('receptions', 'REC'), ('receivingYards', 'REC YDS'), ('receivingTD', 'TD'), ('targets', 'TARGETS')] if position in ('WR', 'TE') else
             [('fieldGoalsMade', 'FG'), ('fieldGoalAttempts', 'ATT'), ('games', 'GAMES'), ('punts', 'PUNTS')] if position in ('K', 'P') else
             [('games', 'GAMES'), ('tackles', 'SOLO'), ('assistedTackles', 'AST'), ('defensiveSacks', 'SACKS')] if position_filter(position) == 'OL' else
             [('tackles', 'SOLO'), ('assistedTackles', 'AST'), ('defensiveSacks', 'SACKS'), ('defensiveInterceptions', 'INT')])
    return [{"label": label, "value": stats[key] if has_data and stats[key] is not None else "—"} for key, label in pairs]


def position_filter(position):
    return position if position in ("QB", "RB", "WR", "TE") else "RB" if position == "FB" else "K" if position in ("K", "P", "LS") else "OL" if position in ("C", "G", "T", "OT", "OG", "OL") else "DEF"


def build_snapshot(datasets, metadata, now, requested_season):
    actual_retrieval = min(dt.datetime.fromisoformat(item["retrievedAt"].replace("Z", "+00:00"))
                           for item in metadata.values() if item["required"] and item["status"] == "verified")
    all_games = datasets["nflverse_games"]
    raw_games = [g for g in all_games if g["season"] == str(requested_season) and g["game_type"] == "REG"]
    if not raw_games:
        raise ValueError(f"No verified schedule for requested season {requested_season}; retain prior snapshot")
    required_stat_columns = set(STAT_FIELDS.values()) | {"season", "season_type", "week", "game_id", "team", "opponent_team", "player_id", "position", "player_display_name", "player_name"}
    if datasets["nflverse_player_stats"]:
        missing_columns = required_stat_columns - set(datasets["nflverse_player_stats"][0])
        if missing_columns:
            raise ValueError(f"Player-stat source schema missing required columns: {', '.join(sorted(missing_columns))}; retain prior snapshot")
    stats = [r for r in datasets["nflverse_player_stats"] if r["season"] == str(requested_season) and r["season_type"] == "REG"]
    roster = [r for r in datasets["nflverse_roster"] if r["season"] == str(requested_season) and r["team"] == "PIT" and r["status"] != "CUT"]
    disagreements = []
    for game in raw_games:
        if game.get("away_score") and game.get("home_score") and kickoff(game) and kickoff(game) > now:
            disagreements.append({"gameId": game["game_id"], "issue": "Source supplied final score before scheduled kickoff", "action": "excluded final score"})
            game["away_score"], game["home_score"] = "", ""
    finished = [g for g in raw_games if g.get("away_score") and g.get("home_score")]
    completed_game_ids = {g["game_id"] for g in finished}
    invalid_stat_games = sorted({r["game_id"] for r in stats if r["game_id"] not in completed_game_ids})
    if invalid_stat_games:
        disagreements.append({"issue": "Weekly player statistics lack a corroborating final game score",
                              "gameIds": invalid_stat_games, "action": "Statistics excluded until final game can be verified"})
        stats = [r for r in stats if r["game_id"] in completed_game_ids]
    unfinished = sorted([g for g in raw_games if not g.get("away_score")], key=lambda g: (g["gameday"], g["gametime"] or "23:59"))
    upcoming = [g for g in unfinished if kickoff(g) is None or kickoff(g) >= now]
    current_week = int(upcoming[0]["week"]) if upcoming else max(int(g["week"]) for g in raw_games)
    through_week = max([int(g["week"]) for g in finished], default=0)
    stats_week = max([int(r["week"]) for r in stats], default=0)
    teams = {}
    for row in datasets["nflverse_teams"]:
        if row["team_abbr"] in {g["home_team"] for g in raw_games} and row["team_conf"] in ("AFC", "NFC"):
            abbr = row["team_abbr"]
            teams[abbr] = {"id": abbr.lower(), "abbr": abbr, "name": row["team_nick"], "fullName": row["team_name"],
                           "conference": row["team_conf"], "division": row["team_division"], "color": row["team_color"],
                           "color2": row["team_color2"], "logoUrl": row["team_logo_espn"], "sourceId": "nflverse_teams"}
    if len(teams) != 32:
        raise ValueError(f"Expected 32 current teams, received {len(teams)}")
    all_records, conferences = standings(teams, raw_games, through_week)
    stats_by_player = collections.defaultdict(list)
    for row in stats:
        if row["team"] == "PIT":
            stats_by_player[row["player_id"]].append(row)
    depth_rows = datasets["nflverse_depth"]
    pit_depth = [r for r in depth_rows if r["team"] == "PIT"]
    depth_timestamp = max([r["dt"] for r in pit_depth], default=None)
    depth_rows = [r for r in pit_depth if r["dt"] == depth_timestamp]
    injuries = [r for r in datasets["nflverse_injuries"] if r["team"] == "PIT" and int(r["week"]) == current_week]
    injury_by_id = {r["gsis_id"]: {"playerId": r["gsis_id"], "name": r["full_name"], "position": r["position"], "week": int(r["week"]),
                                  "reportStatus": r.get("report_status") or None, "practiceStatus": r.get("practice_status") or None,
                                  "injury": r.get("report_primary_injury") or r.get("practice_primary_injury") or None,
                                  "sourceId": "nflverse_injuries"} for r in injuries}
    schedule = [normalize_game(g, standings(teams, raw_games, min(int(g['week']) - 1, through_week))[0])
                for g in sorted(raw_games, key=lambda g: (g["gameday"], g["game_id"])) if "PIT" in (g["home_team"], g["away_team"])]
    game_by_id = {g["id"]: g for g in schedule}
    normalized_roster = []
    for player in roster:
        player_stats = sorted(stats_by_player[player["gsis_id"]], key=lambda r: int(r["week"]), reverse=True)
        season_stats = aggregate_stats(player_stats)
        player_depth = [r for r in depth_rows if r["gsis_id"] == player["gsis_id"] or (player.get("espn_id") and r["espn_id"] == player["espn_id"])]
        rank = min([int(r["pos_rank"]) for r in player_depth if r.get("pos_rank")], default=None)
        position = player["position"]
        last5 = [{"week": int(row["week"]), "opponent": row["opponent_team"], "date": game_by_id.get(row["game_id"], {}).get("gameday"),
                  "gameId": row["game_id"], "stats": aggregate_stats([row]), "sourceId": "nflverse_player_stats"} for row in player_stats[:5]]
        number_value = number(player.get("jersey_number"))
        normalized_roster.append({"id": player["gsis_id"], "name": player["full_name"], "number": str(number_value) if number_value is not None else "—",
                                  "position": position, "filterGroup": position_filter(position), "team": "PIT", "espnId": player.get("espn_id") or None,
                                  "photoUrl": player.get("headshot_url") or None, "rosterStatus": {"ACT": "Active", "DEV": "Practice squad", "RES": "Reserve"}.get(player["status"], player["status"]),
                                  "sourceWeek": number(player.get("week")), "status": player["status"], "featured": player["full_name"] in FEATURED_NAMES,
                                  "depth": {"status": "verified" if rank is not None else "unavailable", "rank": rank,
                                            "label": "First on depth chart" if rank == 1 else f"Depth {rank}" if rank else "Depth unavailable",
                                            "sourceTimestamp": depth_timestamp, "sourceId": "nflverse_depth",
                                            "note": "Depth-chart order is not a confirmed game-day starter or inactive list"},
                                  "injury": injury_by_id.get(player["gsis_id"], {"reportStatus": None, "practiceStatus": None, "injury": None, "week": current_week,
                                                                                 "note": "No entry in retrieved weekly report; does not confirm healthy or active"}),
                                  "stats": card_stats(position, season_stats, bool(player_stats)), "seasonStats": season_stats if player_stats else None,
                                  "statsStatus": "derived" if player_stats else "unavailable", "last5": last5,
                                  "last5Note": f"{len(last5)} verified {requested_season} regular-season games available; up to five shown",
                                  "sourceIds": ["nflverse_roster", "nflverse_player_stats"]})
    normalized_roster.sort(key=lambda p: (FEATURED_NAMES.index(p["name"]) if p["name"] in FEATURED_NAMES else 100,
                                          {"Active": 0, "Reserve": 1, "Practice squad": 2}.get(p["rosterStatus"], 3), p["filterGroup"], p["name"]))
    next_pit = next((g for g in schedule if g["status"] == "scheduled" and (not g["kickoffUtc"] or dt.datetime.fromisoformat(g["kickoffUtc"].replace("Z", "+00:00")) >= now)), None)
    opponent = (next_pit["home_team"] if next_pit["away_team"] == "PIT" else next_pit["away_team"]) if next_pit else None
    weeks = {}
    for week in sorted(set(int(g["week"]) for g in raw_games)):
        # The selected current week shows every final score available now;
        # historical/future fixture views retain entering-week record context.
        through = min(week if week == current_week else week - 1, through_week)
        records, standings_groups = standings(teams, raw_games, through)
        leader_week = min(week - 1, stats_week) if stats_week and week > 1 else None
        leaders = {}
        for position, yards, touchdowns in [("QB", "passing_yards", "passing_tds"), ("RB", "rushing_yards", "rushing_tds")]:
            rows = sorted([r for r in stats if r["position"] == position and int(r["week"]) == leader_week],
                          key=lambda r: (-(number(r[yards]) or 0), -(number(r[touchdowns]) or 0), r["player_display_name"]))
            leaders[position] = [{"name": r["player_display_name"], "short": r["player_name"], "playerId": r["player_id"], "position": position,
                                  "team": r["team"], "yards": number(r[yards]), "td": number(r[touchdowns])} for r in rows[:5]]
        fixture_raw = next((g for g in raw_games if int(g["week"]) == week and "PIT" in (g["home_team"], g["away_team"])), None)
        weeks[str(week)] = {"throughWeek": through, "leadersWeek": leader_week, "recapWeek": leader_week, "conferences": standings_groups, "leaders": leaders,
                            "recap": [normalize_game(g, standings(teams, raw_games, max(0, int(g["week"]) - 1))[0]) for g in raw_games if int(g["week"]) == leader_week and g.get("away_score")],
                            "fixture": normalize_game(fixture_raw, records) if fixture_raw else None,
                            "standingsContext": "Latest completed games as of retrieval" if week == current_week else "Entering selected week; future records use latest completed games",
                            "completedGamesInThroughWeek": sum(int(g["week"]) == through for g in finished),
                            "scheduledGamesInThroughWeek": sum(int(g["week"]) == through for g in raw_games)}
    pit_stats = aggregate_stats([r for r in stats if r["team"] == "PIT"])
    pit_final = [g for g in schedule if g["status"] == "final"]
    # Score data can update before the weekly player-stat release. Keep all
    # season team-stat denominators and points within the same available week.
    pit_stat_game_ids = {row["game_id"] for row in stats if row["team"] == "PIT"}
    stats_games = [g for g in pit_final if g["id"] in pit_stat_game_ids]
    pit_stats_week = max((g["week"] for g in stats_games), default=0)
    game_count = len(stats_games)
    points_for = sum(g["home_score"] if g["home_team"] == "PIT" else g["away_score"] for g in stats_games) if game_count else None
    points_against = sum(g["away_score"] if g["home_team"] == "PIT" else g["home_score"] for g in stats_games) if game_count else None
    net_passing = known_sum(pit_stats["passingYards"], -pit_stats["sackYardsLost"] if pit_stats["sackYardsLost"] is not None else None)
    total_yards = known_sum(net_passing, pit_stats["rushingYards"])
    team_stats = {"games": game_count, "throughWeek": pit_stats_week, "coverageGameIds": sorted(pit_stat_game_ids), "pointsFor": points_for, "pointsAgainst": points_against,
                  "pointsPerGame": ratio(points_for, game_count), "pointsAllowedPerGame": ratio(points_against, game_count),
                  "passingYards": pit_stats["passingYards"], "netPassingYards": net_passing,
                  "rushingYards": pit_stats["rushingYards"], "receivingYards": pit_stats["receivingYards"],
                  "passingYardsPerGame": ratio(pit_stats["passingYards"], game_count), "rushingYardsPerGame": ratio(pit_stats["rushingYards"], game_count),
                  "totalYards": total_yards,
                  "totalYardsPerGame": ratio(total_yards, game_count),
                  "passingTD": pit_stats["passingTD"], "rushingTD": pit_stats["rushingTD"], "interceptions": pit_stats["interceptions"],
                  "completionPct": pit_stats["completionPct"], "yardsPerCarry": pit_stats["yardsPerCarry"]}
    opponent_games = [g for g in finished if opponent in (g["home_team"], g["away_team"])] if opponent else []
    opponent_stat_game_ids = {row["game_id"] for row in stats if row["opponent_team"] == opponent and row["position"] in ("QB", "RB", "FB", "WR", "TE")} if opponent else set()
    allowance_games = [g for g in opponent_games if g["game_id"] in opponent_stat_game_ids]
    allowance_week = max((int(g["week"]) for g in allowance_games), default=0)
    allowance = {}
    for position in ("QB", "RB", "WR", "TE"):
        rows = [r for r in stats if r["opponent_team"] == opponent and r["position"] == position]
        sums = aggregate_stats(rows)
        count = len(allowance_games)
        td_allowed = known_sum(sums["passingTD"], sums["rushingTD"], sums["receivingTD"])
        allowance[position] = {"status": "derived" if count and rows else "unavailable", "games": count,
                               "throughWeek": allowance_week, "coverageGameIds": sorted(opponent_stat_game_ids),
                               "passingYardsAllowed": sums["passingYards"], "rushingYardsAllowed": sums["rushingYards"],
                               "receivingYardsAllowed": sums["receivingYards"], "receptionsAllowed": sums["receptions"], "tdAllowed": td_allowed,
                               "passingYardsAllowedPerGame": ratio(sums["passingYards"], count), "rushingYardsAllowedPerGame": ratio(sums["rushingYards"], count),
                               "receivingYardsAllowedPerGame": ratio(sums["receivingYards"], count), "receptionsAllowedPerGame": ratio(sums["receptions"], count),
                               "tdAllowedPerGame": ratio(td_allowed, count), "note": "Position from weekly player stats; QB TD includes passing plus rushing/receiving. Denominator uses completed opponent games with verified offensive-stat rows; absent position rows are unavailable."}
    historical = sorted([g for g in all_games if {g["home_team"], g["away_team"]} == {"PIT", opponent} and g.get("away_score") and g["gameday"] < now.date().isoformat()],
                        key=lambda g: g["gameday"], reverse=True)[:5] if opponent else []
    historical_games = [normalize_game(g, {}) for g in historical]
    provenance = {
        "standings": {"status": "derived", "sourceIds": ["nflverse_games", "nflverse_teams"], "season": requested_season, "throughWeek": through_week,
                      "note": "Calculated from final regular-season scores as of retrieval; a week can be partly completed. Sorted by win percentage, point differential, then abbreviation; not official playoff seeding. rank intentionally null."},
        "weeklyLeaders": {"status": "verified", "sourceIds": ["nflverse_player_stats"], "season": requested_season, "throughWeek": stats_week, "note": "Previous available week's yards; future selected weeks explicitly retain latest verified leader week."},
        "roster": {"status": "verified", "sourceIds": ["nflverse_roster"], "season": requested_season, "week": current_week, "note": "Current retained roster: active, reserve and practice squad; cut players excluded."},
        "playerStats": {"status": "derived" if stats else "unavailable", "sourceIds": ["nflverse_player_stats"], "season": requested_season, "throughWeek": stats_week, "note": "Summed regular-season weekly statistics, gated to corroborated final games. Missing source row or numeric cell is unavailable, not assumed zero; missing required source columns reject refresh. games means games with a statistics row, not confirmed appearances or snaps. NFL passer rating calculated from verified attempts/completions/yards/TD/INT."},
        "teamStats": {"status": "derived" if game_count else "unavailable", "sourceIds": ["nflverse_games", "nflverse_player_stats"], "season": requested_season, "throughWeek": pit_stats_week, "coverageGameIds": sorted(pit_stat_game_ids), "note": "Gross passing yards displayed separately; total yards uses passing minus sack yards plus rushing. Per-game denominators use only completed Steelers games with verified team-stat rows; scores without released statistics are excluded from these totals."},
        "schedule": {"status": "verified", "sourceIds": ["nflverse_games"], "season": requested_season, "note": "Kickoff converted from America/New_York with daylight saving. Fixture records are entering each week; future records reflect latest completed week, not predictions."},
        "injuries": {"status": "verified" if injuries else "unavailable", "sourceIds": ["nflverse_injuries"], "season": requested_season, "week": current_week, "note": "Practice participation and report status are separate. Blank report status is unavailable; absent player does not mean healthy. Confirmed game-day inactive list unavailable."},
        "depthChart": {"status": "verified" if depth_rows else "unavailable", "sourceIds": ["nflverse_depth"], "season": requested_season, "sourceTimestamp": depth_timestamp, "note": "Latest published ESPN-derived depth order, not a confirmed starter designation."},
        "opponentAllowances": {"status": "derived" if allowance_games else "unavailable", "sourceIds": ["nflverse_player_stats", "nflverse_games"], "season": requested_season, "throughWeek": allowance_week, "coverageGameIds": sorted(opponent_stat_game_ids), "opponent": opponent, "note": "Opponent player-stat totals grouped by QB/RB/WR/TE; every position uses the same completed opponent games with verified offensive-stat coverage. New final scores do not dilute unreleased stat totals; absent position rows are unavailable."},
        "historicalMatchups": {"status": "verified" if historical else "unavailable", "sourceIds": ["nflverse_games"], "note": "Most recent five completed meetings; each game carries its original season/week."},
        "historicalPrices": {"status": "verified" if any(g["odds"]["status"] == "verified" for g in historical_games) else "unavailable", "sourceIds": ["nflverse_games"], "note": "Archival moneylines preserved exactly. Bookmaker and capture time are not supplied by source; cannot identify exact previous pre-game price."},
        "exactPreGamePrices": {"status": "unavailable", "sourceIds": [], "note": "Archived dataset moneylines are available, but no bookmaker identity or capture time verifies an exact previous pre-game head-to-head price."},
        "weatherForecast": {"status": "unavailable", "sourceIds": [], "note": "No accessible verified forecast feed in this environment. NOAA API blocked403 during audit. Historical recorded conditions remain sourced game data."},
        "travel": {"status": "unavailable", "sourceIds": [], "note": "Team travel itinerary not publicly verified. Home/away, venue and rest days are available from the schedule."},
        "crossChecks": {"status": "partial", "sourceIds": ["nflverse_games", "nflverse_player_stats", "nflverse_roster", "nflverse_depth", "nflverse_injuries"], "note": "Internal dataset consistency validated. Independent official/ESPN API retrieval blocked403; no claim of independently verified official standings."},
    }
    return {"schemaVersion": 1, "retrievedAt": iso(actual_retrieval), "generatedAt": iso(now), "season": requested_season, "currentWeek": current_week, "throughWeek": through_week,
            "context": {"label": f"{requested_season} regular season · Week {current_week}", "requestedSeason": requested_season, "availableSeason": requested_season,
                        "isCurrent": bool(upcoming) and now < actual_retrieval + dt.timedelta(hours=24),
                        "isStale": now > actual_retrieval + dt.timedelta(hours=6), "refreshAfter": iso(actual_retrieval + dt.timedelta(hours=6)),
                        "freshness": "Verified cached snapshot; not a live feed. Age uses the oldest required source retrieval, not regeneration time.",
                        "statsThroughWeek": stats_week, "last5Note": "Only played games are shown; no synthetic results pad the last-five lists"},
            "teams": list(teams.values()), "teamNames": {abbr: team["name"] for abbr, team in teams.items()}, "weeks": weeks,
            "roster": normalized_roster, "steelers": {"record": all_records["PIT"], "schedule": schedule, "last5": list(reversed(pit_final))[:5],
                     "teamStats": team_stats, "upcomingGame": next_pit, "injuries": list(injury_by_id.values()),
                     "depthChart": [{"name": r["player_name"], "playerId": r["gsis_id"] or None, "espnId": r["espn_id"] or None,
                                     "position": r["pos_abb"], "rank": number(r["pos_rank"]), "unit": r["pos_grp"], "sourceTimestamp": r["dt"]} for r in depth_rows],
                     "matchup": {"opponent": opponent, "opponentRecord": all_records.get(opponent), "last5": historical_games,
                                 "opponentLast5": [normalize_game(g, standings(teams, raw_games, max(0, int(g["week"]) - 1))[0]) for g in sorted(opponent_games, key=lambda g: g["gameday"], reverse=True)[:5]],
                                 "allowances": allowance, "weather": {"status": "unavailable", "note": provenance["weatherForecast"]["note"]},
                                 "travel": {"status": "unavailable", "note": provenance["travel"]["note"]},
                                 "historicalPrices": [{"gameId": g["id"], "date": g["gameday"], **g["odds"]} for g in historical_games]}},
            "sources": list(metadata.values()), "provenance": provenance, "disagreements": disagreements,
            "unavailable": [{"field": field, "reason": entry["note"]} for field, entry in provenance.items() if entry["status"] == "unavailable"]}


def validate(data):
    assert data["schemaVersion"] == 1
    assert len(data["teams"]) == 32
    assert data["season"] == data["context"]["availableSeason"] == data["context"]["requestedSeason"]
    assert data["currentWeek"] in range(1, 19)
    assert len(data["weeks"][str(data["currentWeek"])]["conferences"]["AFC"]) == 16
    assert len(data["weeks"][str(data["currentWeek"])]["conferences"]["NFC"]) == 16
    assert len({p["id"] for p in data["roster"]}) == len(data["roster"]), "Duplicate player IDs"
    assert all(p["rosterStatus"] != "CUT" and p["team"] == "PIT" for p in data["roster"])
    assert len([p for p in data["roster"] if p["featured"]]) <= 5
    assert all(len(p["stats"]) == 4 for p in data["roster"])
    for group in data["provenance"].values():
        assert group["status"] in ("verified", "derived", "unavailable", "partial")
        assert group["note"]
    for week in data["weeks"].values():
        all_rows = week["conferences"]["AFC"] + week["conferences"]["NFC"]
        assert len({r["abbr"] for r in all_rows}) == 32
        assert sum(r["w"] for r in all_rows) == sum(r["l"] for r in all_rows)
        assert all(r["rank"] is None for r in all_rows)
    assert all(s.get("sha256") and s.get("retrievedAt") for s in data["sources"] if s["status"] == "verified")
    team_stats = data["steelers"]["teamStats"]
    if team_stats["netPassingYards"] is not None and team_stats["passingYards"] is not None:
        assert team_stats["netPassingYards"] <= team_stats["passingYards"], "Sack loss must reduce net passing"
    assert team_stats["totalYards"] == known_sum(team_stats["netPassingYards"], team_stats["rushingYards"])
    source_ids = {s["id"] for s in data["sources"]}
    assert all(source_id in source_ids for group in data["provenance"].values() for source_id in group["sourceIds"])
    encoded = json.dumps(data, allow_nan=False)
    assert "NaN" not in encoded
    return {"status": "passed", "teamCount": len(data["teams"]), "rosterCount": len(data["roster"]),
            "activeRosterCount": sum(p["rosterStatus"] == "Active" for p in data["roster"]),
            "season": data["season"], "currentWeek": data["currentWeek"], "throughWeek": data["throughWeek"],
            "featured": [p["name"] for p in data["roster"] if p["featured"]], "disagreements": data["disagreements"]}


def atomic_json(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, ensure_ascii=False, indent=None if compact else 2,
                         separators=(",", ":") if compact else None, allow_nan=False) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, help="Requested NFL season; defaults to current year, previous year in Jan/Feb")
    parser.add_argument("--cache-dir", help="Use already-retrieved audit CSVs with their original filesystem retrieval timestamps")
    parser.add_argument("--check", action="store_true", help="Validate saved snapshot without a network request")
    args = parser.parse_args()
    if args.check:
        data = json.loads((ROOT / "assets/data/current.json").read_text())
        provenance = json.loads((ROOT / "assets/data/provenance.json").read_text())
        canonical_hash = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        assert canonical_hash == provenance["snapshotSha256CanonicalJson"], "Saved snapshot differs from its provenance manifest"
        print(json.dumps({**validate(data), "provenanceHash": "passed"}, indent=2))
        return
    now = dt.datetime.now(UTC)
    season = args.season or (now.year - 1 if now.month < 3 else now.year)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda item: fetch_source(item, args.cache_dir), source_specs(season).items()))
    datasets = {source_id: rows for source_id, rows, _ in results}
    metadata = {source_id: meta for source_id, _, meta in results}
    data = build_snapshot(datasets, metadata, now, season)
    checks = validate(data)
    normalized_hash = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    provenance = {"schemaVersion": 1, "generatedAt": data["generatedAt"], "retrievedAt": data["retrievedAt"], "snapshotSha256CanonicalJson": normalized_hash,
                  "sources": data["sources"], "datasets": data["provenance"], "validation": checks,
                  "sourcePolicy": "Public authorised datasets only; rejected sources are not bypassed. Required-source failure retains the preceding verified snapshot.",
                  "refreshCommand": "python3 scripts/refresh-data.py", "validateCommand": "python3 scripts/refresh-data.py --check",
                  "refreshCadence": "Recommend every six hours during the season; snapshot freshness is always visible in app."}
    atomic_json(ROOT / "assets/data/current.json", data, compact=True)
    atomic_json(ROOT / "assets/data/provenance.json", provenance)
    print(json.dumps({**checks, "retrievedAt": data["retrievedAt"], "nextGame": data["steelers"]["upcomingGame"], "snapshotBytes": (ROOT / "assets/data/current.json").stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
