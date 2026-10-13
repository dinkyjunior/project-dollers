#!/usr/bin/env python3
"""Compare normalized official NFL standings with the current app snapshot.

This gate does not fetch or parse the NFL website. A separate reviewed adapter
must extract the actual page's season, REG scope and team rows, and supply the
genuine response metadata. Validating supplied metadata cannot prove retrieval.

Normalized input: schemaVersion=1, season, seasonType="REG", teams containing
abbr/conference/w/l/ties, and source containing url/retrievedAt/sha256 plus
scopeBasis="page-content". Optional team pct/pointsFor/pointsAgainst are compared
only when numeric values are supplied; omitted/null values stay unavailable.
An optional conferenceOrder records source row order separately from records.

Exit 0: records match; 1: published numeric readings differ; 2: invalid, missing
or stale input. An ordering-only difference does not fail record comparison.
"""
import argparse
import datetime as dt
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
CONFERENCES = {
    "AFC": frozenset("BAL BUF CIN CLE DEN HOU IND JAX KC LAC LV MIA NE NYJ PIT TEN".split()),
    "NFC": frozenset("ARI ATL CAR CHI DAL DET GB LA MIN NO NYG PHI SEA SF TB WAS".split()),
}
TEAMS = CONFERENCES["AFC"] | CONFERENCES["NFC"]
MAX_INPUT_BYTES = 8 * 1024 * 1024
DISCLAIMER = ("Normalized-input comparison only. This command did not fetch the NFL page; "
              "supplied URL, hash and timestamps are not proof of genuine official retrieval.")


