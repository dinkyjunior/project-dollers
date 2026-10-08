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
import html
import io
import json
import os
import re
import ssl
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
# Counting statistics can be summed over games. Efficiency and longest-distance
# fields below remain per-game values; they are never summed into season totals.
EXTRA_COUNT_FIELDS = {
    "passingAirYards": "passing_air_yards", "passingYardsAfterCatch": "passing_yards_after_catch",
    "passingFirstDowns": "passing_first_downs", "passingTwoPointConversions": "passing_2pt_conversions",
    "sackFumbles": "sack_fumbles", "sackFumblesLost": "sack_fumbles_lost",
    "rushingFumbles": "rushing_fumbles", "rushingFumblesLost": "rushing_fumbles_lost",
    "rushingFirstDowns": "rushing_first_downs", "rushingTwoPointConversions": "rushing_2pt_conversions",
    "rushing20Plus": "rushing_20", "rushing40Plus": "rushing_40",
    "receivingFumbles": "receiving_fumbles", "receivingFumblesLost": "receiving_fumbles_lost",
    "receivingAirYards": "receiving_air_yards", "receivingYardsAfterCatch": "receiving_yards_after_catch",
    "receivingFirstDowns": "receiving_first_downs", "receivingTwoPointConversions": "receiving_2pt_conversions",
    "receiving20Plus": "receiving_20", "receiving40Plus": "receiving_40", "specialTeamsTD": "special_teams_tds",
    "tacklesWithAssist": "def_tackles_with_assist", "tacklesForLoss": "def_tackles_for_loss",
    "tackleForLossYards": "def_tackles_for_loss_yards", "forcedFumbles": "def_fumbles_forced",
    "defensiveSackYards": "def_sack_yards", "quarterbackHits": "def_qb_hits",
    "interceptionReturnYards": "def_interception_yards", "defensiveTD": "def_tds",
    "defensiveFumbles": "def_fumbles", "safeties": "def_safeties", "puntBlocks": "def_punt_blocks",
    "extraPointBlocks": "def_pat_blocks", "fieldGoalBlocks": "def_fg_blocks",
    "fumbleRecoveriesOwn": "fumble_recovery_own", "fumbleRecoveryYardsOwn": "fumble_recovery_yards_own",
    "fumbleRecoveriesOpponent": "fumble_recovery_opp", "fumbleRecoveryYardsOpponent": "fumble_recovery_yards_opp",
    "fumbleRecoveryTD": "fumble_recovery_tds", "penalties": "penalties", "penaltyYards": "penalty_yards",
    "fumbles": "fumbles_total", "fumblesLost": "fumbles_lost_total",
    "puntReturns": "punt_returns", "puntReturnYards": "punt_return_yards",
    "kickoffReturns": "kickoff_returns", "kickoffReturnYards": "kickoff_return_yards",
    "fieldGoalsMissed": "fg_missed", "fieldGoalsBlocked": "fg_blocked",
    "extraPointsMade": "pat_made", "extraPointAttempts": "pat_att", "extraPointsMissed": "pat_missed",
    "extraPointsBlocked": "pat_blocked", "puntsBlocked": "pt_blocked", "puntsInside20": "pt_inside_20",
    "puntTouchbacks": "pt_touchback", "puntsFairCaught": "pt_fair_caught", "puntsReturned": "pt_returned",
    "puntReturnYardsAllowed": "pt_return_yards", "puntReturnTDAllowed": "pt_return_tds", "netPuntYards": "pt_net_yards",
}
EXTRA_GAME_FIELDS = {
    "passingEPA": "passing_epa", "passingCPOE": "passing_cpoe", "rushingEPA": "rushing_epa",
    "receivingEPA": "receiving_epa", "targetShare": "target_share", "airYardsShare": "air_yards_share",
    "fieldGoalLong": "fg_long", "puntLong": "pt_long", "fantasyPoints": "fantasy_points",
    "fantasyPointsPPR": "fantasy_points_ppr",
}
HISTORY_FIRST_SEASON = 2005  # Covers every regular-season year of the longest-tenured current player.
HISTORY_PATH = ROOT / "assets/data/player-history.json"


def verified_ssl_context():
    context = ssl.create_default_context()
    supplied_ca = Path("/usr/local/share/ca-certificates/environment-proxy-ca.crt")
    if supplied_ca.exists():
        context.load_verify_locations(cafile=str(supplied_ca))
    return context


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


LEADER_FIELDS = {
    "QB": ("passing_yards", "passing_tds"),
    "RB": ("rushing_yards", "rushing_tds"),
    "WR": ("receiving_yards", "receiving_tds"),
}
LEADER_LIMIT = 16


def collect_weekly_leaders(stats, leader_week):
    """Rank verified weekly values; missing yards or TDs never become zero.

    Callers pass only regular-season rows corroborated by final game scores.
    The UI presents five initially and can expand this bounded source list.
    """
    leaders = {}
    for position, (yards, touchdowns) in LEADER_FIELDS.items():
        rows = [row for row in stats if row["position"] == position and int(row["week"]) == leader_week
                and number(row.get(yards)) is not None and number(row.get(touchdowns)) is not None]
        rows.sort(key=lambda row: (-number(row[yards]), -number(row[touchdowns]), row["player_display_name"]))
        leaders[position] = [{"name": row["player_display_name"], "short": row["player_name"], "playerId": row["player_id"],
                              "position": position, "team": row["team"], "yards": number(row[yards]), "td": number(row[touchdowns])}
                             for row in rows[:LEADER_LIMIT]]
    return leaders


def archive_source_specs(season, player_ids):
    release = "https://github.com/nflverse/nflverse-data/releases/download/stats_player"
    return {f"nflverse_player_stats_{year}": {
                "url": f"{release}/stats_player_week_{year}.csv", "cache": f"stats{year}.csv",
                "required": False, "season": year, "playerIds": set(player_ids)}
            for year in range(HISTORY_FIRST_SEASON, season)}


