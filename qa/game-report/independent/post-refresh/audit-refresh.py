#!/usr/bin/env python3
"""Bounded offline comparison of a refreshed release with the reviewed report snapshot.

Does not import production builders, request sources, write app data, or run a
browser. New/changed sporting facts require targeted authoritative-source QA;
matching old facts can be accepted after their new checksum/context bindings pass.
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys

CONTEXT = ("id", "espnEventId", "season", "seasonType", "week", "status", "home_team", "away_team")
JOIN = ("espnEventId", "season", "week", "home_team", "away_team", "home_score", "away_score")
METADATA = {"generatedAt", "retrievedAt", "checkedAt", "sourceIds", "identitySourceIds", "sources", "provenance", "statsProvenance", "verification", "sha256", "etag", "lastModified", "httpStatus", "tlsVerified", "fieldSources"}
ALIASES = {"STL": "LA", "LAR": "LA", "OAK": "LV", "SD": "LAC", "SDG": "LAC", "JAC": "JAX", "WSH": "WAS"}
DAL_ID = "2026_04_DAL_HOU"


def sha(body):
    return hashlib.sha256(body).hexdigest()


def digest(value):
    return sha(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())


def stripped(value):
    if isinstance(value, dict):
        return {k: stripped(v) for k, v in value.items() if k not in METADATA}
    if isinstance(value, list):
        return [stripped(v) for v in value]
    return value


def stamp(value):
    parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp has no timezone")
    return parsed


def read(path, limit):
    if path.stat().st_size > limit:
        raise ValueError(f"Bounded input limit exceeded: {path}")
    body = path.read_bytes()
    return body, json.loads(body)


def validate(repo, max_reports, max_detail_bytes):
    checks = 0

    def require(ok, detail):
        nonlocal checks
        checks += 1
        if not ok:
            raise ValueError(detail)

    data = repo / "assets/data"
    raw_index, index = read(data / "game-reports.json", 8 * 1024 * 1024)
    require(index.get("schemaVersion") == 1, "Report index schema")
    require(len(index["games"]) <= max_reports, "Bounded report count exceeded")
    books = {}
    dependency_files = {"teamDetailsSha256": "team-details.json", "matchupBreakdownSha256": "matchup-breakdown.json", "playerHistorySha256": "player-history.json"}
    for key, name in dependency_files.items():
        body, book = read(data / name, 32 * 1024 * 1024)
        require(index["dependencies"][key] == sha(body), f"Dependency mismatch: {name}")
        books[name] = book
    core_body, core = read(data / "current.json", 32 * 1024 * 1024)
    require(books["matchup-breakdown.json"]["dependencies"]["currentSha256"] == sha(core_body), "Matchup/core dependency mismatch")
    require(books["matchup-breakdown.json"]["dependencies"]["teamDetailsSha256"] == index["dependencies"]["teamDetailsSha256"], "Matchup/team dependency mismatch")
    require(core["playerHistory"]["sha256"] == index["dependencies"]["playerHistorySha256"], "Core/player-history dependency mismatch")
    require(core["season"] == index["season"] and core["currentWeek"] == index["currentWeek"], "Core/report season/week mismatch")
    require(index["integrityCatalog"]["dependencies"] == index["dependencies"], "Catalog dependency binding")
    require(index["integrityCatalog"]["schemaVersion"] == 1, "Catalog schema")
    require(index["season"] == books["team-details.json"]["season"], "Selected season binding")
    require(index["currentWeek"] == books["team-details.json"]["currentWeek"], "Selected week binding")
    linked = {}
    identities = {}
    for name in ("team-details.json", "matchup-breakdown.json"):
        for team, club in books[name]["teams"].items():
            for game in [*club.get("games", []), *club.get("headToHeadGames", [])]:
                if game.get("status") == "final" and game.get("espnEventId"):
                    if game["id"] in linked:
                        require(all(game.get(k) == linked[game["id"]].get(k) for k in JOIN), f"Primary-book conflict: {game['id']}")
                    linked[game["id"]] = game
            players = club.get("players", {})
            players = players.values() if isinstance(players, dict) else players
            for player in [*club.get("roster", []), *players]:
                if player.get("espnId") and player.get("id"):
                    key = (team, str(player["espnId"]))
                    if key in identities:
                        require(identities[key] == str(player["id"]), f"Conflicting player identity: {key}")
                    identities[key] = str(player["id"])
    require(set(linked).issubset(index["games"]), "Missing linked final-game report")
    catalog = index["knownDisagreements"]
    catalog_by_game = collections.defaultdict(list)
    for row in catalog:
        catalog_by_game[row["gameId"]].append(row)
    require(set(catalog_by_game).issubset(index["games"]), "Orphan catalog event")
    reports = {}
    quarter_checks = 0
    for game_id, entry in index["games"].items():
        match = re.fullmatch(r"([0-9]{4})_([0-9]{2})_([A-Z]{2,3})_([A-Z]{2,3})", game_id)
        require(bool(match), f"Invalid event key: {game_id}")
        require(entry["detailUrl"] == f"assets/data/game-reports/{game_id}.json", f"Unsafe detail URL: {game_id}")
        body, report = read(data / "game-reports" / f"{game_id}.json", max_detail_bytes)
        require(len(body) == entry["bytes"] and sha(body) == entry["sha256"], f"Detail checksum/size: {game_id}")
        require(all(report.get(k) == entry.get(k) for k in [*CONTEXT, "home_score", "away_score", "kickoffUtc", "venue"]), f"Index/detail context: {game_id}")
        require(report["retrievedAt"] == entry["retrievedAt"], f"Index/detail retrieval metadata: {game_id}")
        stamp(report["retrievedAt"])
        require(report["id"] == game_id and report["status"] == "final", f"Final event identity: {game_id}")
        require(int(match[1]) == report["season"] and int(match[2]) == report["week"], f"Event season/week: {game_id}")
        require(ALIASES.get(match[3], match[3]) == report["away_team"] and ALIASES.get(match[4], match[4]) == report["home_team"], f"Event home/away: {game_id}")
        require(index["eventIdToGameId"][str(report["espnEventId"])] == game_id, f"ESPN alias: {game_id}")
        if game_id in linked:
            require(all(report.get(k) == linked[game_id].get(k) for k in JOIN), f"Selected source-game context: {game_id}")
        sources = {s["id"]: s for s in report["sources"]}
        for source in sources.values():
            stamp(source["retrievedAt"])
            require(source.get("url", "").startswith("https://") and re.fullmatch(r"[a-f0-9]{64}", str(source.get("sha256", ""))), f"Source metadata: {game_id}/{source['id']}")
        require(sources["nflverse_games"]["status"] == "verified", f"Primary source status: {game_id}")
        verification = report["verification"]
        require(verification["status"] == "verified" and verification["scoreCrosscheck"] == "verified", f"Unverified final report: {game_id}")
        require(all(s in sources and sources[s]["status"] == "verified" for s in verification["sourceIds"]), f"Score evidence: {game_id}")
        espn = sources[f"espn_game_report_{report['espnEventId']}"]
        require(espn.get("tlsVerified") is True and espn.get("httpStatus") == 200, f"Strict ESPN receipt: {game_id}")
        require(espn["url"] == f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={report['espnEventId']}", f"ESPN selected-event URL: {game_id}")
        require(report["retrievedAt"] == espn["retrievedAt"], f"Report/provider retrieval metadata: {game_id}")
        refs = list(report.get("sourceIds", []))
        provenance_rows = [*report.get("provenance", {}).values(), *report.get("statsProvenance", {}).values(), *[p.get("provenance", {}) for team in report.get("players", {}).values() for p in team]]
        for provenance in provenance_rows:
            refs.extend(provenance.get("sourceIds", []))
            for ids in provenance.get("fieldSources", {}).values():
                refs.extend(ids)
        require(all(s in sources for s in refs), f"Unresolvable report/field source reference: {game_id}")
        for team, score_key in ((report["home_team"], "home_score"), (report["away_team"], "away_score")):
            quarters = report["quarters"].get(team)
            if quarters is not None:
                require(all(type(q) in (int, float) and q >= 0 for q in quarters) and sum(quarters) == report[score_key], f"Quarter arithmetic: {game_id}/{team}")
                quarter_checks += 1
            stats = report["stats"].get(team, {})
            if all(stats.get(k) is not None for k in ("totalOffense", "netPassing", "rushing")):
                require(stats["totalOffense"] == stats["netPassing"] + stats["rushing"], f"Offense arithmetic: {game_id}/{team}")
        issues = report.get("disagreements", [])
        rows = catalog_by_game[game_id]
        require(len(rows) == len(issues), f"Catalog completeness: {game_id}")
        for ordinal, issue in enumerate(issues):
            row = next((r for r in rows if r["id"] == f"{game_id}:{ordinal}"), None)
            require(row is not None, f"Missing catalog ordinal: {game_id}/{ordinal}")
            require(row["reportSha256"] == entry["sha256"] and row["detailUrl"] == entry["detailUrl"] and row["reportRetrievedAt"] == report["retrievedAt"], f"Catalog detail evidence: {game_id}/{ordinal}")
            require(row["season"] == report["season"] and row["week"] == report["week"] and row["reportField"] == issue["field"], f"Catalog event context: {game_id}/{ordinal}")
            field = issue["field"]
            scope = "player" if field.startswith("players.") else "team" if field.startswith("stats.") else "venue" if field == "venue" else "event"
            expected_pid = str(issue["playerId"]) if issue.get("playerId") is not None else None
            require(row["scope"] == scope and row["field"] == field.split(".", 1)[-1] and row["team"] == issue.get("team") and row["playerEspnId"] == expected_pid, f"Catalog selected-field identity: {game_id}/{ordinal}")
            require(row["values"] == issue.get("values", [issue.get("primary"), issue.get("provider")]) and row["sourceIds"] == issue.get("sourceIds", []), f"Catalog alternatives: {game_id}/{ordinal}")
            require(row["sources"] == [sources[s] for s in row["sourceIds"]], f"Catalog exact source descriptors: {game_id}/{ordinal}")
            require(bool(row["readings"]) and all(r.get("sourceIds") and all(s in row["sourceIds"] for s in r["sourceIds"]) and r.get("value") in row["values"] for r in row["readings"]), f"Explicit catalog readings: {game_id}/{ordinal}")
            if issue.get("readings") is not None:
                require(row["readings"] == issue["readings"], f"Explicit provider/value mapping: {game_id}/{ordinal}")
            else:
                provider_id = f"espn_game_report_{report['espnEventId']}"
                primary_ids = [s for s in issue.get("sourceIds", []) if s != provider_id]
                values = row["values"]
                expected = ([{"value": values[0], "sourceIds": primary_ids}, {"value": values[1], "sourceIds": [provider_id]}]
                            if len(values) == 2 and primary_ids and provider_id in issue.get("sourceIds", [])
                            else [{"value": v, "sourceIds": issue.get("sourceIds", [])} for v in values])
                require([{k: r[k] for k in ("value", "sourceIds")} for r in row["readings"]] == expected, f"Named source/value mapping: {game_id}/{ordinal}")
            if row["scope"] == "player":
                pid = str(row["playerEspnId"])
                require(row["playerGsisId"] == identities.get((row["team"], pid)), f"Canonical player context: {game_id}/{pid}")
                player = next(p for p in report["players"][row["team"]] if str(p["espnId"]) == pid)
                require(player["stats"].get(row["field"]) is None, f"Unmasked player conflict: {game_id}/{pid}/{row['field']}")
            elif row["scope"] == "team":
                require(report["stats"][row["team"]].get(row["field"]) is None, f"Unmasked team conflict: {game_id}/{row['field']}")
            elif row["scope"] == "event":
                require(report.get(row["field"]) is None, f"Unmasked event conflict: {game_id}/{row['field']}")
            require(row["resolution"] == ("disclosed-alias" if row["scope"] == "venue" else "unavailable"), f"Catalog resolution: {game_id}/{ordinal}")
        reports[game_id] = {"context": {k: report.get(k) for k in CONTEXT}, "scores": {k: report[k] for k in ("home_score", "away_score")}, "bodySha256": entry["sha256"], "factsSha256": digest(stripped(report)), "retrievedAt": report["retrievedAt"], "sections": {k: digest(stripped(report.get(k))) for k in ("quarters", "stats", "players", "drives", "plays", "scoringPlays", "availability", "disagreements", "kickoffUtc", "venue", "neutralSite")}}
        if game_id == DAL_ID:
            dal_facts = {k: report[k] for k in [*CONTEXT, "home_score", "away_score", "quarters", "stats"]}
    require(len(index["eventIdToGameId"]) == len(reports), "Ambiguous ESPN event aliases")
    require(index["coverage"]["reports"] == len(reports) and index["coverage"]["completedGames"] == len(linked), "Coverage count binding")
    require(index["coverage"]["retainedArchiveReports"] == len(set(reports) - set(linked)), "Retained archive count binding")
    failures = [{"gameId": g, "revalidation": e["revalidation"]} for g, e in index["games"].items() if e.get("revalidation", {}).get("status") == "unavailable"]
    return {"createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "indexSha256": sha(raw_index), "coreSha256": sha(core_body), "indexGeneratedAt": index["generatedAt"], "season": index["season"], "currentWeek": index["currentWeek"], "dependencies": index["dependencies"], "reportCount": len(reports), "linkedGameIds": sorted(linked), "catalogCount": len(catalog), "trueConflictCount": sum(r["scope"] != "venue" for r in catalog), "venueLabelCount": sum(r["scope"] == "venue" for r in catalog), "catalogReadingsSha256": digest([{k: r.get(k) for k in ("gameId", "scope", "team", "field", "playerEspnId", "playerGsisId", "values", "readings")} for r in catalog]), "quarterChecks": quarter_checks, "checks": checks, "reports": reports, "knownDallasFacts": locals().get("dal_facts"), "retainedRevalidationFailures": failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[4])
    parser.add_argument("--baseline", type=pathlib.Path, default=pathlib.Path(__file__).with_name("reviewed-baseline.json"))
    parser.add_argument("--capture-baseline", action="store_true", help="Record the already reviewed local snapshot; never overwrite")
    parser.add_argument("--output", type=pathlib.Path, required=True, help="New immutable evidence file; never app data")
    parser.add_argument("--max-reports", type=int, default=800)
    parser.add_argument("--max-detail-bytes", type=int, default=2 * 1024 * 1024)
    args = parser.parse_args()
    repo = args.repo.resolve()
    output = args.output.resolve()
    if output.exists() or (repo / "assets").resolve() in output.parents:
        parser.error("Choose a NEW output file outside application assets")
    result = {"createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "scope": "offline bounded report refresh comparison; no network, production mutation or native browser"}
    code = 0
    try:
        current = validate(repo, args.max_reports, args.max_detail_bytes)
        if args.capture_baseline:
            result = current
            result["qualification"] = "Already independently reviewed sporting facts; refreshed metadata alone is not a new authoritative-source audit"
        else:
            baseline_body, baseline = read(args.baseline, 8 * 1024 * 1024)
            before, after = baseline["reports"], current["reports"]
            removed = sorted(set(before) - set(after))
            if removed:
                raise ValueError(f"Previously addressable reports disappeared: {removed}")
            changed_context = [g for g in before if before[g]["context"] != after[g]["context"]]
            if changed_context:
                raise ValueError(f"Existing selected-event identities changed: {changed_context}")
            metadata = [g for g in before if before[g]["bodySha256"] != after[g]["bodySha256"] and before[g]["factsSha256"] == after[g]["factsSha256"]]
            facts = [{"gameId": g, "changedSections": [k for k in before[g]["sections"] if before[g]["sections"][k] != after[g]["sections"][k]], "beforeScores": before[g]["scores"], "afterScores": after[g]["scores"], "beforeBodySha256": before[g]["bodySha256"], "afterBodySha256": after[g]["bodySha256"]} for g in before if before[g]["factsSha256"] != after[g]["factsSha256"]]
            added = sorted(set(after) - set(before))
            catalog_changed = baseline["catalogReadingsSha256"] != current["catalogReadingsSha256"]
            needs_review = bool(facts or added or catalog_changed or current["retainedRevalidationFailures"] or baseline["knownDallasFacts"] != current["knownDallasFacts"])
            result.update(status="needs_targeted_data_review" if needs_review else "passed", baselineSha256=sha(baseline_body), current={k: v for k, v in current.items() if k != "reports"}, metadataOnlyChangedReports=metadata, sportingFactChanges=facts, newReportIds=added, knownDallasFactsMatch=baseline["knownDallasFacts"] == current["knownDallasFacts"], catalogReadingsChanged=catalog_changed, requiredFollowup="Independently corroborate only new/changed event facts against freshly retrieved authoritative source bytes with honest receipt timestamps; source metadata or matching checksums alone is not proof of new sporting facts." if needs_review else None)
            code = 2 if needs_review else 0
    except (OSError, ValueError, KeyError, TypeError, StopIteration) as exc:
        result.update(status="failed", error=str(exc))
        code = 1
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(json.dumps({"status": result.get("status", "baseline_captured"), "output": str(output), "outputSha256": sha(output.read_bytes()), "reports": len(result.get("reports", {})) or result.get("current", {}).get("reportCount", 0), "exitCode": code}, indent=2))
    return code


if __name__ == "__main__":
    sys.exit(main())
