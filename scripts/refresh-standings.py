#!/usr/bin/env python3
"""Refresh standings independently of rosters, player statistics and reports.

Records come from the public nflverse schedule. ESPN's explicit playoffSeed
supplies the current conference order; NFL.com independently checks all records
and points. All three sources must validate before replacement. Rank differences
between ESPN and NFL.com are disclosed, never recomputed from points. Conditional
GETs avoid unchanged downloads; --force fetches every complete source entity.
"""
import argparse
import collections
import csv
import datetime as dt
from fractions import Fraction
import hashlib
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import re
import ssl
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
ESPN_SOURCE_ID = "espn_conference_standings"
NFL_SOURCE_ID = "nfl_conference_standings"
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


def provider_url(provider, season):
    if provider == "ESPN":
        return f"https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season={season}&type=2&level=2"
    if provider == "NFL":
        return f"https://www.nfl.com/standings/conference/{season}/REG"
    raise ValueError("Unexpected standings provider")


def fetch_provider(provider, season, previous=None, force=False, opener=urllib.request.urlopen):
    """Fetch official rank proof even if the independent game CSV is unchanged."""
    url = provider_url(provider, season)
    source_id = ESPN_SOURCE_ID if provider == "ESPN" else NFL_SOURCE_ID
    prior = next((item for item in (previous or {}).get("sources", []) if item.get("id") == source_id), None)
    saved = (previous or {}).get("providerStandings", {}).get(provider)
    headers = {"User-Agent": "ProjectDollarStandings/2.0 public-source-audit"}
    if prior and saved and not force and prior.get("url") == url:
        if prior.get("etag"):
            headers["If-None-Match"] = prior["etag"]
        elif prior.get("lastModified"):
            headers["If-Modified-Since"] = prior["lastModified"]
    request = urllib.request.Request(url, headers=headers)
    try:
        with opener(request, timeout=60, context=ssl_context()) as response:
            if response.status == 304 and prior and saved and not force:
                print(json.dumps({"provider": provider, "httpStatus": 304, "checkedAt": iso(dt.datetime.now(UTC))}))
                return None, prior
            if response.status != 200:
                raise ValueError(f"Unexpected {provider} standings HTTP status {response.status}")
            body = response.read(4 * 1024 * 1024 + 1)
            if not body or len(body) > 4 * 1024 * 1024:
                raise ValueError(f"Empty or oversized {provider} standings response")
            retrieved = iso(dt.datetime.now(UTC))
            source = {"id": source_id, "url": url, "provider": provider, "status": "verified", "season": season,
                      "retrievedAt": retrieved, "checkedAt": retrieved, "httpStatus": 200,
                      "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                      "etag": response.headers.get("ETag"), "lastModified": response.headers.get("Last-Modified")}
            if prior and saved and source["sha256"] == prior.get("sha256"):
                print(json.dumps({"provider": provider, "httpStatus": 200, "status": "retrieved-unchanged", "checkedAt": retrieved}))
                source = prior
            return body, source
    except urllib.error.HTTPError as exc:
        if exc.code == 304 and prior and saved and not force:
            print(json.dumps({"provider": provider, "httpStatus": 304, "checkedAt": iso(dt.datetime.now(UTC))}))
            return None, prior
        raise


def integer(value, label, maximum=17):
    if isinstance(value, bool) or value is None:
        raise ValueError(f"Missing or invalid {label}")
    number = float(value)
    if not number.is_integer() or not 0 <= number <= maximum:
        raise ValueError(f"Invalid {label}")
    return int(number)


def validate_provider(official, identities, season):
    if official.get("season") != season:
        raise ValueError("Official standings belong to another season")
    teams = official.get("teams", [])
    expected = {team["abbr"]: team for team in identities}
    if len(teams) != 32 or {team.get("abbr") for team in teams} != set(expected):
        raise ValueError("Official standings must contain all 32 distinct teams")
    for team in teams:
        if team.get("conference") != expected[team["abbr"]]["conference"]:
            raise ValueError("Official standings conference differs from team identity")
        for field in ("w", "l", "ties"):
            if type(team.get(field)) is not int or not 0 <= team[field] <= 17:
                raise ValueError("Invalid official record count")
        if sum(team[field] for field in ("w", "l", "ties")) > 17:
            raise ValueError("Official team record exceeds regular-season games")
        if type(team.get("rank")) is not int or not 1 <= team["rank"] <= 16:
            raise ValueError("Invalid official conference rank")
    for conference in ("AFC", "NFC"):
        if sorted(team["rank"] for team in teams if team["conference"] == conference) != list(range(1, 17)):
            raise ValueError("Official conference ranks must contain every position 1 through 16 exactly once")
    return official


def parse_espn(body, identities, season):
    data = json.loads(body)
    if data.get("season", {}).get("year") != season:
        raise ValueError("ESPN response season differs from requested season")
    teams, conferences = [], set()
    for conference in data.get("children", []):
        abbr = conference.get("abbreviation")
        if abbr not in ("AFC", "NFC") or abbr in conferences:
            raise ValueError("Unexpected or duplicate ESPN conference")
        conferences.add(abbr)
        standings = conference.get("standings", {})
        if standings.get("season") != season or standings.get("seasonType") != 2:
            raise ValueError("ESPN standings are not the requested regular season")
        for entry in standings.get("entries", []):
            stats = {item["name"]: item.get("value") for item in entry.get("stats", [])}
            team = entry.get("team", {}).get("abbreviation")
            team = {"LAR": "LA", "WSH": "WAS"}.get(team, team)
            teams.append({"abbr": team, "conference": abbr,
                          "w": integer(stats.get("wins"), "ESPN wins"),
                          "l": integer(stats.get("losses"), "ESPN losses"),
                          "ties": integer(stats.get("ties"), "ESPN ties"),
                          # The raw API entry array is not necessarily seed order.
                          "rank": integer(stats.get("playoffSeed"), "ESPN playoffSeed", 16)})
    return validate_provider({"provider": "ESPN", "season": season, "teams": teams}, identities, season)


class StandingsTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None
        self.canonical_urls, self.selected_phases, self.select_id = [], [], None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "link" and "canonical" in attributes.get("rel", "").lower().split():
            self.canonical_urls.append(attributes.get("href", "").lower().rstrip("/"))
        elif tag == "select":
            self.select_id = attributes.get("id")
        elif tag == "option" and self.select_id == "phase-dropdown" and "selected" in attributes:
            self.selected_phases.append(attributes.get("value", "").lower().rstrip("/"))
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []

    def handle_data(self, text):
        if self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if tag == "select":
            self.select_id = None
        if tag in ("td", "th") and self.row is not None and self.cell is not None:
            self.row.append(" ".join(" ".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_nfl(body, identities, season):
    text = body.decode("utf-8")
    if not re.search(rf"<title>\s*{season} NFL Conference Standings\s*</title>", text, re.IGNORECASE):
        raise ValueError("NFL.com response does not identify the requested season and conference standings")
    parser = StandingsTableParser()
    parser.feed(text)
    expected_path = f"/standings/conference/{season}/reg"
    if (parser.canonical_urls != [f"https://www.nfl.com{expected_path}"]
            or parser.selected_phases != [expected_path]):
        raise ValueError("NFL.com canonical URL and selected phase must identify the requested regular season")
    teams, conference = [], None
    for row in parser.rows:
        if row and row[0] in ("AFC Team", "NFC Team"):
            conference = row[0][:3]
            if row[1:8] != ["W", "L", "T", "RANK", "PCT", "PF", "PA"]:
                raise ValueError("NFL.com standings column contract changed")
        elif conference and len(row) >= 8:
            matched = [team for team in identities if row[0].startswith(team["fullName"])]
            if len(matched) != 1:
                raise ValueError("NFL.com standings team identity is not unique")
            teams.append({"abbr": matched[0]["abbr"], "conference": conference,
                          "w": integer(row[1], "NFL wins"), "l": integer(row[2], "NFL losses"),
                          "ties": integer(row[3], "NFL ties"), "rank": integer(row[4], "NFL rank", 16),
                          "pointsFor": integer(row[6], "NFL points for", 1500),
                          "pointsAgainst": integer(row[7], "NFL points against", 1500)})
    return validate_provider({"provider": "NFL", "season": season, "teams": teams}, identities, season)


def apply_provider_order(snapshot, espn, nfl, espn_source, nfl_source):
    """Apply verified ESPN seed positions only to the current browsing week."""
    for official in (espn, nfl):
        validate_provider(official, snapshot["teams"], snapshot["season"])
    current = snapshot["weeks"][str(snapshot["currentBrowsingWeek"])]
    derived = {row["abbr"]: row for rows in current["conferences"].values() for row in rows}
    provider_rows = {}
    for official in (espn, nfl):
        provider_rows[official["provider"]] = {row["abbr"]: row for row in official["teams"]}
        fields = ("w", "l", "ties", "pointsFor", "pointsAgainst") if official["provider"] == "NFL" else ("w", "l", "ties")
        for abbr, row in provider_rows[official["provider"]].items():
            if any(row[field] != derived[abbr][field] for field in fields):
                raise ValueError(f"{official['provider']} {abbr} records differ from independently sourced finals")
    order = {}
    for conference in ("AFC", "NFC"):
        ranked = sorted((row for row in espn["teams"] if row["conference"] == conference), key=lambda row: row["rank"])
        order[conference] = [row["abbr"] for row in ranked]
        current["conferences"][conference] = []
        for row in ranked:
            updated = dict(derived[row["abbr"]])
            updated.update(rank=row["rank"], playoffSeed=row["rank"], sortIndex=row["rank"])
            current["conferences"][conference].append(updated)
    disagreements = [{"abbr": abbr, "espnRank": row["rank"], "nflRank": provider_rows["NFL"][abbr]["rank"]}
                     for abbr, row in sorted(provider_rows["ESPN"].items())
                     if row["rank"] != provider_rows["NFL"][abbr]["rank"]]
    snapshot["ranking"] = {"method": "provider-conference-order", "official": True, "provider": "ESPN",
        "sourceId": ESPN_SOURCE_ID, "source": espn_source,
        "note": "ESPN conference order; ranks are supplied by ESPN, not recalculated from points."}
    snapshot["conferenceOrder"] = {"provider": "ESPN", "sourceId": ESPN_SOURCE_ID, "season": snapshot["season"],
        "week": snapshot["currentBrowsingWeek"], "throughWeek": current["throughWeek"],
        "retrievedAt": espn_source["retrievedAt"], "conferences": order}
    snapshot["sources"] = [snapshot["source"], espn_source, nfl_source]
    snapshot["providerStandings"] = {"ESPN": espn, "NFL": nfl}
    snapshot["crossCheck"] = {"status": "records-match", "provider": "NFL", "url": nfl_source["url"],
        "retrievedAt": nfl_source["retrievedAt"], "recordsCompared": 32, "mismatches": [],
        "orderDisagreements": disagreements,
        "note": (f"All 32 records and PF/PA match NFL.com and nflverse finals; {len(disagreements)} conference ranks "
                 "differ between ESPN and NFL.com. ESPN supplies the display order.")}
    return snapshot


def retain_unchanged_provider_proof(official, source, previous):
    """Keep the authentic original proof when only HTML/JSON chrome changes.

    New GETs are still performed and logged. Retention requires every normalized
    season, team identity, record, point total and provider rank to remain equal.
    API entry-array order is not part of conference ranking authority.
    """
    provider = official["provider"]
    saved = (previous or {}).get("providerStandings", {}).get(provider)
    prior = next((item for item in (previous or {}).get("sources", []) if item.get("id") == source["id"]), None)
    def semantic(value):
        return {**value, "teams": sorted(value["teams"], key=lambda team: team["abbr"])}
    if saved and prior and semantic(official) == semantic(saved):
        if source.get("sha256") != prior.get("sha256"):
            print(json.dumps({"provider": provider, "status": "validated-records-and-ranks-unchanged",
                              "checkedAt": source["checkedAt"], "httpStatus": source["httpStatus"],
                              "retainedProofRetrievedAt": prior["retrievedAt"]}))
        return saved, prior
    return official, source


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


def validate_snapshot(snapshot, previous=None, require_official=False):
    if snapshot.get("schemaVersion") != 1 or not snapshot.get("weeks"):
        raise ValueError("Invalid standings snapshot schema")
    is_official = snapshot.get("ranking", {}).get("official") is True
    if require_official and not is_official:
        raise ValueError("Current standings require verified ESPN conference order")
    if is_official and snapshot["ranking"].get("method") != "provider-conference-order":
        raise ValueError("Official ranking requires a verified provider conference-order contract")
    source = snapshot["source"]
    if source.get("url") != SOURCE_URL or source.get("status") != "verified" or len(source.get("sha256", "")) != 64:
        raise ValueError("Invalid standings source provenance")
    timestamp(source["retrievedAt"])
    if len({game["id"] for game in snapshot["games"]}) != len(snapshot["games"]):
        raise ValueError("Duplicate final game in standings snapshot")
    if any(game.get("status") != "final" or game.get("home_score") is None or game.get("away_score") is None
           for game in snapshot["games"]):
        raise ValueError("Standings results must contain genuine two-sided finals")
    for week_number, week in snapshot["weeks"].items():
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
        if is_official and int(week_number) == snapshot["currentBrowsingWeek"]:
            sources = {item["id"]: item for item in snapshot.get("sources", [])}
            for source_id, provider in ((ESPN_SOURCE_ID, "ESPN"), (NFL_SOURCE_ID, "NFL")):
                proof = sources.get(source_id, {})
                if (proof.get("url") != provider_url(provider, snapshot["season"]) or proof.get("provider") != provider
                        or proof.get("season") != snapshot["season"] or proof.get("status") != "verified"
                        or proof.get("httpStatus") != 200 or not re.fullmatch(r"[0-9a-f]{64}", proof.get("sha256", ""))):
                    raise ValueError("Missing or invalid official provider source provenance")
                timestamp(proof["retrievedAt"])
            verification = {"source": snapshot["source"], "teams": snapshot["teams"], "season": snapshot["season"],
                "currentBrowsingWeek": snapshot["currentBrowsingWeek"],
                "weeks": {week_number: {"throughWeek": week["throughWeek"], "conferences": expected}}}
            apply_provider_order(verification, snapshot["providerStandings"]["ESPN"], snapshot["providerStandings"]["NFL"],
                                 sources[ESPN_SOURCE_ID], sources[NFL_SOURCE_ID])
            expected = verification["weeks"][week_number]["conferences"]
            for key in ("ranking", "conferenceOrder", "crossCheck"):
                if snapshot.get(key) != verification[key]:
                    raise ValueError("Official order metadata does not reconcile to verified provider records")
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
        validate_snapshot(previous, require_official=True)
        return previous, False
    body, source = fetch_games(previous, force=force)
    now = dt.datetime.now(UTC)
    if body is None:
        validate_snapshot(previous)
        # Source content stays unchanged, but the browsing week and missing-
        # result coverage can roll over without requiring another large GET.
        print(json.dumps({"status": "unchanged", "checkedAt": source["checkedAt"], "httpStatus": 304}))
        if not previous.get("schedule"):
            raise ValueError("Saved standings lack the validated schedule needed for a conditional rebuild")
        rows = [{"game_id": game["id"], "season": game["season"], "game_type": "REG", "week": game["week"],
                 "gameday": game["gameday"], "gametime": (timestamp(game["kickoffUtc"]).astimezone(ET).strftime("%H:%M")
                                                             if game["kickoffUtc"] else ""),
                 "away_team": game["away_team"], "home_team": game["home_team"],
                 "away_score": game["away_score"], "home_score": game["home_score"]} for game in previous["schedule"]]
        source = previous["source"]
    else:
        rows = parse_games(body)
    snapshot = build_snapshot(rows, identities_snapshot["teams"], season, source, now)
    if previous and previous.get("source", {}).get("sha256") == source["sha256"]:
        # A re-download cannot make unchanged data look newly updated. Rebuild
        # for calendar rollover, but retain the original source retrieval date.
        snapshot["retrievedAt"] = previous["retrievedAt"]
        snapshot["source"] = previous["source"]
        if body is not None:
            print(json.dumps({"status": "retrieved-unchanged", "checkedAt": source["checkedAt"], "httpStatus": 200}))
    # Every refresh validates the official sources independently. A CSV 304
    # cannot suppress a corrected conference seed or hide a provider failure.
    espn_body, espn_source = fetch_provider("ESPN", season, previous, force)
    nfl_body, nfl_source = fetch_provider("NFL", season, previous, force)
    espn = (parse_espn(espn_body, snapshot["teams"], season) if espn_body is not None else
            previous["providerStandings"]["ESPN"])
    nfl = (parse_nfl(nfl_body, snapshot["teams"], season) if nfl_body is not None else
           previous["providerStandings"]["NFL"])
    # Ads, scripts and unrelated page chrome must not cause another release of
    # identical records/order. Preserve the prior dated proof only after both
    # newly parsed provider models have passed their complete schema checks.
    for official in (espn, nfl):
        validate_provider(official, snapshot["teams"], season)
    espn, espn_source = retain_unchanged_provider_proof(espn, espn_source, previous)
    nfl, nfl_source = retain_unchanged_provider_proof(nfl, nfl_source, previous)
    apply_provider_order(snapshot, espn, nfl, espn_source, nfl_source)
    if official_path:
        # Additional captured comparisons cannot replace the live rank proof.
        snapshot["additionalCrossCheck"] = compare_official_records(snapshot, json.loads(official_path.read_text()))
    if previous and {key: value for key, value in snapshot.items() if key != "generatedAt"} == {
            key: value for key, value in previous.items() if key != "generatedAt"}:
        snapshot["generatedAt"] = previous["generatedAt"]
    validate_snapshot(snapshot, previous, require_official=True)
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