class InvalidStandings(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidStandings(message)


def integer(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def time_value(value, label, now, max_age_hours):
    require(isinstance(value, str), f"{label} must be an explicit timezone timestamp")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise InvalidStandings(f"{label} is malformed") from error
    require(parsed.tzinfo is not None and parsed.utcoffset() is not None,
            f"{label} must include its timezone")
    parsed = parsed.astimezone(UTC)
    require(parsed <= now + dt.timedelta(minutes=5), f"{label} is in the future")
    require(now - parsed <= dt.timedelta(hours=max_age_hours), f"{label} is stale")
    return parsed


def percentage(value, label):
    require(isinstance(value, (str, int, float)) and not isinstance(value, bool),
            f"{label} must be a numeric percentage between 0 and 1")
    text = str(value)
    require(bool(re.fullmatch(r"(?:0?(?:\.[0-9]+)|0|1(?:\.0+)?)", text)),
            f"{label} must be a numeric percentage between 0 and 1")
    try:
        parsed = Decimal(text)
    except InvalidOperation as error:
        raise InvalidStandings(f"{label} is malformed") from error
    require(parsed.is_finite() and Decimal(0) <= parsed <= Decimal(1),
            f"{label} must be finite and between 0 and 1")
    return parsed


def rows_by_team(rows, label, conference=None, check_record_pct=False):
    require(isinstance(rows, list), f"{label} must be a team-row array")
    expected = CONFERENCES[conference] if conference else TEAMS
    result = {}
    for row in rows:
        require(isinstance(row, dict), f"{label} contains a malformed row")
        abbreviation = row.get("abbr")
        require(isinstance(abbreviation, str) and abbreviation in expected,
                f"{label} contains an unknown or wrongly scoped team")
        require(abbreviation not in result, f"{label} repeats {abbreviation}")
        if "conference" in row or not conference:
            actual = row.get("conference")
            require(isinstance(actual, str) and actual in CONFERENCES and abbreviation in CONFERENCES[actual],
                    f"{label} assigns {abbreviation} to the wrong conference")
        for field in ("w", "l", "ties"):
            require(integer(row.get(field)), f"{label} {abbreviation}.{field} must be a nonnegative integer")
        require(row["w"] + row["l"] + row["ties"] <= 17,
                f"{label} {abbreviation} exceeds the current NFL regular-season game limit")
        for field in ("pointsFor", "pointsAgainst"):
            if row.get(field) is not None:
                require(integer(row[field]), f"{label} {abbreviation}.{field} must be a nonnegative integer")
        if row.get("pct") is not None:
            pct = percentage(row["pct"], f"{label} {abbreviation}.pct")
            games = row["w"] + row["l"] + row["ties"]
            expected_pct = (Decimal(row["w"]) + Decimal(row["ties"]) / 2) / games if games else Decimal(0)
            # NFL table percentages conventionally round to three places.
            if check_record_pct:
                require(abs(pct - expected_pct) <= Decimal("0.0005"),
                        f"{label} {abbreviation}.pct={row['pct']} disagrees with its W/L/T percentage={expected_pct}")
        result[abbreviation] = row
    require(set(result) == expected, f"{label} must contain every expected team exactly once")
    return result


def validate_inputs(snapshot, official, now, max_age_hours):
    require(isinstance(snapshot, dict) and type(snapshot.get("schemaVersion")) is int and snapshot["schemaVersion"] == 1,
            "The current snapshot schema is invalid")
    season = snapshot.get("season")
    require(integer(season) and season >= 1920, "The current snapshot season is invalid")
    require(integer(snapshot.get("currentWeek")) and 1 <= snapshot["currentWeek"] <= 18,
            "The current regular-season week is missing or invalid")
    require(integer(snapshot.get("throughWeek")) and snapshot["throughWeek"] <= 18,
            "The current regular-season coverage is missing or invalid")
    time_value(snapshot.get("retrievedAt"), "Current snapshot retrievedAt", now, max_age_hours)
    require(isinstance(snapshot.get("weeks"), dict), "Current snapshot weeks are malformed")
    current = snapshot["weeks"].get(str(snapshot["currentWeek"]))
    require(isinstance(current, dict) and isinstance(current.get("conferences"), dict),
            "The current-week conference records are unavailable")
    require(integer(current.get("throughWeek")) and current["throughWeek"] == snapshot["throughWeek"],
            "Current-week records do not match the latest snapshot coverage")
    team_definitions = snapshot.get("teams")
    require(isinstance(team_definitions, list) and len(team_definitions) == 32,
            "The current snapshot must define all 32 NFL teams")
    team_map = {}
    for team in team_definitions:
        require(isinstance(team, dict), "Current team identity is malformed")
        abbr, conference = team.get("abbr"), team.get("conference")
        require(isinstance(abbr, str) and abbr in TEAMS and abbr not in team_map,
                "Current team identity is unknown or duplicated")
        require(isinstance(conference, str) and conference in CONFERENCES and abbr in CONFERENCES[conference],
                f"Current team {abbr} is assigned to the wrong conference")
        team_map[abbr] = conference
    primary = {}
    primary_order = {}
    for conference in CONFERENCES:
        conference_rows = current["conferences"].get(conference)
        primary.update(rows_by_team(conference_rows, f"Current {conference}", conference, check_record_pct=True))
        primary_order[conference] = [row["abbr"] for row in conference_rows]

    require(isinstance(official, dict) and type(official.get("schemaVersion")) is int and official["schemaVersion"] == 1,
            "Normalized official input schema is invalid")
    require(official.get("season") == season and integer(official.get("season")),
            "Normalized official input has a different season")
    require(official.get("seasonType") == "REG", "Normalized official input must state REG scope")
    source = official.get("source")
    require(isinstance(source, dict), "Normalized official input source metadata is missing")
    expected_url = f"https://www.nfl.com/standings/conference/{season}/REG"
    require(source.get("url") == expected_url, "Official source URL is not the exact season conference URL")
    require(source.get("scopeBasis") == "page-content",
            "The adapter must declare that season and REG scope came from page content")
    time_value(source.get("retrievedAt"), "Official source retrievedAt", now, max_age_hours)
    require(isinstance(source.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", source["sha256"]),
            "Official source SHA-256 is missing or malformed")
    if "httpStatus" in source:
        require(source["httpStatus"] == 200, "Official source was not a successful HTTP 200 response")
    if "bytes" in source:
        require(integer(source["bytes"]) and source["bytes"] > 0, "Official source body size is invalid")
    if "finalUrl" in source:
        require(source["finalUrl"] in (expected_url, expected_url + "/"),
                "Official source redirect does not retain exact season conference scope")
    official_rows = rows_by_team(official.get("teams"), "Normalized official table")
    official_order = official.get("conferenceOrder")
    if official_order is None:
        official_order = {conference: [row["abbr"] for row in official["teams"]
                                      if row["conference"] == conference] for conference in CONFERENCES}
    require(isinstance(official_order, dict) and set(official_order) == set(CONFERENCES),
            "Official conference order must contain AFC and NFC")
    for conference, order in official_order.items():
        require(isinstance(order, list) and len(order) == 16
                and all(isinstance(abbr, str) for abbr in order)
                and set(order) == CONFERENCES[conference],
                f"Official {conference} row order is missing, duplicated or wrongly scoped")
    require(isinstance(snapshot.get("provenance"), dict)
            and isinstance(snapshot["provenance"].get("standings"), dict),
            "Current standings provenance is missing")
    ids = snapshot["provenance"]["standings"].get("sourceIds")
    require(isinstance(ids, list) and bool(ids) and all(isinstance(value, str) and value for value in ids),
            "Current standings source identities are missing")
    return primary, official_rows, primary_order, official_order


def compare_snapshot(snapshot, official, now=None, max_age_hours=24):
    now = now or dt.datetime.now(UTC)
    require(isinstance(now, dt.datetime) and now.tzinfo is not None, "Comparison clock must include its timezone")
    require(isinstance(max_age_hours, (int, float)) and not isinstance(max_age_hours, bool)
            and 0 < max_age_hours <= 168, "Maximum source age must be greater than zero and at most 168 hours")
    now = now.astimezone(UTC)
    primary, official_rows, primary_order, official_order = validate_inputs(snapshot, official, now, max_age_hours)
    differences = []
    comparisons = {field: 0 for field in ("w", "l", "ties", "pct", "pointsFor", "pointsAgainst")}
    unavailable = []
    for abbr in sorted(TEAMS):
        for field in comparisons:
            source_value = official_rows[abbr].get(field)
            primary_value = primary[abbr].get(field)
            if source_value is None or primary_value is None:
                unavailable.append({"team": abbr, "field": field,
                                    "officialAvailable": source_value is not None,
                                    "primaryAvailable": primary_value is not None})
                continue
            comparisons[field] += 1
            matches = (abs(percentage(source_value, "Official percentage") -
                           percentage(primary_value, "Current percentage")) <= Decimal("0.0005")) if field == "pct" else source_value == primary_value
            if not matches:
                differences.append({"team": abbr, "field": field,
                                    "official": source_value, "primary": primary_value})
    order_differences = []
    for conference in CONFERENCES:
        if primary_order[conference] == official_order[conference]:
            continue
        def pct(abbr):
            row = primary[abbr]
            games = row["w"] + row["l"] + row["ties"]
            return (Decimal(row["w"]) + Decimal(row["ties"]) / 2) / games if games else Decimal(0)
        order_differences.append({"conference": conference,
                                  "officialRowOrder": official_order[conference],
                                  "appSortedRecordOrder": primary_order[conference],
                                  "onlyWithinEqualPercentageGroups": [pct(abbr) for abbr in primary_order[conference]] ==
                                                                       [pct(abbr) for abbr in official_order[conference]],
                                  "note": "Source row order and app sort order are separate; neither is asserted to be playoff seeding."})
    return {"status": "mismatch" if differences else "match",
            "checkedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "season": snapshot["season"], "seasonType": "REG", "throughWeek": snapshot["throughWeek"],
            "teamCount": 32, "comparedFields": comparisons, "differences": differences,
            "orderDifferences": order_differences, "unavailableComparisons": unavailable,
            "officialSourceMetadata": official["source"], "primaryRetrievedAt": snapshot["retrievedAt"],
            "primaryStandingsSourceIds": snapshot.get("provenance", {}).get("standings", {}).get("sourceIds", []),
            "verificationClaim": DISCLAIMER}


def read_input(path):
    body = Path(path).read_bytes()
    require(len(body) <= MAX_INPUT_BYTES, "Input JSON exceeds the comparison size limit")
    def invalid_constant(value):
        raise InvalidStandings(f"Input contains invalid JSON numeric constant {value}")
    return json.loads(body, parse_constant=invalid_constant), hashlib.sha256(body).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--official", required=True, help="Reviewed adapter's normalized official JSON; not an HTML page")
    parser.add_argument("--snapshot", default=str(ROOT / "assets/data/current.json"))
    parser.add_argument("--max-source-age-hours", type=float, default=24)
    parser.add_argument("--output", help="Optional comparison receipt path")
    args = parser.parse_args()
    try:
        snapshot, snapshot_hash = read_input(args.snapshot)
        official, official_hash = read_input(args.official)
        result = compare_snapshot(snapshot, official, max_age_hours=args.max_source_age_hours)
        result["inputSha256"] = {"snapshot": snapshot_hash, "normalizedOfficial": official_hash}
        status = 1 if result["differences"] else 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        result = {"status": "invalid", "error": str(error), "verificationClaim": DISCLAIMER}
        status = 2
    content = json.dumps(result, indent=2, allow_nan=False) + "\n"
    if args.output:
        try:
            destination = Path(args.output)
            require(destination.resolve() not in (Path(args.official).resolve(), Path(args.snapshot).resolve()),
                    "Comparison output must not replace either input")
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(content)
        except (OSError, ValueError) as error:
            print(json.dumps({"status": "invalid", "error": str(error), "verificationClaim": DISCLAIMER}, indent=2))
            return 2
    print(content, end="")
    return status


if __name__ == "__main__":
    sys.exit(main())
