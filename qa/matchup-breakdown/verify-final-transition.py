#!/usr/bin/env python3
"""Validate current completed-game/native injury scope; retain historical gates."""
import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("historical_gate", HERE / "verify-upcoming-delta.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
PRIOR_REVIEW = "32b32e9f92e82662a0a978fa928ca2b67d0c95026ede00048e43f225832497c1"
PRIOR_GATE = "51fa714b7f8fe344278653430a5906a1d42912a6aa0e386452596d00b9228a9b"
PRIOR_RUNTIME = "753411933517ebf23a5822a6eab054f18bee59212552c740d80f8999df3f6f49"
BOOK = "05e170530516f1df16978be1a0d31f38994332eec088bb23a17e860e7ce7439e"
CHANGED = {"assets/matchup-breakdown.js", *["assets/data/" + n + ".json" for n in
           ("current", "team-details", "matchup-breakdown", "player-history", "provenance")]}
CONTRACTS = ["default-future-route-reload", "explicit-final-header-reload",
             "completed-form-windows-and-reports", "source-exact-leaders-and-real-GP",
             "unresolved-final-QB-and-opponent-context", "team-form-final-summary-and-report",
             "native-upcoming-and-back", "future-QB-and-bulletin-scope"]
SIZES = {(393, 852), (430, 896)}


def errors(value):
    g.require(isinstance(value, dict), "Missing actual error collections")
    for key, rows in value.items():
        g.require(isinstance(rows, list), "Invalid native error schema")
        if key == "cancelledNavigation":
            g.require(all(row["error"] in ("net::ERR_ABORTED", "Load request cancelled") for row in rows),
                      "Unclassified request cancellation")
        else:
            g.require(not rows, "Actual browser errors: " + key)


def actual_report(ref, manifest, original_tests, runner, hosted):
    r = g.reference(ref)
    g.require(r.get("status") == "passed" and r.get("completedAt") and
              r.get("browserClosed") is True and r.get("unchangedDuringQA") is True and
              r.get("testLogicUnchangedDuringQA") is True and
              r.get("originalTestLogicUnchangedDuringQA") is True, "Incomplete actual native run")
    g.require(r["source"]["runtimeFiles"] == manifest and
              r["source"]["originalTestFiles"] == original_tests and
              r["source"]["matchupHash"] == BOOK and
              r["source"]["helperSha256"] == runner["sha256"] and
              r["source"]["testFiles"] == {**original_tests, runner["path"]: runner["sha256"]},
              "Actual runtime/native assertion identity changed")
    g.helpers(r["source"]["testFiles"])
    g.require(r["contracts"] == CONTRACTS and len(r["results"]) == 2 and
              {(c["viewport"]["width"], c["viewport"]["height"]) for c in r["results"]} == SIZES,
              "Required contracts/phone cases missing")
    g.require(r["hosted"] is hosted and r["qualification"]["strictTLS"] is hosted,
              "Actual local/hosted scope mislabeled")
    g.require(r["base"].startswith("https:") if hosted else r["base"].startswith("http://127.0.0.1:"),
              "Actual native origin scope mismatch")
    count = 0
    for c in r["results"]:
        g.require(c["status"] == "passed" and c.get("completedAt") and
                  [x["contract"] for x in c["coverage"]] == CONTRACTS and
                  all(x["status"] == "passed" for x in c["coverage"]), "Native coverage incomplete")
        errors(c["errors"])
        g.require(len(c["nativeInputs"]) >= 28 and
                  all(row["input"] in ("native-touch", "native-select") for row in c["nativeInputs"]),
                  "Genuine source/route/disclosure actions missing")
        future = c["coverage"][-1]
        dated = next(row for row in future["bulletins"] if row["team"] == "DAL")
        g.require(len(dated["datedDepthBulletins"]) == 20 and
                  not dated["knownSelectedInjuries"] and
                  dated.get("expandedDatedOriginal") and dated.get("datedDetailOriginal"),
                  "Dated depth context/actual native originals missing")
        for row in dated["datedDepthBulletins"]:
            g.require("2026 W6" not in row["text"] and "ESPN-reported INACTIVE" not in row["text"] and
                      row["sourceIds"] == ["espn_matchup_depth_DAL"], "Depth bulletin promoted to future eligibility")
        count += len(c["nativeInputs"])
    roles = {"default-week6", "final-week5-header", "final-week5-report",
             "final-week5-unresolved-quarterbacks", "dallas-final-form", "returned-dallas-week6",
             "future-week6-lineup-closed", "future-dal-dated-depth-expanded",
             "future-dal-dated-depth-player-detail"}
    g.require(len(r["originals"]) == 18 and
              {(o["viewport"]["width"], o["role"]) for o in r["originals"]} ==
              {(w, role) for w, _ in SIZES for role in roles} and
              all(o["naturalAnimationPhase"] is True and o["readiness"]["status"] == "passed" and
                  o["readiness"]["noStylesClockOrAnimationMutation"] is True for o in r["originals"]),
              "Every actual natural phone-original role required")
    # Report-modal originals are retained in the runner's explicit originals
    # collection; the other sixteen are additionally nested in coverage.
    emitted = g.images(r, g.file(ref["path"]).parent)
    g.require(len(emitted) == len(r["originals"]) and emitted, "Actual natural original inventory incomplete")
    if hosted:
        served = r["servedRuntime"]
        g.require(len(served) == len(manifest) and {row["file"] for row in served} == set(manifest),
                  "Every actual HTTPS body required")
        for row in served:
            g.require(row["status"] == 200 and row["sha256"] == manifest[row["file"]], "Actual HTTPS body mismatch")
        comp = r["actualFeedCompression"]
        g.require(comp["contentEncoding"] in ("gzip", "br") and comp["sha256"] == BOOK and
                  comp["bytes"] == len(g.file("assets/data/matchup-breakdown.json").read_bytes()) and
                  0 < int(comp["contentLength"]) < comp["bytes"], "Actual compressed/decoded body identity missing")
    return r, emitted, count


def inspect(doc, hosted=False):
    g.require(doc.get("status") == "accepted" and doc.get("acceptedAt"), "Current acceptance incomplete")
    g.require(doc["releaseGate"]["path"] == "qa/matchup-breakdown/verify-final-transition.py" and
              doc["releaseGate"]["sha256"] == g.SHA(Path(__file__).read_bytes()), "Current gate logic changed")
    g.require(doc["previousAcceptance"]["sha256"] == PRIOR_REVIEW and
              doc["previousActualGate"]["sha256"] == PRIOR_GATE, "Immutable prior chain rewritten")
    old_doc = g.reference(doc["previousAcceptance"])
    old_gate = g.reference(doc["previousActualGate"])
    g.require(old_gate["status"] == "passed" and old_gate["exitCode"] == 0 and
              old_gate["review"]["sha256"] == PRIOR_REVIEW, "Historical actual gate incomplete")
    old = g.reference(old_doc["runtimeManifest"])
    manifest = g.reference(doc["runtimeManifest"])
    binding = g.SHA(g.canonical(manifest))
    g.require(g.SHA(g.canonical(old)) == PRIOR_RUNTIME and len(manifest) == 235 and
              manifest.keys() == old.keys() and binding == doc["runtimeManifestSha256"] and
              manifest == g.current_runtime(), "Actual current runtime identity differs")
    g.require({path for path in old if old[path] != manifest[path]} == CHANGED,
              "Current change exceeds five source JSON files and the reviewed injury-context module")
    g.require(manifest["assets/data/matchup-breakdown.json"] == BOOK, "Current independent source body mismatch")
    old_native = [g.reference(row) for row in old_doc["nativeReports"]]
    original_tests = old_native[0]["source"]["originalTestFiles"]
    g.require(len(original_tests) == 15 and all(r["source"]["originalTestFiles"] == original_tests for r in old_native),
              "Original fifteen assertion contract changed")
    g.helpers(original_tests)
    old_originals = g.originals(old_doc["originalScreenshots"])
    old_reports = {(row["path"], row["sha256"]) for row in
                   [*old_doc["nativeReports"], old_doc["headerReport"], old_doc["injuryDetailReport"]]}
    g.reviewers(old_doc["reviewers"], PRIOR_RUNTIME, old_originals, old_reports)

    math = g.reference(doc["currentMathematics"])
    g.require(math["status"] == "passed" and not math["failures"] and math["assertions"] == 223458 and
              math["teams"] == 32 and math["windowsPerTeam"] == 48 and math["latestTeamWindowStates"] == 1536 and
              math["mathematicsIndependentlyVerified"] is True and math["statisticalProjectionEquivalent"] is False and
              math["snapshotSha256"] == BOOK, "Current independent completed-window mathematics missing")
    g.reference(math["independentModel"], False)
    g.require(g.SHA(g.file(doc["currentMathematicsHelper"]["path"]).read_bytes()) == math["auditHelperSha256"] and
              doc["currentMathematicsHelper"]["sha256"] == math["auditHelperSha256"], "Current independent math helper mismatch")
    for ref in math["finalSourceReceipts"]:
        g.reference(ref)
    audit = g.reference(doc["currentDataAudit"])
    g.require(audit["status"] == "passed" and audit["assertions"] == 25597 and audit["snapshotSha256"] == BOOK and
              audit["sharedHistoricalStatisticalProjection3cTo699Preserved"] is True and
              audit["literalWholeBookEqualityClaimed"] is False, "Current source/data validation absent")
    g.require(len(audit["fiveImmutableFiles"]) == 5 and
              all(row["runtimeHashMatches"] is True and row["sha256"] == manifest["assets/data/" + row["name"]]
                  for row in audit["fiveImmutableFiles"]), "Source audit snapshot identities changed")
    for ref in audit["freshProviderReceipts"]:
        g.reference(ref)
    g.reference(doc["nativeRunner"], False)
    native_reports, engines, common, inputs = set(), set(), set(), 0
    for ref in doc["nativeReports"]:
        r, emitted, count = actual_report(ref, manifest, original_tests, doc["nativeRunner"], False)
        engines.add(r["engine"])
        native_reports.add((ref["path"], ref["sha256"]))
        inputs += count
        common.update(emitted)
    g.require(len(doc["nativeReports"]) == 2 and engines == {"chromium", "webkit"}, "Both local genuine engines required")
    current_originals = g.originals(doc["originalScreenshots"])
    g.require(current_originals == common and g.reference(doc["commonInventory"])["originalScreenshots"] == doc["originalScreenshots"],
              "All untouched current Chromium/WebKit common originals required")
    g.reviewers(doc["reviewers"], binding, current_originals, native_reports)
    for ref in doc.get("updaterEvidence", []):
        proof = g.reference(ref)
        g.require(proof.get("status") == "passed", "Updater context regression incomplete")
    updater = g.reference(doc["updaterContextRegression"])
    g.require(updater["immutableCurrentSnapshotSha256"] == BOOK and
              any(row.get("exitCode") == 0 and "Ran 28 tests" in row.get("stderr", "") and
                  row.get("stderr", "").rstrip().endswith("OK") for row in updater["results"]),
              "Actual bounded updater 28-test regression missing")
    injury = g.reference(doc["injuryContextRegression"])
    g.require(injury["status"] == "passed" and injury["actualExitCode"] == 0 and
              injury["tests"] == 6 and injury["unchangedDuringCheck"] is True and
              injury["runtimeAndTestFiles"]["assets/matchup-breakdown.js"] == manifest["assets/matchup-breakdown.js"],
              "Actual injury qualification/retention regressions missing")
    g.helpers(injury["runtimeAndTestFiles"])
    result = {"status": "passed", "runtimeManifestSha256": binding, "runtimeFileCount": 235,
              "preservedRuntimeFiles": 229, "changedRuntimePaths": sorted(CHANGED),
              "independentCurrentMathAssertions": 223458, "currentTeamWindowStates": 1536,
              "independentDataAssertions": 25597, "localNativeInputs": inputs,
              "localCommonOriginals": len(current_originals), "specialists": 6,
              "qualification": "Prior full suites remain historical; new completed windows and the bounded injury-context correction receive separate native verification."}
    if hosted:
        local = g.reference(doc["acceptedLocalReview"])
        actual_local = g.reference(doc["actualLocalGate"])
        g.require(local["runtimeManifestSha256"] == binding and actual_local["status"] == "passed" and
                  actual_local["exitCode"] == 0 and actual_local["review"]["sha256"] == doc["acceptedLocalReview"]["sha256"],
                  "Prepublication local acceptance incomplete")
        r, emitted, count = actual_report(doc["hostedReport"], manifest, original_tests, doc["nativeRunner"], True)
        g.require(r["engine"] == "webkit", "Genuine strict-TLS hosted WebKit required")
        originals = g.originals(doc["hostedOriginalScreenshots"])
        g.require(originals == emitted and g.reference(doc["hostedCommonInventory"])["originalScreenshots"] == doc["hostedOriginalScreenshots"],
                  "Every actual hosted common original required")
        g.reviewers(doc["hostedReviewers"], binding, originals,
                    {(doc["hostedReport"]["path"], doc["hostedReport"]["sha256"])})
        result.update({"hosted": True, "hostedNativeInputs": count, "hostedCommonOriginals": len(originals),
                       "actualHTTPSBodies": len(r["servedRuntime"]), "actualFeedCompression": r["actualFeedCompression"]})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", required=True)
    parser.add_argument("--hosted", action="store_true")
    args = parser.parse_args()
    print(json.dumps(inspect(json.loads(g.file(args.review).read_bytes()), args.hosted), indent=2))
