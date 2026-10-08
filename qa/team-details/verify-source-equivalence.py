"""Recompute a checksum-bound, explicitly reviewed games-source equivalence.

This is QA evidence, not a football source or runtime adapter. Raw market facts
changed. Only the complete projections actually consumed by this exact reviewed
application remain equal. Unconsumed market changes require their own complete
reviewed receipt; unrelated raw fields, consumed values and other sources fail.
"""
import argparse
import csv
import hashlib
import io
import json
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = "fe69378eb4a1fb9d7e766788b80410b6b568c834359bc9805c802820ed5d2e01"
OLD = "bca61696e892eba9679670d87648ac1b8c493a24d430b82d49d9490b8273b47d"
BASELINE = "cedf2ffbb9f313c2aa5f0f6d4246eb34a4c2d195"
TEAM = "fc77b349652f8894fe5478b6541f25d9de15b97e84fa3ea3ddae84e30d7187c4"
URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
MARKET_FIELDS = {"away_moneyline", "home_moneyline", "away_spread_odds", "home_spread_odds", "under_odds", "over_odds", "total_line", "spread_line"}
sha = lambda value: hashlib.sha256(value).hexdigest()
canonical = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def need(condition, message):
    if not condition:
        raise ValueError(message)


def file(value):
    need(isinstance(value, str), "Evidence path missing")
    path = PurePosixPath(value)
    need(not path.is_absolute() and ".." not in path.parts, "Evidence must remain inside repository")
    result = ROOT.joinpath(*path.parts)
    need(result.resolve().is_relative_to(ROOT.resolve()), "Evidence symlink leaves repository")
    return result


def load(value):
    return json.loads(file(value).read_bytes())


def pointer(value, parts):
    for part in parts:
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def leaf_diff(left, right, path):
    need(type(left) is type(right), "Changed JSON type: " + path)
    if isinstance(left, dict):
        need(set(left) == set(right), "Changed JSON keys: " + path)
        return [item for key in sorted(left) for item in leaf_diff(left[key], right[key], path + "/" + key)]
    if isinstance(left, list):
        need(len(left) == len(right), "Changed JSON length: " + path)
        return [item for i, (a, b) in enumerate(zip(left, right)) for item in leaf_diff(a, b, path + "/" + str(i))]
    return [] if left == right else [{"path": path, "kind": "value", "before": left, "after": right}]


def metadata(row):
    parts = row["path"].split("/"); key = parts[-1]
    if key in {"retrievedAt", "generatedAt", "scheduleRetrievedAt", "checkedAt", "refreshAfter"}:
        for value in (row["before"], row["after"]):
            need(isinstance(value, str) and datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None, "Invalid timestamp")
        return "metadata-timestamp"
    if key in {"sha256", "primaryRosterSha256", "snapshotSha256CanonicalJson", "playerHistorySha256"} or "sourceHashes" in parts or "currentSourceHashes" in parts:
        need(all(isinstance(v, str) and len(v) == 64 and set(v) <= set("0123456789abcdef") for v in (row["before"], row["after"])), "Invalid SHA metadata")
        return "metadata-content-hash"
    if key in {"etag", "lastModified", "bytes"} and "sources" in parts:
        need(all(type(v) is int and v >= 0 for v in (row["before"], row["after"])) if key == "bytes" else all(isinstance(v, str) for v in (row["before"], row["after"])), "Invalid source validator")
        return "metadata-source-validator"
    raise ValueError("Changed consumed football fact: " + row["path"])


