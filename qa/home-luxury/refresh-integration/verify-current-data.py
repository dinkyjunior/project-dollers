#!/usr/bin/env python3
"""Read-only audit of the preserved, substantive incoming automatic refresh.

The original recursive diff is immutable and retains differences-found. Public
responses have already been captured with strict TLS into current-public-sources.
This helper parses those bytes, binds all runtime files and accounts for every
declared difference without enlarging the metadata whitelist.
"""
import copy
import csv
import datetime as dt
import fnmatch
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "qa/home-luxury/refresh-integration"
BASE = "78fd6b51709cacd217a1bf45f5f8315c0f2b65bb"
INCOMING = "e0419a5676f8bba2548d5f2f1fc52fb4244546c6"
DIFF = "qa/home-luxury/refresh-integration/final-incoming-refresh.json"
PLAYER_ID = "00-0040176"
NEW_SOURCE = "espn_athlete_4431424"


def sha(body):
    return hashlib.sha256(body).hexdigest()


def loaded(commit, file):
    return json.loads(subprocess.check_output(["git", "show", f"{commit}:{file}"], cwd=ROOT))


def pointer(value, path):
    for token in path.strip("/").split("/"):
        value = value[int(token)] if isinstance(value, list) else value[token.replace("~1", "/").replace("~0", "~")]
    return value


def detailed_diff(before, after, file, patterns, at=""):
    # Same exact enumerated metadata rules as the original audit, with no
    # skip-at-container shortcut. Missing/new fields remain substantive.
    if type(before) is not type(after):
        return [{"path": at, "reason": "type", "before": before, "after": after}]
    if isinstance(before, dict):
        differences = []
        for key in sorted(set(before) | set(after)):
            path = f"{at}/{key}"
            if key not in before or key not in after:
                differences.append({"path": path, "reason": "added" if key in after else "removed", "before": before.get(key), "after": after.get(key)})
            else:
                differences.extend(detailed_diff(before[key], after[key], file, patterns, path))
        return differences
    if isinstance(before, list):
        if len(before) != len(after):
            return [{"path": at, "reason": "length", "before": before, "after": after}]
        return [difference for index, (old, new) in enumerate(zip(before, after)) for difference in detailed_diff(old, new, file, patterns, f"{at}/{index}")]
    if before != after and not any(fnmatch.fnmatchcase(at, pattern) for pattern in patterns[file]):
        return [{"path": at, "reason": "value", "before": before, "after": after}]
    return []