def fetch_source(item, cache_dir):
    source_id, spec = item
    metadata = {"id": source_id, "url": spec["url"], "provider": spec.get("provider", "nflverse"), "required": spec["required"]}
    try:
        cache = Path(cache_dir) / spec["cache"] if cache_dir else None
        if cache and cache.exists():
            body = cache.read_bytes()
            retrieved = dt.datetime.fromtimestamp(cache.stat().st_mtime, UTC)
            cache_meta = cache.with_suffix(".meta.json")
            if cache_meta.exists():
                saved = json.loads(cache_meta.read_text())
                if saved.get("sha256") == hashlib.sha256(body).hexdigest():
                    retrieved = dt.datetime.fromisoformat(saved["retrievedAt"].replace("Z", "+00:00"))
                    metadata.update({key: saved[key] for key in ("httpStatus", "etag", "lastModified") if key in saved})
        else:
            request = urllib.request.Request(spec["url"], headers={"User-Agent": "ProjectDollarDataRefresh/1.0 public-data-audit"})
            with urllib.request.urlopen(request, timeout=75, context=verified_ssl_context()) as response:
                body = response.read()
                metadata["httpStatus"] = response.status
                metadata["etag"] = response.headers.get("ETag")
                metadata["lastModified"] = response.headers.get("Last-Modified")
            retrieved = dt.datetime.now(UTC)
        metadata.update({"retrievedAt": iso(retrieved), "status": "verified", "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
        if spec.get("format") == "json":
            rows = json.loads(body)
        elif spec.get("format") == "html":
            rows = body.decode("utf-8-sig")
        else:
            reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig")))
            player_ids = spec.get("playerIds")
            rows = [row for row in reader if not player_ids or row.get("player_id") in player_ids]
        if not rows:
            raise ValueError("Source contains no rows")
        if cache_dir and not (cache and cache.exists()):
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(body)
            cache.with_suffix(".meta.json").write_text(json.dumps(metadata))
        return source_id, rows, metadata
    except Exception as exc:
        metadata.update({"retrievedAt": iso(dt.datetime.now(UTC)), "status": "unavailable", "error": str(exc)})
        if spec["required"]:
            raise RuntimeError(f"Required source {source_id} unavailable: {exc}") from exc
        return source_id, [], metadata


def aggregate_stats(rows):
    values = {}
    for key, field in {**STAT_FIELDS, **EXTRA_COUNT_FIELDS}.items():
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
    values["offensiveTD"] = known_sum(values["rushingTD"], values["receivingTD"])
    values["touchdownsAccountedFor"] = known_sum(values["passingTD"], values["rushingTD"], values["receivingTD"])
    values["fieldGoalPct"] = ratio(values["fieldGoalsMade"] * 100 if values["fieldGoalsMade"] is not None else None, values["fieldGoalAttempts"])
    values["extraPointPct"] = ratio(values["extraPointsMade"] * 100 if values["extraPointsMade"] is not None else None, values["extraPointAttempts"])
    values["yardsPerPunt"] = ratio(values["puntYards"], values["punts"])
    values["netYardsPerPunt"] = ratio(values["netPuntYards"], values["punts"])
    if len(rows) == 1:
        values.update({key: number(rows[0].get(field)) for key, field in EXTRA_GAME_FIELDS.items()})
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


def normalized_name(value):
    words = re.sub(r"[^a-z0-9 ]", "", value.lower()).split()
    if words and words[-1] in ("jr", "sr", "ii", "iii", "iv"):
        words.pop()
    return "".join(words)


def parse_official_roster(document):
    """Absence is evidence only after validating a complete current team page."""
    if not isinstance(document, str) or not re.search(r"Pittsburgh\s+Steelers", document, re.I):
        raise ValueError("Official roster team identity missing")
    players, groups = [], []
    for match in re.finditer(r"<table\b[^>]*>(.*?)</table>", document, re.S | re.I):
        prefix = document[:match.start()]
        headings = re.findall(r'<span\b[^>]*class=["\'][^"\']*nfl-o-roster__title-status[^"\']*["\'][^>]*>(.*?)</span>', prefix, re.S | re.I)
        if not headings:
            continue
        group = html.unescape(re.sub(r"<[^>]+>", " ", headings[-1])).strip()
        content = match.group(1)
        headers = [html.unescape(re.sub(r"<[^>]+>", " ", cell)).strip() for cell in re.findall(r"<th\b[^>]*>(.*?)</th>", content, re.S | re.I)]
        if headers[:3] != ["Player", "#", "Pos"]:
            continue
        group_players = []
        for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", content, re.S | re.I):
            cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S | re.I)
            if not cells:
                continue
            if len(cells) < 8:
                raise ValueError("Official roster row incomplete")
            values = [" ".join(html.unescape(re.sub(r"<[^>]+>", " ", cell)).split()) for cell in cells]
            if not values[0] or not re.fullmatch(r"[A-Z/]{1,6}", values[2]):
                raise ValueError("Official roster identity/position invalid")
            jersey = int(values[1]) if re.fullmatch(r"\d{1,2}", values[1]) else None
            group_players.append({"name": values[0], "number": jersey, "position": values[2], "status": group})
        if group_players:
            groups.append({"name": group, "count": len(group_players)})
            players.extend(group_players)
    counts = {entry["name"]: entry["count"] for entry in groups}
    if not (60 <= len(players) <= 110 and 45 <= counts.get("Active", 0) <= 60 and counts.get("Practice Squad", 0) >= 5):
        raise ValueError("Official roster completeness threshold not met; no absence conclusions")
    if len({normalized_name(player["name"]) for player in players}) != len(players):
        raise ValueError("Official roster duplicate or ambiguous names")
    return {"players": players, "groups": groups, "complete": True}


def parse_espn_roster(document, season):
    if not isinstance(document, dict) or document.get("season", {}).get("year") != season:
        raise ValueError("ESPN roster season context differs")
    team = document.get("team", {})
    if str(team.get("id")) != "23" and team.get("abbreviation") != "PIT":
        raise ValueError("ESPN roster team context differs")
    groups = document.get("athletes", [])
    if not isinstance(groups, list) or not {"offense", "defense", "specialTeam"}.issubset({group.get("position") for group in groups}):
        raise ValueError("ESPN roster category schema incomplete")
    players = [{**player, "rosterGroup": group["position"]} for group in groups for player in group.get("items", [])]
    active = sum(player["rosterGroup"] in ("offense", "defense", "specialTeam") for player in players)
    if not (60 <= len(players) <= 110 and active >= 45 and len({str(player.get("id")) for player in players}) == len(players)):
        raise ValueError("ESPN roster completeness threshold not met")
    if any(not player.get("displayName") or not str(player.get("id", "")).isdigit() for player in players):
        raise ValueError("ESPN roster identity schema invalid")
    return {"players": players, "complete": True, "sourceTimestamp": document.get("timestamp"), "season": season}


def match_espn_player(raw_player, espn_players):
    birthday = raw_player.get("birth_date")
    espn_id = raw_player.get("espn_id")
    candidates = [player for player in espn_players if str(player["id"]) == str(espn_id)] if espn_id else []
    if not candidates:
        candidates = [player for player in espn_players if normalized_name(player["displayName"]) == normalized_name(raw_player["full_name"])]
    method = "ESPN ID or normalized exact name"
    if not candidates and birthday:
        surname = re.sub(r"\s+(Jr\.?|Sr\.?|III|II)$", "", raw_player["full_name"], flags=re.I).split()[-1].lower()
        candidates = [player for player in espn_players if str(player.get("dateOfBirth", ""))[:10] == birthday
                      and re.sub(r"\s+(Jr\.?|Sr\.?|III|II)$", "", player["displayName"], flags=re.I).split()[-1].lower() == surname
                      and str(player.get("jersey")) == str(number(raw_player.get("jersey_number")))]
        method = "Unique birth date, surname and jersey match"
    if len(candidates) != 1:
        return None, "No unambiguous matched ESPN identity"
    candidate = candidates[0]
    if birthday and candidate.get("dateOfBirth") and str(candidate["dateOfBirth"])[:10] != birthday:
        return None, "Conflicting identity birth date"
    return candidate, method


def match_official_player(raw_player, espn_player, official_players):
    names = {normalized_name(raw_player["full_name"])}
    if espn_player:
        names.add(normalized_name(espn_player["displayName"]))
    matched = [player for player in official_players if normalized_name(player["name"]) in names]
    return matched[0] if len(matched) == 1 else None


def position_families(position):
    lookup = {"DB": "DB", "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "DL": "DL", "DE": "DL", "DT": "DL",
              "OL": "OL", "C": "OL", "G": "OL", "OG": "OL", "T": "OL", "OT": "OL", "K": "K", "PK": "K",
              "RB": "RB", "FB": "RB"}
    return {lookup.get(value, value) for value in str(position or "").split("/") if value}


def roster_source_specs(season):
    return {"official_steelers_roster": {"url": "https://www.steelers.com/team/players-roster/", "cache": "official-steelers-roster.html",
                                           "format": "html", "provider": "Pittsburgh Steelers", "required": False},
            "espn_steelers_roster": {"url": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/pit/roster",
                                      "cache": f"espn-steelers-roster{season}.json", "format": "json", "provider": "ESPN", "required": False}}


def apply_roster_verification(data, raw_roster, payloads, metadata, now, previous=None):
    primary_hash = next(source["sha256"] for source in data["sources"] if source["id"] == "nflverse_roster")
    source_ids = ("official_steelers_roster", "espn_steelers_roster")
    current_context = data["season"] == (now.year - 1 if now.month < 3 else now.year)
    if not current_context:
        for source_id in source_ids:
            metadata[source_id] = {**metadata.get(source_id, {"id": source_id, "required": False}), "status": "unavailable",
                                   "error": "Current public roster cannot establish historical-season membership"}
    parsed = {}
    for source_id, parser in [(source_ids[0], parse_official_roster), (source_ids[1], lambda payload: parse_espn_roster(payload, data["season"]))]:
        try:
            if metadata.get(source_id, {}).get("status") != "verified":
                raise ValueError("Optional roster source unavailable")
            parsed[source_id] = parser(payloads[source_id])
        except (ValueError, KeyError, TypeError) as exc:
            metadata[source_id] = {**metadata.get(source_id, {"id": source_id, "required": False}), "status": "unavailable", "error": str(exc)}
    pair_available = len(parsed) == 2
    prior_players = {player["id"]: player for player in (previous or {}).get("roster", [])}
    previous_sources = {source["id"]: source for source in (previous or {}).get("sources", [])}
    raw_by_id = {player["gsis_id"]: player for player in raw_roster
                 if player.get("team") == "PIT" and player.get("season") == str(data["season"]) and player.get("status") != "CUT"}
    retained_sources = {}
    for player in data["roster"]:
        prior = prior_players.get(player["id"], {}).get("rosterVerification")
        if current_context and not pair_available and prior and prior.get("primaryRosterSha256") == primary_hash and prior["status"] != "unavailable":
            verification = json.loads(json.dumps(prior))
            verification.update({"retained": True, "stale": True, "lastAttemptAt": iso(now),
                                 "note": "Earlier source verification retained because optional source access failed and the primary roster content is unchanged. Original evidence, source times and disagreements are preserved; the check is stale."})
            player["rosterVerification"] = verification
            for source_id in prior["sourceIds"]:
                if source_id in previous_sources:
                    retained_sources[source_id] = {**previous_sources[source_id], "retained": True,
                                                  "lastAttempt": metadata.get(source_id, {"status": "not attempted", "retrievedAt": iso(now)})}
            continue
        raw = raw_by_id[player["id"]]
        espn_player, join_method = match_espn_player(raw, parsed.get(source_ids[1], {}).get("players", []))
        official = match_official_player(raw, espn_player, parsed.get(source_ids[0], {}).get("players", []))
        used = [source_id for source_id in source_ids if source_id in parsed]
        official_member = bool(official) if source_ids[0] in parsed and pair_available else None
        espn_member = bool(espn_player) if source_ids[1] in parsed else None
        other_team = None
        athlete_source_id = f"espn_athlete_{raw.get('espn_id')}"
        athlete = payloads.get(athlete_source_id, {}).get("athlete", {}) if isinstance(payloads.get(athlete_source_id), dict) else {}
        if not official_member and not espn_member and athlete and metadata.get(athlete_source_id, {}).get("status") == "verified":
            birth_matches = not raw.get("birth_date") or not athlete.get("dateOfBirth") or str(athlete["dateOfBirth"])[:10] == raw["birth_date"]
            same_identity = str(athlete.get("id")) == str(raw.get("espn_id")) and normalized_name(athlete.get("displayName", "")) == normalized_name(raw["full_name"]) and birth_matches
            athlete_season = payloads[athlete_source_id].get("season", {}).get("year")
            if same_identity and athlete_season == data["season"] and athlete.get("team", {}).get("abbreviation"):
                used.append(athlete_source_id)
                team = athlete["team"]
                if team["abbreviation"] != "PIT":
                    other_team = {"abbr": team["abbreviation"], "name": team.get("displayName"), "athleteId": str(athlete["id"]), "sourceId": athlete_source_id}
        issues = []
        def issue(field, primary, official_value, espn_value, note):
            issues.append({"field": field, "primary": primary, "official": official_value, "espn": espn_value, "note": note})
        if official_member is False:
            issue("membership", "PIT", "No matched entry in complete current roster", "PIT" if espn_member else other_team["abbr"] if other_team else "No matched roster entry",
                  "Current official and primary retained-roster membership differ; raw primary record and statistics remain preserved.")
        official_status = official["status"] if official else None
        if official_status:
            group = "Active" if official_status == "Active" else "Practice squad" if official_status.startswith("Practice Squad") else "Reserve" if official_status.startswith("Reserve/") else None
            if group and group != player["rosterStatus"]:
                issue("rosterStatus", player["rosterStatus"], official_status, espn_player.get("rosterGroup") if espn_player else None,
                      "Official current category differs from the primary release; categories retain their source wording.")
        espn_position = espn_player.get("position", {}).get("abbreviation") if espn_player else None
        positions = [position for position in [player["position"], official.get("position") if official else None, espn_position] if position]
        if positions and not set.intersection(*(position_families(position) for position in positions)):
            issue("position", player["position"], official.get("position") if official else None, espn_position,
                  "Providers report different position families; broad DB/CB, DL/DT, OL/C, RB/FB and K/PK labels alone are not conflicts.")
        official_number = official.get("number") if official else None
        if official_number is not None and number(raw.get("jersey_number")) is not None and official_number != number(raw["jersey_number"]):
            issue("jersey", player["number"], official_number, espn_player.get("jersey") if espn_player else None,
                  "Verified current official jersey differs from the primary release; a missing ESPN jersey is unavailable, not a contradictory number.")
        verified_sources = [metadata[source_id] for source_id in used]
        verification = {"status": "unavailable" if not pair_available else "disputed" if issues else "confirmed", "primaryRosterSha256": primary_hash,
                        "checkedAt": iso(now), "retrievedAt": min((source["retrievedAt"] for source in verified_sources), default=None),
                        "sourceIds": used, "sourceHashes": {source["id"]: source["sha256"] for source in verified_sources},
                        "retained": False, "stale": False, "officialCurrentMembership": official_member, "espnCurrentMembership": espn_member,
                        "officialRosterStatus": official_status, "officialNumber": official_number, "officialPosition": official.get("position") if official else None,
                        "espnRosterStatus": espn_player.get("rosterGroup") if espn_player else None, "espnPosition": espn_position,
                        "reportedOtherTeam": other_team, "issues": issues,
                        "note": "Optional source comparison unavailable; no primary data replaced." if not pair_available else "Source disagreements are explicit; primary retained records and all historical statistics remain intact." if issues else "Current official and ESPN roster identity compared; source label granularity is preserved.",
                        "evidence": {"officialName": official.get("name") if official else None,
                                     "espnName": espn_player.get("displayName") if espn_player else athlete.get("displayName") if other_team else None,
                                     "espnId": str(espn_player["id"]) if espn_player else str(athlete["id"]) if other_team else None,
                                     "identityJoinMethod": "Published ESPN ID and normalized exact athlete name; birth date compared only when exposed" if other_team else join_method}}
        player["rosterVerification"] = verification
    metadata.update(retained_sources)
    data["sources"].extend(source for source_id, source in metadata.items() if source_id not in {entry["id"] for entry in data["sources"]})
    verifications = [player["rosterVerification"] for player in data["roster"]]
    verification_sources = sorted({source_id for verification in verifications for source_id in verification["sourceIds"]})
    for player in data["roster"]:
        verification = player["rosterVerification"]
        for entry in verification["issues"]:
            data["disagreements"].append({"playerId": player["id"], "name": player["name"], **entry, "sourceIds": verification["sourceIds"],
                                          "checkedAt": verification["checkedAt"], "retained": verification["retained"],
                                          "action": "Primary record preserved; source conflict explicitly flagged for current-roster presentation."})
    state = "unavailable" if all(entry["status"] == "unavailable" for entry in verifications) else "partial" if any(entry["status"] != "confirmed" or entry["stale"] for entry in verifications) else "verified"
    data["provenance"]["rosterVerification"] = {"status": state, "sourceIds": verification_sources, "season": data["season"],
                                                 "note": "Optional complete official Steelers and ESPN rosters cross-checked by identity. Corroborated departure requires both rosters to omit the player and a matching ESPN athlete to report another team. Missing optional sources retain prior flags only for the identical primary roster hash. No primary or historical fields are overwritten."}
    data["provenance"]["crossChecks"].update({"status": "partial", "sourceIds": sorted(set(data["provenance"]["crossChecks"]["sourceIds"] + verification_sources)),
                                               "note": "Current roster cross-checks use optional official Steelers and ESPN public sources with explicit disagreements/availability. nflverse depth is ESPN-derived, so this is not independent depth-provider confirmation. Historical advanced statistics remain nflverse-sourced; no second-provider verification is claimed for those fields."})
    return {"status": state, "sourceIds": verification_sources, "confirmed": sum(entry["status"] == "confirmed" for entry in verifications),
            "disputed": sum(entry["status"] == "disputed" for entry in verifications), "unavailable": sum(entry["status"] == "unavailable" for entry in verifications),
            "retained": sum(entry["retained"] for entry in verifications), "officialRosterCount": len(parsed.get(source_ids[0], {}).get("players", [])),
            "espnRosterCount": len(parsed.get(source_ids[1], {}).get("players", []))}


def refresh_roster_verification(data, raw_roster, now, cache_dir=None, previous=None):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda item: fetch_source(item, cache_dir), roster_source_specs(data["season"]).items()))
    payloads = {source_id: value for source_id, value, _ in results}
    metadata = {source_id: source for source_id, _, source in results}
    try:
        official = parse_official_roster(payloads["official_steelers_roster"])
        espn = parse_espn_roster(payloads["espn_steelers_roster"], data["season"])
        specs = {}
        for raw in raw_roster:
            if raw.get("team") != "PIT" or raw["gsis_id"] not in {player["id"] for player in data["roster"]}:
                continue
            espn_player, _ = match_espn_player(raw, espn["players"])
            if not espn_player and not match_official_player(raw, espn_player, official["players"]) and re.fullmatch(r"\d+", raw.get("espn_id") or ""):
                athlete_id = raw["espn_id"]
                specs[f"espn_athlete_{athlete_id}"] = {"url": f"https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{athlete_id}",
                                                     "cache": f"espn-athlete-{athlete_id}.json", "format": "json", "provider": "ESPN", "required": False}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda item: fetch_source(item, cache_dir), specs.items()))
        payloads.update({source_id: value for source_id, value, _ in results})
        metadata.update({source_id: source for source_id, _, source in results})
    except (ValueError, KeyError, TypeError):
        pass  # apply_roster_verification records unavailable parser/source state.
    return apply_roster_verification(data, raw_roster, payloads, metadata, dt.datetime.now(UTC), previous)