def csv_rows(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    rows = list(reader)
    need(len(reader.fieldnames) == len(set(reader.fieldnames)), "Duplicate CSV columns")
    need(all(set(row) == set(reader.fieldnames) for row in rows), "CSV row shape differs")
    need(len({row["game_id"] for row in rows}) == len(rows), "Duplicate CSV identity")
    return reader.fieldnames, rows, {row["game_id"]: row for row in rows}


def numeric(value):
    return None if value in (None, "", "NA") else float(value)


def decimal(value):
    return None if value is None or value == 0 else round(1 + (value / 100 if value > 0 else 100 / abs(value)), 3)


def projected_market(row):
    away, home = numeric(row["away_moneyline"]), numeric(row["home_moneyline"])
    return {"status": "verified" if away is not None and home is not None else "unavailable", "awayMoneyline": away,
            "homeMoneyline": home, "awayDecimal": decimal(away), "homeDecimal": decimal(home),
            "spread": numeric(row["spread_line"]), "total": numeric(row["total_line"]),
            "kind": "Dataset line; sportsbook and line timestamp not supplied", "sourceId": "nflverse_games"}


def walk_games(value, path, rows, markets, referenced):
    if isinstance(value, dict):
        for key in ("id", "gameId", "game_id"):
            if isinstance(value.get(key), str) and value[key] in rows:
                referenced.add(value[key])
        if value.get("id") in rows and "odds" in value:
            row = rows[value["id"]]
            need(value["odds"] == projected_market(row), "Published market differs from raw version: " + path)
            need(value["home_team"] == row["home_team"] and value["away_team"] == row["away_team"], "Published market team differs")
            need(value["home_score"] == numeric(row["home_score"]) and value["away_score"] == numeric(row["away_score"]), "Published event score differs")
            need(value["season"] == int(row["season"]) and value["week"] == int(row["week"]), "Published event context differs")
            markets.append({"path": path, "id": value["id"], "odds": value["odds"]})
        for key, item in value.items():
            walk_games(item, path + "/" + key, rows, markets, referenced)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            walk_games(item, path + "/" + str(i), rows, markets, referenced)


def records(rows, teams, season, through):
    result = {team: {"w": 0, "l": 0, "ties": 0, "pointsFor": 0, "pointsAgainst": 0, "form": []} for team in teams}
    for row in sorted(rows, key=lambda item: (item["gameday"], int(item["week"]), item["game_id"])):
        if int(row["season"]) != season or row["game_type"] != "REG" or int(row["week"]) > through or numeric(row["home_score"]) is None or numeric(row["away_score"]) is None:
            continue
        for team, score, opponent in ((row["home_team"], numeric(row["home_score"]), numeric(row["away_score"])), (row["away_team"], numeric(row["away_score"]), numeric(row["home_score"]))):
            if team not in result:
                continue
            record = result[team]; outcome = "W" if score > opponent else "L" if score < opponent else "T"
            record[{"W": "w", "L": "l", "T": "ties"}[outcome]] += 1
            record["pointsFor"] += score; record["pointsAgainst"] += opponent; record["form"].append(outcome)
    return result


def recompute(receipt, original_path, published_path, classification=None):
    need(receipt.get("status") == "passed" and receipt.get("scope") == "checksum-bound-consumed-projection-equivalence", "Missing explicit qualified equivalence")
    need(receipt.get("sourceId") == "nflverse_games" and receipt.get("sourceUrl") == URL, "Only nflverse_games identity is authorized")
    incoming, published_sha = receipt.get("incomingCommit"), sha(file(published_path).read_bytes())
    need(receipt.get("baselineCommit") == BASELINE and isinstance(incoming, str) and len(incoming) == 40 and set(incoming) <= set("0123456789abcdef"), "Exact reviewed commits are required")
    need(sha(file(original_path).read_bytes()) == ORIGINAL, "Original reviewed runtime differs")
    need(receipt.get("originalRuntimeManifestSha256") == ORIGINAL and receipt.get("publishedRuntimeManifestSha256") == published_sha, "Equivalence runtime bounds differ")
    originals, published = load(original_path), load(published_path)
    need(len(originals) == len(published) == 231 and set(originals) == set(published), "Runtime path set differs")
    changed = sorted(name for name in published if originals[name] != published[name])
    need(changed == ["assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"], "Unexpected runtime delta")
    for name, digest in published.items():
        need(sha(file(name).read_bytes()) == digest, "Current runtime differs from exact published manifest: " + name)
    need(published["assets/data/team-details.json"] == TEAM, "Retained Dallas facts changed")
    current = load("assets/data/current.json"); team = load("assets/data/team-details.json")
    source_a = {s["id"]: s for s in current["sources"]}; source_b = {s["id"]: s for s in team["sources"]}
    new = source_a["nflverse_games"]["sha256"]
    need(new != OLD and len(new) == 64 and set(new) <= set("0123456789abcdef"), "The exception must bind an actual changed games-source checksum")
    raw = []
    for name, expected in (("before", OLD), ("after", new)):
        entry = receipt["rawSources"][name]
        body = file(entry["file"]).read_bytes(); need(entry["sha256"] == expected and sha(body) == expected, "Raw CSV pair differs: " + name)
        meta_bytes = file(entry["retrievalEvidence"]).read_bytes(); need(sha(meta_bytes) == entry["retrievalEvidenceSha256"], "Retrieval receipt differs")
        meta = json.loads(meta_bytes)
        need(meta["httpStatus"] == 200 and meta["sha256"] == expected and meta["bytes"] == len(body), "Raw source retrieval not exact HTTP 200")
        if name == "after":
            pinned = meta.get("providerCommit")
            exact_url = URL if not pinned else "https://raw.githubusercontent.com/nflverse/nfldata/" + pinned + "/data/games.csv"
            need(meta.get("strictTLS") is True and meta["url"] == exact_url and (not pinned or len(pinned) == 40 and set(pinned) <= set("0123456789abcdef")), "Exact verified public source retrieval differs")
        raw.append(csv_rows(body))
    columns, before, before_map = raw[0]; after_columns, after, after_map = raw[1]
    need(columns == after_columns and len(before) == len(after) == 7548 and [row["game_id"] for row in before] == [row["game_id"] for row in after], "Raw columns, ordering or identity set differ")
    changes = sorted((a["game_id"], col, a[col], b[col]) for a, b in zip(before, after) for col in columns if a[col] != b[col])
    need(changes and all(column in MARKET_FIELDS for _, column, _, _ in changes), "A raw nonmarket football/context/stat field changed")
    need(all(int(before_map[game]["season"]) == current["season"] and int(before_map[game]["week"]) == current["currentWeek"] and before_map[game]["game_type"] == "REG" and numeric(before_map[game]["home_score"]) is None and numeric(before_map[game]["away_score"]) is None for game, _, _, _ in changes), "Changed market cells are outside the reviewed upcoming-week scope")
    scoped = [row for row in before if row["game_type"] == "REG" and int(row["season"]) in (2025, 2026)]
    need(len(scoped) == 544, "Complete team-game scope differs")
    projection = lambda rows: [{col: row[col] for col in columns if col not in MARKET_FIELDS} for row in rows if row["game_type"] == "REG" and int(row["season"]) in (2025, 2026)]
    need(projection(before) == projection(after), "A complete team/context/stat projection changed")
    shared = sorted(set(source_a) & set(source_b)); need(len(shared) == 7 and "nflverse_games" in shared, "Shared provider scope differs")
    for identifier in shared:
        a, b = source_a[identifier], source_b[identifier]
        need(a.get("status") == b.get("status") == "verified" and a.get("url") == b.get("url"), "Shared source status/URL differs: " + identifier)
        need((a.get("sha256"), b.get("sha256")) == (new, OLD) if identifier == "nflverse_games" else a.get("sha256") == b.get("sha256"), "Another shared source checksum differs: " + identifier)
    teams = sorted(team["teams"]); need(len(teams) == 32, "Complete club scope missing")
    game_ids = sorted({game["id"] for club in team["teams"].values() for game in club["games"]})
    need(game_ids == sorted(row["game_id"] for row in scoped), "Team dataset does not cover complete 544 raw identities")
    need(all("odds" not in game for club in team["teams"].values() for game in club["games"]), "Team dataset unexpectedly consumes market fields")
    derived = []
    for season in (2025, 2026):
        for week in range(19):
            a = records(before, teams, season, week); b = records(after, teams, season, week)
            need(a == b, "Derived all-club records/points/form changed")
            derived.append({"season": season, "throughWeek": week, "records": a})
    actual_records = records(before, teams, current["season"], current["throughWeek"])
    for abbr, club in team["teams"].items():
        for key in ("w", "l", "ties", "pointsFor", "pointsAgainst", "form"):
            need(club["record"][key] == actual_records[abbr][key], "Published team record differs: " + abbr + "/" + key)
    market_versions = []; referenced = set()
    for rows_map in (before_map, after_map):
        markets = []
        for name in ("assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json", "assets/data/team-details.json"):
            walk_games(load(name), name, rows_map, markets, referenced)
        market_versions.append(markets)
    need(market_versions[0] == market_versions[1] and len(market_versions[0]) == 446, "Complete consumed core market projection changed")
    all_changes = []; before_data = {}
    for name in changed:
        old_bytes = subprocess.check_output(["git", "show", BASELINE + ":" + name], cwd=ROOT)
        need(sha(old_bytes) == originals[name], "Baseline data is not original accepted data")
        incoming_bytes = subprocess.check_output(["git", "show", incoming + ":" + name], cwd=ROOT)
        need(incoming_bytes == file(name).read_bytes(), "Current data is not the exact classified incoming commit")
        before_data[name] = json.loads(old_bytes)
        deltas = leaf_diff(before_data[name], load(name), name)
        for row in deltas:
            row["category"] = metadata(row)
        all_changes.extend(deltas)
    if classification is not None:
        need(classification.get("baselineCommit") == BASELINE and classification.get("incomingCommit") == incoming and classification.get("status") == "passed", "Classification identity/status differs")
        need(sorted(all_changes, key=lambda row: row["path"]) == sorted(classification["allChanges"], key=lambda row: row["path"]), "Classification is not the complete actual JSON delta")
        need(classification.get("DallasConsistency", {}).get("gamesSourceHashMatches") is False, "Raw unequal hashes cannot be labelled identical")
    return {"status": "passed", "scope": "checksum-bound-consumed-projection-equivalence", "rawWholeBodyHashesEqual": False,
            "rawBeforeSha256": OLD, "rawAfterSha256": new,
            "rawMarketFactChanges": len(changes), "rawChangedGameIds": sorted({row[0] for row in changes}), "rawChanges": [{"gameId": a, "column": b, "before": c, "after": d} for a, b, c, d in changes],
            "rawRows": 7548, "rawColumns": columns, "sameCompleteRawKeysSchemaAndOrder": True,
            "allOtherRawCellsEqual": True, "completeRegularGameCount": 544, "completeClubCount": 32,
            "nonmarketTeamProjectionSha256": sha(canonical(projection(before))), "all32DerivedRecordsAcross38SeasonWeeksSha256": sha(canonical(derived)),
            "consumedCoreMarketObjectCount": 446, "consumedCoreMarketGameCount": len({item["id"] for item in market_versions[0]}),
            "consumedCoreMarketProjectionSha256": sha(canonical(market_versions[0])), "consumedMarketGameIds": sorted({item["id"] for item in market_versions[0]}),
            "allReferencedGameIds": sorted(referenced), "unchangedOtherSharedSourceIds": sorted(set(shared) - {"nflverse_games"}),
            "consumedFootballAndStructureChanges": 0, "actualAppMetadataLeaves": len(all_changes), "actualAppMetadataCategories": dict(Counter(row["category"] for row in all_changes)),
            "originalRuntimeManifestSha256": ORIGINAL, "publishedRuntimeManifestSha256": published_sha,
            "retainedDallasDataSha256": TEAM,
            "qualification": "Raw market facts differ. Only the complete market/context projections actually consumed by this exact runtime are equal. All544 team-game identities/context projections and all32 records/forms remain equal. Existing Dallas source timestamps and bca checksum remain truthful; no claim that all possible market projections or raw source facts are equal."}


def verify(classification_path, original_path, published_path):
    classification = load(classification_path); binding = classification.get("sourceEquivalence")
    need(isinstance(binding, dict), "Changed games hash requires explicit equivalence receipt")
    receipt_bytes = file(binding["file"]).read_bytes(); need(sha(receipt_bytes) == binding["sha256"], "Equivalence receipt checksum differs")
    receipt = json.loads(receipt_bytes)
    extra_files = []
    for key in ("preservedFailedWholeBodyCoherence", *(["providerCommitHistory"] if "providerCommitHistory" in receipt else [])):
        entry = receipt[key]; evidence = file(entry["file"]).read_bytes()
        need(sha(evidence) == entry["sha256"], "Original source investigation evidence differs: " + key)
        extra_files.append(entry["file"])
        value = json.loads(evidence)
        if key == "preservedFailedWholeBodyCoherence":
            need(value.get("status") == "failed" and value.get("scope") == "original-seven-whole-source-hash-coherence", "Original source checksum failure was not preserved")
            need(value.get("incomingCommit") == receipt["incomingCommit"] and len(value.get("sharedProviders", [])) == 7, "Failed source audit scope differs")
            rows = {row["id"]: row for row in value["sharedProviders"]}
            need(rows["nflverse_games"]["wholeBodyHashesEqual"] is False and rows["nflverse_games"]["currentSourceSha256"] == receipt["rawSources"]["after"]["sha256"] and rows["nflverse_games"]["retainedDallasSourceSha256"] == OLD, "Failed source equality evidence is dishonest")
            need(all(row["sameSourceUrl"] and row["bothVerified"] and (row["wholeBodyHashesEqual"] if identifier != "nflverse_games" else not row["wholeBodyHashesEqual"]) for identifier, row in rows.items()), "Other failed-audit provider evidence differs")
        else:
            need(isinstance(value, list) and value and all(isinstance(row.get("sha"), str) and len(row["sha"]) == 40 for row in value), "Provider commit history differs")
    actual = recompute(receipt, original_path, published_path, classification)
    need(receipt.get("recomputed") == actual, "Equivalence receipt does not match independent recomputation")
    return {**actual, "evidenceFile": binding["file"], "evidenceSha256": binding["sha256"],
            "boundEvidenceFiles": [binding["file"], *extra_files, *[entry[key] for entry in receipt["rawSources"].values() for key in ("file", "retrievalEvidence")]]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--classification", required=True)
    parser.add_argument("--original-manifest", required=True)
    parser.add_argument("--published-manifest", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.classification, args.original_manifest, args.published_manifest), sort_keys=True))
    except Exception as exc:
        raise SystemExit("Source equivalence rejected: " + str(exc))