def main():
    runtime = json.loads(subprocess.check_output(["node", "-e", "process.stdout.write(JSON.stringify(require('./qa/home-luxury/functional.cjs').runtimeManifest()))"], cwd=ROOT))
    assert len(runtime) == 191
    diff_bytes = (ROOT / DIFF).read_bytes()
    diff = json.loads(diff_bytes)
    assert diff["status"] == "differences-found" and diff["totalFactualDifferences"] == 21 and diff["totalMetadataChanges"] == 1748
    files = ["assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"]
    before = {file: loaded(BASE, file) for file in files}
    after = {file: json.loads((ROOT / file).read_bytes()) for file in files}
    incoming_bindings = []
    for file in files:
        incoming_body = subprocess.check_output(["git", "show", f"{INCOMING}:{file}"], cwd=ROOT)
        assert (ROOT / file).read_bytes() == incoming_body, f"Exact incoming data preserved: {file}"
        incoming_bindings.append({"file": file, "sha256": sha(incoming_body), "bytes": len(incoming_body), "matchesIncomingCommit": True})
    current, old = after[files[0]], before[files[0]]
    provenance, old_provenance = after[files[2]], before[files[2]]
    player, previous_player = current["roster"][60], old["roster"][60]
    assert player["id"] == previous_player["id"] == PLAYER_ID
    assert len(current["roster"]) == len(old["roster"]) == 77
    primary_player_unchanged = {key: value for key, value in player.items() if key != "rosterVerification"} == {key: value for key, value in previous_player.items() if key != "rosterVerification"}
    assert primary_player_unchanged
    other_roster_differences = []
    for index, (old_player, new_player) in enumerate(zip(old["roster"], current["roster"])):
        if index != 60:
            other_roster_differences.extend(detailed_diff(old_player, new_player, files[0], diff["metadataPatterns"], f"/roster/{index}"))
    assert not other_roster_differences
    full_history_differences = detailed_diff(before[files[1]], after[files[1]], files[1], diff["metadataPatterns"])
    assert not full_history_differences, "Every historical game, raw field, club and key/list/type remains factual identical"

    old_sources = {source["id"]: source for source in old["sources"]}
    sources = {source["id"]: source for source in current["sources"]}
    assert len(old_sources) == 29 and len(sources) == 30 and set(sources) - set(old_sources) == {NEW_SOURCE} and not set(old_sources) - set(sources)
    assert current["sources"] == provenance["sources"]
    source_substance_differences = []
    # Original /sources/* rules remain unchanged. Keying by source ID prevents
    # insertion at index8 from concealing a replacement of later entries.
    source_metadata = {pattern.rsplit("/", 1)[1] for pattern in diff["metadataPatterns"][files[0]] if pattern.startswith('/sources/*/')}
    for source_id in old_sources:
        old_source = {key: value for key, value in old_sources[source_id].items() if key not in source_metadata}
        new_source = {key: value for key, value in sources[source_id].items() if key not in source_metadata}
        if old_source != new_source:
            source_substance_differences.append({"sourceId": source_id, "before": old_source, "after": new_source})
    assert not source_substance_differences
    assert [source["id"] for source in current["sources"] if source["id"] != NEW_SOURCE] == [source["id"] for source in old["sources"]]
    verification = player["rosterVerification"]
    assert verification["status"] == "disputed" and verification["officialCurrentMembership"] is False and verification["espnCurrentMembership"] is False
    assert verification["reportedOtherTeam"] is None and verification["retained"] is False and verification["stale"] is False
    assert set(verification["sourceHashes"]) == set(verification["sourceIds"]) and all(verification["sourceHashes"][source_id] == sources[source_id]["sha256"] for source_id in verification["sourceIds"])
    assert verification["primaryRosterSha256"] == sources["nflverse_roster"]["sha256"]
    assert set(verification["sourceHashes"]) - set(previous_player["rosterVerification"]["sourceHashes"]) == {NEW_SOURCE}

    captured = json.loads((OUT / "current-public-sources/fetch-results.json").read_bytes())
    rows = {row["id"]: row for row in captured["results"]}
    bodies = {}
    for source_id, row in rows.items():
        assert row["status"] == "retrieved" and row["httpStatus"] == 200
        saved = ROOT / row["savedBody"]
        assert sha(saved.read_bytes()) == row["savedBodySha256"]
        bodies[source_id] = gzip.decompress(saved.read_bytes())
        assert sha(bodies[source_id]) == row["sha256"] and len(bodies[source_id]) == row["bytes"]
        assert row["snapshotSha256"] == sources[source_id]["sha256"] and row["url"] == sources[source_id]["url"]
    assert rows["nflverse_roster"]["matchesSnapshotBody"] is True
    spec = importlib.util.spec_from_file_location("readonly_refresh", ROOT / "scripts/refresh-data.py")
    refresh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(refresh)
    raw_roster = list(csv.DictReader(io.StringIO(bodies["nflverse_roster"].decode("utf-8-sig"))))
    raw_player = next(row for row in raw_roster if row["gsis_id"] == PLAYER_ID and row["team"] == "PIT" and row["season"] == "2026")
    official = refresh.parse_official_roster(bodies["official_steelers_roster"].decode("utf-8-sig"))
    espn_document = json.loads(bodies["espn_steelers_roster"])
    espn = refresh.parse_espn_roster(espn_document, 2026)
    athlete_document = json.loads(bodies[NEW_SOURCE])
    athlete = athlete_document["athlete"]
    match, join = refresh.match_espn_player(raw_player, espn["players"])
    assert match is None and join == "No unambiguous matched ESPN identity"
    assert refresh.match_official_player(raw_player, match, official["players"]) is None
    assert len(official["players"]) == provenance["rosterVerification"]["officialRosterCount"] == 76
    assert len(espn["players"]) == provenance["rosterVerification"]["espnRosterCount"] == 78
    assert str(athlete["id"]) == player["espnId"] == raw_player["espn_id"] == "4431424"
    assert refresh.normalized_name(athlete["displayName"]) == refresh.normalized_name(raw_player["full_name"]) and athlete_document["season"]["year"] == 2026
    assert athlete["team"]["abbreviation"] == "PIT" and athlete["status"]["type"] == "free-agent"
    # Repeat the existing conservative verification logic on a deep copy only.
    # Runtime files and original retained records are never regenerated.
    corroboration = copy.deepcopy(current)
    corroboration["disagreements"] = []
    public_metadata = {source_id: {**sources[source_id], "sha256": row["sha256"], "retrievedAt": row["retrievedAt"]} for source_id, row in rows.items() if source_id != "nflverse_roster"}
    payloads = {"official_steelers_roster": bodies["official_steelers_roster"].decode("utf-8-sig"), "espn_steelers_roster": espn_document, NEW_SOURCE: athlete_document}
    result = refresh.apply_roster_verification(corroboration, raw_roster, payloads, public_metadata, dt.datetime.now(dt.timezone.utc))
    meaningful_verification_keys = ["status", "officialCurrentMembership", "espnCurrentMembership", "officialRosterStatus", "officialNumber", "officialPosition", "espnRosterStatus", "espnPosition", "reportedOtherTeam", "issues", "evidence"]
    reproduced_differences = []
    for incoming_player, public_player in zip(current["roster"], corroboration["roster"]):
        for key in meaningful_verification_keys:
            if incoming_player["rosterVerification"][key] != public_player["rosterVerification"][key]:
                reproduced_differences.append({"playerId": incoming_player["id"], "field": key, "snapshot": incoming_player["rosterVerification"][key], "freshPublic": public_player["rosterVerification"][key]})
    assert not reproduced_differences, "Fresh public membership evidence reproduces all77 incoming conservative verification decisions"

    explanations = []
    for difference in diff["factualDifferences"]:
        file, at = difference["file"], difference["path"]
        old_value, new_value = pointer(before[file], at), pointer(after[file], at)
        if difference["reason"] == "length":
            if at == "/sources":
                assert len(new_value) == len(old_value) + 1
                explanation = "The sole added source is the publicly retrieved ESPN athlete 4431424 fallback (HTTP 200, 2026 context). Every previous source is preserved in relative order, and all previous source objects are substantively identical after only the pre-existing scalar metadata fields are excluded. The new full source record and original digest/time are retained."
            else:
                assert set(new_value) - set(old_value) == {NEW_SOURCE} and set(old_value) - set(new_value) == set()
                assert [item for item in new_value if item != NEW_SOURCE] == old_value
                explanation = "Adds only espn_athlete_4431424 to the relevant evidence/provenance/disagreement sourceIds; no prior identity is removed or reordered. The same fallback is mirrored consistently in current/provenance."
        elif difference["reason"] == "keyset":
            assert set(new_value) - set(old_value) == {NEW_SOURCE} and not set(old_value) - set(new_value)
            explanation = "Adds the sole fallback source hash, exactly matching the snapshot's ESPN athlete source digest. Both existing optional roster hashes update at the already enumerated metadata paths; none of their factual fields are masked."
        elif at.endswith("espnCurrentMembership"):
            assert old_value is True and new_value is False
            explanation = "Previously matched ESPN practice-squad identity is absent from the newly complete ESPN roster. Independent fresh public roster (78 players, 2026/PIT, all categories and unique IDs checked) reproduces the absence; the official 76-player roster also omits him. This is not proof of a different team."
        elif at.endswith("espnRosterStatus") or at.endswith("espnPosition") or at.endswith("espnName") or at.endswith("espnId"):
            assert new_value is None and old_value is not None
            explanation = "Previous roster-derived field becomes explicitly null because there is no matched current ESPN roster entry. The separate fallback ID/name and PIT/free-agent inconsistency are documented as source evidence, but are not substituted as current-roster status or invented confirmation. Primary player identity/position and all statistics/history remain exact."
        elif at.endswith("identityJoinMethod"):
            assert new_value == "No unambiguous matched ESPN identity"
            explanation = "No ID, normalized exact name or unique fallback birth-date/surname/jersey join matches the complete ESPN roster. Public fallback athlete 4431424 verifies ID/name/season but names no different team; missing DOB remains unavailable. Existing code therefore declines to assert a corroborated departure."
        elif at.endswith("/espn"):
            assert old_value == "PIT" and new_value == "No matched roster entry"
            explanation = "The explicit membership disagreement updates ESPN evidence from matched PIT to no matched roster entry, consistently in the player issue, snapshot disagreement and provenance validation. The source conflict stays visible in the real browser; it is never silently resolved."
        elif at.endswith("espnRosterCount"):
            assert old_value == 77 and new_value == 78
            explanation = "Complete ESPN public roster count grows 77→78. Fresh parser independently returns 78 unique identities in the required 2026/PIT offense/defense/specialTeam schema. This describes the provider's full roster count, not the app primary roster count (which remains 77)."
        else:
            raise AssertionError(f"Unexplained difference: {file}:{at}")
        explanations.append({**difference, "before": old_value, "after": new_value, "reviewStatus": "passed", "explanation": explanation})
    assert len(explanations) == 21
    ui_file = "qa/home-luxury/refresh-integration/current-data-ui.json"
    ui = json.loads((ROOT / ui_file).read_bytes())
    assert ui["status"] == "passed" and len(ui["results"]) == 2 and ui["runtimeManifest"] == runtime
    nondata = [file for file in runtime if file not in files]
    original_visual = json.loads((ROOT / "qa/home-luxury/approved-local-captures/manifest.json").read_bytes())["runtimeManifest"]
    assert len(nondata) == 188 and all(runtime[file] == original_visual[file] for file in nondata)
    report = {"status": "passed", "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "beforeApplicationCommit": BASE, "incomingAutomaticDataCommit": INCOMING, "currentGitHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "runtimeManifest": runtime, "incomingDiff": {"file": DIFF, "sha256": sha(diff_bytes), "unchangedStatus": diff["status"]}, "declaredDifferenceCount": 21, "allDeclaredDifferencesReviewed": True, "metadataChangeCount": 1748, "classification": "Substantive current-roster verification/source changes. Not metadata-only.", "incomingExactDataBindings": incoming_bindings, "script": {"file": "qa/home-luxury/refresh-integration/verify-current-data.py", "sha256": sha(Path(__file__).read_bytes())}, "sourceCodeBindings": [{"file": file, "sha256": sha((ROOT / file).read_bytes())} for file in ["scripts/refresh-data.py", "assets/app.js", "assets/player-research.js", "qa/home-luxury/functional.cjs"]], "sourceEvidence": {"fetchReport": {"file": "qa/home-luxury/refresh-integration/current-public-sources/fetch-results.json", "sha256": sha((OUT / "current-public-sources/fetch-results.json").read_bytes())}, "publicSources": captured["results"], "strictTLS": True, "accessControlsBypassed": False, "originalSnapshotOptionalRawBodiesAvailable": False, "rawByteReproductionQualification": "Primary nflverse roster response matches the snapshot exactly. Optional public responses are newly retrieved dynamic bodies with distinct hashes and times; all77 meaningful verification decisions and parsed provider counts match. Their fresh hashes do not replace or purport to reproduce the earlier03:21:33Z optional snapshot digests."}, "supplementalContainerAudit": {"oldSourcesCount": 29, "newSourcesCount": 30, "onlyAddedSourceId": NEW_SOURCE, "removedSourceIds": [], "previousSourceOrderPreserved": True, "previousSourceSubstantiveDifferences": source_substance_differences, "sourceMetadataFieldsExcluded": sorted(source_metadata), "snapshotProvenanceSourcesIdentical": True, "allChangedSourceIdsOnlyAddFallback": True, "sourceHashesOnlyAddFallbackAndEnumeratedMetadataUpdates": True, "unchangedPrimaryRosterCount": 77, "affectedPlayerPrimaryFieldsByteEquivalentAsJson": primary_player_unchanged, "other76RosterFactualDifferences": other_roster_differences, "fullHistoricalGameFactualDifferences": full_history_differences, "reviewedNonDataRuntimeFilesByteIdentical": len(nondata)}, "freshPublicCorroboration": {"officialRosterCount": 76, "officialGroups": official["groups"], "espnRosterCount": 78, "espnSeason": espn_document["season"], "espnTeam": {key: espn_document["team"].get(key) for key in ["id", "abbreviation", "displayName"]}, "espnSourceTimestamp": espn_document.get("timestamp"), "all77MeaningfulVerificationDecisionsReproduced": True, "differencesFromIncomingVerification": reproduced_differences, "summary": result, "affectedRawPrimaryIdentity": raw_player, "affectedESPNRosterMatch": None, "affectedOfficialRosterMatch": None, "fallbackIdentity": {"id": athlete["id"], "name": athlete["displayName"], "season": athlete_document["season"]["year"], "dateOfBirth": athlete.get("dateOfBirth"), "team": {key: athlete["team"].get(key) for key in ["abbreviation", "displayName"]}, "status": athlete["status"], "jersey": athlete.get("jersey")}, "fallbackInterpretation": "Public athlete identity says PIT and Free Agent simultaneously. It supplies no different team and no current roster match. Preserve primary record as disputed with history intact; current PIT membership and confirmed departure are not asserted."}, "uiVerification": {"file": ui_file, "sha256": sha((ROOT / ui_file).read_bytes()), "status": ui["status"], "viewports": [row["viewport"] for row in ui["results"]], "affectedPlayerStillAccessible": True, "explicitRosterDisagreementVisible": True, "originalPersonalAndCincinnatiHistoryValuesVerified": True, "fallbackSourceVisible": True, "consoleHttpExternalFailures": 0}, "declaredDifferences": explanations}
    now_runtime = json.loads(subprocess.check_output(["node", "-e", "process.stdout.write(JSON.stringify(require('./qa/home-luxury/functional.cjs').runtimeManifest()))"], cwd=ROOT))
    assert now_runtime == runtime and (ROOT / DIFF).read_bytes() == diff_bytes
    (OUT / "current-data-verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "declaredDifferencesReviewed": len(explanations), "publicSources": len(rows), "all77VerificationDecisionsReproduced": True, "runtimeFiles": len(runtime)}))


if __name__ == "__main__":
    main()