def canonical_team(abbr):
    """Join franchise histories while preserving original club labels on games."""
    return {"OAK": "LV", "SD": "LAC", "STL": "LA", "LAR": "LA", "JAC": "JAX", "WSH": "WAS"}.get(abbr, abbr)


def current_history_source_hashes(metadata):
    return {key: metadata[key]["sha256"] for key in ("nflverse_games", "nflverse_player_stats", "nflverse_roster")}


def history_game(row, game, source, schedule_source):
    team, opponent = row["team"], row["opponent_team"]
    is_home = canonical_team(team) == canonical_team(game["home_team"])
    team_score = number(game["home_score"] if is_home else game["away_score"])
    opponent_score = number(game["away_score"] if is_home else game["home_score"])
    context_fields = {"player_id", "player_name", "player_display_name", "position", "position_group", "headshot_url",
                      "season", "week", "season_type", "game_id", "team", "opponent_team"}
    raw_stats, raw_lists = {}, {}
    for field, value in row.items():
        if field in context_fields:
            continue
        if field.endswith("_list"):
            raw_lists[field] = str(value) if value is not None and str(value).strip() else None
            continue
        try:
            raw_stats[field] = number(value)
        except (ValueError, TypeError):
            # Preserve legitimate provider list cells without coercing a list
            # of kick distances into a single invented numeric statistic.
            raw_lists[field] = value or None
    time = kickoff(game)
    return {"playerId": row["player_id"], "gameId": row["game_id"], "season": int(row["season"]),
            "week": int(row["week"]), "seasonType": "REG", "date": game["gameday"],
            "kickoffUtc": iso(time) if time else None, "team": team, "teamCanonical": canonical_team(team),
            "opponent": canonical_team(opponent), "opponentSourceAbbr": opponent,
            "position": row.get("position") or None, "homeAway": "home" if is_home else "away",
            "result": "W" if team_score > opponent_score else "L" if team_score < opponent_score else "T",
            "teamScore": team_score, "opponentScore": opponent_score, "stats": aggregate_stats([row]),
            "rawStats": raw_stats, "rawLists": raw_lists, "statsSourceId": source["id"],
            "sourceIds": [source["id"], "nflverse_games"], "retrievedAt": source["retrievedAt"],
            "scheduleRetrievedAt": schedule_source["retrievedAt"]}


def build_player_history(roster, schedule, datasets, metadata, now, season, cached=None):
    """Publish only corroborated game rows; never infer an appearance from absence.

    Archived tables are reduced to the five most recent rows for each scheduled
    opponent plus the five most recent rows overall. Each player's pool dedupes
    overlapping games. A validated prior bundle supplies archived rows between
    roster/season changes, retaining their original retrieval timestamps.
    """
    player_ids = {player["id"] for player in roster}
    opponents = sorted({canonical_team(game["away_team"] if game["home_team"] == "PIT" else game["home_team"])
                        for game in schedule})
    sources = dict(metadata)
    games_by_player = collections.defaultdict(dict)
    disagreements = []
    cached_exclusions = set()
    if cached:
        for source in cached["sources"]:
            if source["id"].startswith("nflverse_player_stats_"):
                sources[source["id"]] = source
    final_games = {game["game_id"]: game for game in datasets["nflverse_games"]
                   if game["game_type"] == "REG" and game.get("away_score") and game.get("home_score")
                   and ((kickoff(game) is not None and kickoff(game) <= now)
                        or (kickoff(game) is None and game["gameday"] < now.date().isoformat()))}
    if cached:
        for player_id, player in cached["players"].items():
            if player_id not in player_ids:
                continue
            for game_id, old_game in player["games"].items():
                if old_game["season"] >= season:
                    continue
                game = final_games.get(game_id)
                source = sources.get(old_game["statsSourceId"])
                if (not game or not source or source["status"] != "verified"
                        or {canonical_team(old_game["team"]), old_game["opponent"]} != {canonical_team(game["home_team"]), canonical_team(game["away_team"])}
                        or old_game["season"] != int(game["season"]) or old_game["week"] != int(game["week"])):
                    cached_exclusions.add(player_id)
                    disagreements.append({"playerId": player_id, "gameId": game_id, "sourceId": old_game["statsSourceId"],
                                          "issue": "Cached historical row no longer joins a verified completed game", "action": "excluded; archival backfill recommended"})
                    continue
                raw_row = {**old_game["rawStats"], **old_game.get("rawLists", {}), "player_id": player_id,
                           "game_id": game_id, "season": old_game["season"], "week": old_game["week"], "season_type": "REG",
                           "team": old_game["team"], "opponent_team": old_game["opponentSourceAbbr"], "position": old_game.get("position")}
                games_by_player[player_id][game_id] = history_game(raw_row, game, source, sources["nflverse_games"])
    required_columns = set(STAT_FIELDS.values()) | {"season", "season_type", "week", "game_id", "team", "opponent_team", "player_id"}
    for source_id, rows in datasets.items():
        if not source_id.startswith("nflverse_player_stats") or not rows:
            continue
        missing_columns = required_columns - set(rows[0])
        if missing_columns:
            if source_id == "nflverse_player_stats":
                raise ValueError(f"Current history source missing required columns: {sorted(missing_columns)}")
            sources[source_id] = {**sources[source_id], "status": "unavailable",
                                  "error": f"Archive schema missing required columns: {sorted(missing_columns)}"}
            continue
        conflicted = set()
        for row in rows:
            if row.get("player_id") not in player_ids or row.get("season_type") != "REG":
                continue
            game = final_games.get(row.get("game_id"))
            if not game:
                disagreements.append({"playerId": row["player_id"], "gameId": row.get("game_id"),
                                      "sourceId": source_id, "issue": "Statistics lack a verified completed regular-season game", "action": "excluded"})
                continue
            joined_clubs = {canonical_team(row["team"]), canonical_team(row["opponent_team"])}
            schedule_clubs = {canonical_team(game["home_team"]), canonical_team(game["away_team"])}
            if (joined_clubs != schedule_clubs or int(row["season"]) != int(game["season"])
                    or int(row["week"]) != int(game["week"])):
                disagreements.append({"playerId": row["player_id"], "gameId": row["game_id"], "sourceId": source_id,
                                      "issue": "Statistical and schedule identity/context disagree", "action": "excluded"})
                continue
            key = (row["player_id"], row["game_id"])
            if key in conflicted:
                continue
            normalized = history_game(row, game, sources[source_id], sources["nflverse_games"])
            previous = games_by_player[row["player_id"]].get(row["game_id"])
            if previous and previous["statsSourceId"] == source_id and previous["rawStats"] != normalized["rawStats"]:
                del games_by_player[row["player_id"]][row["game_id"]]
                conflicted.add(key)
                disagreements.append({"playerId": row["player_id"], "gameId": row["game_id"], "sourceId": source_id,
                                      "issue": "Conflicting duplicated player/game statistics", "action": "both rows excluded"})
            else:
                games_by_player[row["player_id"]][row["game_id"]] = normalized
    expected_seasons = list(range(HISTORY_FIRST_SEASON, season + 1))
    available = [year for year in expected_seasons if sources.get("nflverse_player_stats" if year == season else f"nflverse_player_stats_{year}", {}).get("status") == "verified"]
    unavailable = sorted(set(expected_seasons) - set(available))
    coverage_status = "partial" if unavailable or cached_exclusions else "verified"
    players = {}
    for player in roster:
        ordered = sorted(games_by_player[player["id"]].values(), key=lambda game: (game["date"], game.get("kickoffUtc") or "", game["gameId"]), reverse=True)
        last5 = [game["gameId"] for game in ordered[:5]]
        by_opponent = {}
        pool_ids = set(last5)
        for opponent in opponents:
            matches = [game["gameId"] for game in ordered if game["opponent"] == opponent][:5]
            pool_ids.update(matches)
            status = "partial" if unavailable or player["id"] in cached_exclusions else "verified" if matches else "unavailable"
            note = f"{len(matches)} recorded completed regular-season game(s) against {opponent}; prior teams included."
            if unavailable:
                note += f" Archive coverage incomplete for seasons {', '.join(map(str, unavailable))}; the latest five cannot be guaranteed."
            elif not matches:
                note += " No provider statistical rows available in the verified season range; this does not establish zero appearances."
            if player["id"] in cached_exclusions:
                note += " Cached rows were withdrawn after source disagreement; archive backfill is required to guarantee the latest five."
            by_opponent[opponent] = {"gameIds": matches, "status": status, "note": note}
        note = f"{len(last5)} most recent recorded regular-season game(s), across verified seasons; prior teams included."
        if unavailable:
            note += f" Archive coverage incomplete for seasons {', '.join(map(str, unavailable))}; latest-five order may be partial."
        if not last5:
            note += " No verified statistical row; absence is not proof of no appearance."
        if player["id"] in cached_exclusions:
            note += " Cached rows were withdrawn after source disagreement; archive backfill is required."
        players[player["id"]] = {"id": player["id"], "status": "partial" if unavailable or player["id"] in cached_exclusions else "verified" if last5 else "unavailable",
                                 "note": note, "last5": last5, "byOpponent": by_opponent,
                                 "games": {game["gameId"]: game for game in ordered if game["gameId"] in pool_ids}}
    history_sources = [source for key, source in sources.items() if key in ("nflverse_games", "nflverse_roster") or key.startswith("nflverse_player_stats")]
    retrieved = min(source["retrievedAt"] for source in history_sources if source["status"] == "verified")
    return {"schemaVersion": 1, "season": season, "generatedAt": iso(now), "retrievedAt": retrieved, "scope": "REG",
            "coverage": {"firstSeason": HISTORY_FIRST_SEASON, "lastSeason": season, "availableSeasons": available,
                         "unavailableSeasons": unavailable, "status": coverage_status, "cachedRowsNeedingBackfill": len(cached_exclusions)},
            "currentSourceHashes": current_history_source_hashes(metadata), "opponents": opponents,
            "players": players, "sources": history_sources, "disagreements": disagreements,
            "note": "Completed regular-season provider statistical rows only. Lists are not padded; postseason and confirmed snap/appearance counts are outside this dataset."}


def validate_history(history, current=None):
    assert history["schemaVersion"] == 1 and history["scope"] == "REG"
    source_ids = {source["id"] for source in history["sources"]}
    for player_id, player in history["players"].items():
        assert player["id"] == player_id
        assert len(player["last5"]) <= 5 and len(set(player["last5"])) == len(player["last5"])
        groups = [player["last5"]] + [entry["gameIds"] for entry in player["byOpponent"].values()]
        for group in groups:
            assert len(group) <= 5 and len(set(group)) == len(group)
            assert all(game_id in player["games"] for game_id in group)
            assert [player["games"][game_id]["date"] for game_id in group] == sorted([player["games"][game_id]["date"] for game_id in group], reverse=True)
        for opponent, entry in player["byOpponent"].items():
            assert all(player["games"][game_id]["opponent"] == opponent for game_id in entry["gameIds"])
            assert entry["status"] in ("verified", "partial", "unavailable") and entry["note"]
        for game in player["games"].values():
            assert game["playerId"] == player_id and game["seasonType"] == "REG"
            assert game["season"] in history["coverage"]["availableSeasons"]
            assert all(source_id in source_ids for source_id in game["sourceIds"])
            assert game["retrievedAt"] and game["scheduleRetrievedAt"]
            assert len(game["stats"]) >= len(STAT_FIELDS)
            assert game["result"] in ("W", "L", "T") and game["homeAway"] in ("home", "away")
    if current:
        assert set(history["players"]) == {player["id"] for player in current["roster"]}
        metadata = {source["id"]: source for source in current["sources"]}
        assert history["currentSourceHashes"] == current_history_source_hashes(metadata), "History/current source versions disagree"
        assert history["season"] == current["season"]
    json.dumps(history, allow_nan=False)
    return {"status": "passed", "playerCount": len(history["players"]),
            "gameRowCount": sum(len(player["games"]) for player in history["players"].values()), "coverage": history["coverage"]}


def build_opponent_matchup(opponent, raw_games, all_games, stats, teams, records, now, season, retrieved_at):
    finished = [game for game in raw_games if game.get("away_score") and game.get("home_score")]
    opponent_games = [game for game in finished if opponent in (game["away_team"], game["home_team"])]
    covered_ids = {row["game_id"] for row in stats if row["opponent_team"] == opponent and row["position"] in ("QB", "RB", "FB", "WR", "TE")}
    covered_games = [game for game in opponent_games if game["game_id"] in covered_ids]
    through_week = max((int(game["week"]) for game in covered_games), default=0)
    allowances = {}
    for position in ("QB", "RB", "WR", "TE"):
        rows = [row for row in stats if row["opponent_team"] == opponent and (row["position"] == position or (position == "RB" and row["position"] == "FB"))]
        sums, count = aggregate_stats(rows), len(covered_games)
        td = known_sum(sums["passingTD"], sums["rushingTD"], sums["receivingTD"])
        allowances[position] = {"status": "derived" if rows and count else "unavailable", "games": count,
                                "throughWeek": through_week, "coverageGameIds": sorted(covered_ids),
                                "passingYardsAllowed": sums["passingYards"], "rushingYardsAllowed": sums["rushingYards"],
                                "receivingYardsAllowed": sums["receivingYards"], "receptionsAllowed": sums["receptions"], "tdAllowed": td,
                                "passingYardsAllowedPerGame": ratio(sums["passingYards"], count),
                                "rushingYardsAllowedPerGame": ratio(sums["rushingYards"], count),
                                "receivingYardsAllowedPerGame": ratio(sums["receivingYards"], count),
                                "receptionsAllowedPerGame": ratio(sums["receptions"], count), "tdAllowedPerGame": ratio(td, count),
                                "note": "Position totals from verified player-stat rows. All positions share only completed opponent games with verified offensive-stat coverage; missing positions are unavailable."}
    historical = sorted([game for game in all_games if {canonical_team(game["home_team"]), canonical_team(game["away_team"])} == {"PIT", opponent}
                         and game.get("away_score") and game.get("home_score") and game["gameday"] < now.date().isoformat()],
                        key=lambda game: (game["gameday"], game["game_id"]), reverse=True)[:5]
    history = [normalize_game(game, {}) for game in historical]
    return {"opponent": opponent, "opponentRecord": records.get(opponent), "last5": history,
            "opponentLast5": [normalize_game(game, standings(teams, raw_games, max(0, int(game["week"]) - 1))[0])
                              for game in sorted(opponent_games, key=lambda game: (game["gameday"], game["game_id"]), reverse=True)[:5]],
            "allowances": allowances, "weather": {"status": "unavailable", "note": "No verified forecast feed available; game metadata preserves recorded conditions separately."},
            "travel": {"status": "unavailable", "note": "Team travel itinerary not publicly verified. Home/away, venue and verified rest days remain available."},
            "historicalPrices": [{"gameId": game["id"], "date": game["gameday"], **game["odds"]} for game in history],
            "context": {"season": season, "throughWeek": through_week, "coverageGameIds": sorted(covered_ids),
                        "sourceIds": ["nflverse_games", "nflverse_player_stats"], "retrievedAt": retrieved_at,
                        "note": "Current verified season allowance context, independent of selected historical fixture week; not a reconstruction of what was known before that week."}}


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
        last5 = [{"season": requested_season, "team": row["team"], "week": int(row["week"]), "opponent": row["opponent_team"], "date": game_by_id.get(row["game_id"], {}).get("gameday"),
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
        leaders = collect_weekly_leaders(stats, leader_week)
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
        "weeklyLeaders": {"status": "verified", "sourceIds": ["nflverse_player_stats"], "season": requested_season, "throughWeek": stats_week,
                          "limit": LEADER_LIMIT,
                          "positions": {position: {"yardsField": fields[0], "touchdownsField": fields[1]} for position, fields in LEADER_FIELDS.items()},
                          "note": "Up to 16 quarterbacks by passing yards, running backs by rushing yards, and wide receivers by receiving yards. Same-position touchdown totals break tied yards, then name. Only verified regular-season rows corroborated by final game scores are included; missing yard/TD cells remain unavailable. Previous available week; future selected weeks explicitly retain latest verified leader week."},
        "roster": {"status": "verified", "sourceIds": ["nflverse_roster"], "season": requested_season, "week": current_week, "note": "Current retained roster: active, reserve and practice squad; cut players excluded."},
        "playerStats": {"status": "derived" if stats else "unavailable", "sourceIds": ["nflverse_player_stats"], "season": requested_season, "throughWeek": stats_week, "note": "Summed regular-season weekly statistics, gated to corroborated final games. Missing source row or numeric cell is unavailable, not assumed zero; missing required source columns reject refresh. games means games with a statistics row, not confirmed appearances or snaps. NFL passer rating calculated from verified attempts/completions/yards/TD/INT."},
        "teamStats": {"status": "derived" if game_count else "unavailable", "sourceIds": ["nflverse_games", "nflverse_player_stats"], "season": requested_season, "throughWeek": pit_stats_week, "coverageGameIds": sorted(pit_stat_game_ids), "note": "Gross passing yards displayed separately; total yards uses passing minus sack yards plus rushing. Per-game denominators use only completed Steelers games with verified team-stat rows; scores without released statistics are excluded from these totals."},
        "schedule": {"status": "verified", "sourceIds": ["nflverse_games"], "season": requested_season, "note": "Kickoff converted from America/New_York with daylight saving. Fixture records are entering each week; future records reflect latest completed week, not predictions."},
        "injuries": {"status": "verified" if injuries else "unavailable", "sourceIds": ["nflverse_injuries"], "season": requested_season, "week": current_week, "note": "Practice participation and report status are separate. Blank report status is unavailable; absent player does not mean healthy. Confirmed game-day inactive list unavailable."},
        "depthChart": {"status": "verified" if depth_rows else "unavailable", "sourceIds": ["nflverse_depth"], "season": requested_season, "sourceTimestamp": depth_timestamp, "note": "Latest published ESPN-derived depth order, not a confirmed starter designation."},
        "opponentAllowances": {"status": "derived" if allowance_games else "unavailable", "sourceIds": ["nflverse_player_stats", "nflverse_games"], "season": requested_season, "throughWeek": allowance_week, "coverageGameIds": sorted(opponent_stat_game_ids), "opponent": opponent, "note": "Opponent player-stat totals grouped by QB/RB/WR/TE; every position uses the same completed opponent games with verified offensive-stat coverage. New final scores do not dilute unreleased stat totals; absent position rows are unavailable."},
        "historicalMatchups": {"status": "verified" if historical else "unavailable", "sourceIds": ["nflverse_games"], "note": "Most recent five completed meetings; each game carries its original season/week."},
        "weeklyOpponentResearch": {"status": "derived", "sourceIds": ["nflverse_games", "nflverse_player_stats"], "season": requested_season,
                                   "note": "Every scheduled opponent has a separate current-season allowance, result history and game context. Current verified season statistics are not retroactive pre-game estimates."},
        "historicalPrices": {"status": "verified" if any(g["odds"]["status"] == "verified" for g in historical_games) else "unavailable", "sourceIds": ["nflverse_games"], "note": "Archival moneylines preserved exactly. Bookmaker and capture time are not supplied by source; cannot identify exact previous pre-game price."},
        "exactPreGamePrices": {"status": "unavailable", "sourceIds": [], "note": "Archived dataset moneylines are available, but no bookmaker identity or capture time verifies an exact previous pre-game head-to-head price."},
        "weatherForecast": {"status": "unavailable", "sourceIds": [], "note": "No accessible verified forecast feed in this environment. NOAA API blocked403 during audit. Historical recorded conditions remain sourced game data."},
        "travel": {"status": "unavailable", "sourceIds": [], "note": "Team travel itinerary not publicly verified. Home/away, venue and rest days are available from the schedule."},
        "crossChecks": {"status": "partial", "sourceIds": ["nflverse_games", "nflverse_player_stats", "nflverse_roster", "nflverse_depth", "nflverse_injuries"], "note": "Internal dataset consistency validated. Independent official/ESPN API retrieval blocked403; no claim of independently verified official standings."},
    }
    matchups_by_opponent = {abbr: build_opponent_matchup(abbr, raw_games, all_games, stats, teams, all_records, now, requested_season, iso(actual_retrieval))
                           for abbr in sorted({game["away_team"] if game["home_team"] == "PIT" else game["home_team"] for game in schedule})}
    return {"schemaVersion": 1, "retrievedAt": iso(actual_retrieval), "generatedAt": iso(now), "season": requested_season, "currentWeek": current_week, "throughWeek": through_week,
            "context": {"label": f"{requested_season} regular season · Week {current_week}", "requestedSeason": requested_season, "availableSeason": requested_season,
                        "isCurrent": bool(upcoming) and now < actual_retrieval + dt.timedelta(hours=24),
                        "isStale": now > actual_retrieval + dt.timedelta(hours=6), "refreshAfter": iso(actual_retrieval + dt.timedelta(hours=6)),
                        "refreshGameKickoffsUtc": sorted(iso(time) for game in raw_games if (time := kickoff(game))),
                        "freshness": "Verified cached snapshot; not a live feed. Age uses the oldest required source retrieval, not regeneration time.",
                        "statsThroughWeek": stats_week, "last5Note": "Only played games are shown; no synthetic results pad the last-five lists"},
            "teams": list(teams.values()), "teamNames": {abbr: team["name"] for abbr, team in teams.items()}, "weeks": weeks,
            "roster": normalized_roster, "steelers": {"record": all_records["PIT"], "schedule": schedule, "last5": list(reversed(pit_final))[:5],
                     "teamStats": team_stats, "upcomingGame": next_pit, "injuries": list(injury_by_id.values()),
                     "depthChart": [{"name": r["player_name"], "playerId": r["gsis_id"] or None, "espnId": r["espn_id"] or None,
                                     "position": r["pos_abb"], "rank": number(r["pos_rank"]), "unit": r["pos_grp"], "sourceTimestamp": r["dt"]} for r in depth_rows],
                     "matchupsByOpponent": matchups_by_opponent,
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
    source_map = {source["id"]: source for source in data["sources"]}
    assert all(source_id in source_ids for group in data["provenance"].values() for source_id in group["sourceIds"])
    for player in data["roster"]:
        verification = player.get("rosterVerification")
        if not verification:
            continue
        assert verification["status"] in ("confirmed", "disputed", "unavailable")
        assert verification["primaryRosterSha256"] == source_map["nflverse_roster"]["sha256"]
        assert verification["officialCurrentMembership"] in (True, False, None)
        assert verification["espnCurrentMembership"] in (True, False, None)
        assert len(set(verification["sourceIds"])) == len(verification["sourceIds"])
        assert set(verification["sourceIds"]) == set(verification.get("sourceHashes", {}))
        if verification["status"] in ("confirmed", "disputed"):
            assert verification["checkedAt"] and verification["retrievedAt"] and verification["sourceIds"]
        for source_id, content_hash in verification.get("sourceHashes", {}).items():
            assert source_id in source_map and source_map[source_id]["sha256"] == content_hash
            assert source_map[source_id]["status"] == "verified", "Roster verification source is unavailable"
            assert source_map[source_id].get("retrievedAt") and source_map[source_id].get("url")
            assert source_map[source_id]["retrievedAt"] <= verification["checkedAt"], "Roster evidence was retrieved after its verification"
        if verification.get("reportedOtherTeam"):
            assert verification["reportedOtherTeam"]["sourceId"] in verification["sourceIds"]
            assert verification["reportedOtherTeam"]["sourceId"] == f"espn_athlete_{verification['reportedOtherTeam']['athleteId']}"
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


def cached_player_history(season, roster, schedule, force=False):
    if force or not HISTORY_PATH.exists():
        return None
    try:
        previous = json.loads((ROOT / "assets/data/current.json").read_text())
        expected_hash = previous.get("playerHistory", {}).get("sha256")
        body = HISTORY_PATH.read_bytes()
        if not expected_hash or hashlib.sha256(body).hexdigest() != expected_hash:
            return None
        history = json.loads(body)
        validate_history(history)
        ids = {player["id"] for player in roster}
        opponents = {canonical_team(game["away_team"] if game["home_team"] == "PIT" else game["home_team"]) for game in schedule}
        if history["season"] != season or not ids.issubset(history["players"]) or not opponents.issubset(history["opponents"]):
            return None
        # Optional unavailable archives are retried by an explicit historical
        # refresh; ordinary source-driven updates preserve honest partial data.
        return history
    except (OSError, ValueError, KeyError, AssertionError, TypeError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, help="Requested NFL season; defaults to current year, previous year in Jan/Feb")
    parser.add_argument("--cache-dir", help="Use already-retrieved audit CSVs with their original filesystem retrieval timestamps")
    parser.add_argument("--refresh-history", action="store_true", help="Re-fetch archived seasons to backfill or verify historical corrections")
    parser.add_argument("--check", action="store_true", help="Validate saved snapshot without a network request")
    args = parser.parse_args()
    if args.check:
        data = json.loads((ROOT / "assets/data/current.json").read_text())
        provenance = json.loads((ROOT / "assets/data/provenance.json").read_text())
        canonical_hash = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        assert canonical_hash == provenance["snapshotSha256CanonicalJson"], "Saved snapshot differs from its provenance manifest"
        history_checks = None
        if data.get("playerHistory"):
            body = HISTORY_PATH.read_bytes()
            assert hashlib.sha256(body).hexdigest() == data["playerHistory"]["sha256"], "Saved player history differs from current-snapshot checksum"
            history_checks = validate_history(json.loads(body), data)
            assert provenance.get("playerHistorySha256") == data["playerHistory"]["sha256"], "History provenance checksum differs"
        print(json.dumps({**validate(data), "provenanceHash": "passed", "playerHistory": history_checks}, indent=2))
        return
    now = dt.datetime.now(UTC)
    season = args.season or (now.year - 1 if now.month < 3 else now.year)
    try:
        previous = json.loads((ROOT / "assets/data/current.json").read_text())
    except (OSError, ValueError):
        previous = None
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda item: fetch_source(item, args.cache_dir), source_specs(season).items()))
    datasets = {source_id: rows for source_id, rows, _ in results}
    metadata = {source_id: meta for source_id, _, meta in results}
    now = dt.datetime.now(UTC)
    data = build_snapshot(datasets, metadata, now, season)
    roster_checks = refresh_roster_verification(data, datasets["nflverse_roster"], now, args.cache_dir, previous)
    cached = cached_player_history(season, data["roster"], data["steelers"]["schedule"], args.refresh_history)
    if not cached:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            archive_results = list(pool.map(lambda item: fetch_source(item, args.cache_dir),
                                           archive_source_specs(season, {player["id"] for player in data["roster"]}).items()))
        datasets.update({source_id: rows for source_id, rows, _ in archive_results})
        metadata.update({source_id: meta for source_id, _, meta in archive_results})
    history = build_player_history(data["roster"], data["steelers"]["schedule"], datasets, metadata, now, season, cached)
    history_checks = validate_history(history)
    history_sources = [source for source in history["sources"] if source["id"].startswith("nflverse_player_stats_")]
    data["sources"].extend(history_sources)
    history_content = json.dumps(history, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    history_hash = hashlib.sha256(history_content.encode()).hexdigest()
    history_source_ids = [source["id"] for source in history["sources"]]
    data["playerHistory"] = {"path": "assets/data/player-history.json", "sha256": history_hash, "status": history["coverage"]["status"],
                             "scope": history["scope"], "season": season, "sourceIds": history_source_ids,
                             "coverage": history["coverage"], "currentSourceHashes": history["currentSourceHashes"],
                             "retrievedAt": history["retrievedAt"], "generatedAt": history["generatedAt"]}
    data["provenance"]["playerHistory"] = {"status": "derived" if history["coverage"]["status"] == "verified" else "partial",
                                           "sourceIds": history_source_ids, "season": season, "retrievedAt": history["retrievedAt"],
                                           "coverage": history["coverage"], "note": history["note"]}
    for player in data["roster"]:
        player["historyStatus"] = history["players"][player["id"]]["status"]
        player["historyNote"] = history["players"][player["id"]]["note"]
    validate_history(history, data)
    checks = validate(data)
    normalized_hash = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    provenance = {"schemaVersion": 1, "generatedAt": data["generatedAt"], "retrievedAt": data["retrievedAt"], "snapshotSha256CanonicalJson": normalized_hash,
                  "sources": data["sources"], "datasets": data["provenance"], "validation": checks,
                  "playerHistorySha256": history_hash, "playerHistoryValidation": history_checks,
                  "rosterVerification": roster_checks,
                  "sourcePolicy": "Public authorised datasets only; rejected sources are not bypassed. Required-source failure retains the preceding verified snapshot.",
                  "refreshCommand": "python3 scripts/refresh-data.py", "validateCommand": "python3 scripts/refresh-data.py --check",
                  "refreshCadence": "Source-change checks every 15 minutes during verified NFL game/provider windows, hourly otherwise; six-hour full-fetch safety check. Publish only changed public data; no provider push/live-feed claim. Snapshot and archival source retrieval timestamps remain separate.",
                  "historyRefreshCommand": "python3 scripts/refresh-data.py --refresh-history"}
    atomic_json(HISTORY_PATH, history, compact=True)
    atomic_json(ROOT / "assets/data/current.json", data, compact=True)
    atomic_json(ROOT / "assets/data/provenance.json", provenance)
    print(json.dumps({**checks, "retrievedAt": data["retrievedAt"], "nextGame": data["steelers"]["upcomingGame"],
                      "snapshotBytes": (ROOT / "assets/data/current.json").stat().st_size,
                      "rosterVerification": roster_checks,
                      "playerHistory": history_checks, "playerHistoryBytes": HISTORY_PATH.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
