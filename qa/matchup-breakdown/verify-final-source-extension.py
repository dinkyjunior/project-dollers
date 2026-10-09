#!/usr/bin/env python3
"""Verify fresh final-player data separately from the immutable local UI gate."""
import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("common_gate", HERE / "verify-upcoming-delta.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
BASE_REVIEW = "cbf0f904a02592b211804cab89e0bab4233cdfee0bf0a85de797b3f27d0de6bf"
BASE_GATE = "501931716b3bed8c2c3dcea56d5b7e6e0090a6a7d15e891d3b237b0f09ee3b50"
BASE_RUNTIME = "7029b78a4f0b76600eba6028763198d7538ff7e18376265100ce50e634755464"
CHANGES = {"assets/matchup-breakdown.js", *["assets/data/" + n + ".json" for n in
           ("current", "team-details", "matchup-breakdown", "player-history", "provenance")]}
CONTRACTS = ["default-future-route-reload", "explicit-final-header-reload",
             "completed-form-windows-and-reports", "source-exact-leaders-and-real-GP",
             "unresolved-final-QB-and-opponent-context", "team-form-final-summary-and-report",
             "native-upcoming-and-back", "future-QB-and-bulletin-scope"]
ROLES = {"default-week6", "final-week5-header", "final-week5-report", "final-week5-quarterbacks",
         "dallas-final-form", "returned-dallas-week6", "future-week6-lineup-closed",
         "future-dal-dated-depth-expanded", "future-dal-dated-depth-player-detail"}
SIZES = {(393, 852), (430, 896)}


def actual_native(ref, manifest, original_tests, runner, hosted):
    r = g.reference(ref)
    g.require(r["status"] == "passed" and r.get("completedAt") and r["browserClosed"] is True and
              all(r.get(k) is True for k in ("unchangedDuringQA", "testLogicUnchangedDuringQA",
                                            "originalTestLogicUnchangedDuringQA")),
              "Current source-native run incomplete")
    g.require(r["source"]["runtimeFiles"] == manifest and r["source"]["originalTestFiles"] == original_tests and
              r["source"]["matchupHash"] == manifest["assets/data/matchup-breakdown.json"] and
              r["source"]["helperSha256"] == runner["sha256"] and
              r["source"]["testFiles"] == {**original_tests, runner["path"]: runner["sha256"]},
              "Current source-native runtime/assertion identity mismatch")
    g.helpers(r["source"]["testFiles"])
    g.require(r["hosted"] is hosted and r["qualification"]["strictTLS"] is hosted and
              r["qualification"]["sourceSubstitution"] is False and
              r["qualification"]["clockSubstitution"] is False and
              r["qualification"]["DOMOrStyleSubstitution"] is False and
              (r["base"].startswith("https:") if hosted else r["base"].startswith("http://127.0.0.1:")),
              "Actual native local/HTTPS scope mismatch")
    g.require(r["contracts"] == CONTRACTS and len(r["results"]) == 2 and
              {(c["viewport"]["width"], c["viewport"]["height"]) for c in r["results"]} == SIZES,
              "Required eight contracts/two phone cases missing")
    inputs = 0
    for c in r["results"]:
        g.require(c["status"] == "passed" and c.get("completedAt") and
                  [row["contract"] for row in c["coverage"]] == CONTRACTS and
                  all(row["status"] == "passed" for row in c["coverage"]), "Actual case coverage incomplete")
        for key, rows in c["errors"].items():
            g.require(isinstance(rows, list) and
                      (all(row["error"] in ("net::ERR_ABORTED", "Load request cancelled") for row in rows)
                       if key == "cancelledNavigation" else not rows), "Actual native errors: " + key)
        g.require(len(c["nativeInputs"]) == 29 and
                  all(row["input"] in ("native-touch", "native-select") for row in c["nativeInputs"]),
                  "Required real native actions changed")
        g.require(c["coverage"][0]["selectedGame"] == "2026_06_DAL_GB" and
                  c["coverage"][0]["explicitOverride"] is None and
                  c["coverage"][1]["gameId"] == "2026_05_TB_DAL", "Default/final identity mismatch")
        player = c["coverage"][3]["finalPublishedPlayer"]
        g.require(len(player["fields"]) == 14 and len(player["values"]) == 14 and
                  player["sourceIds"] and player["links"], "Actual final player basic/source research absent")
        g.require(len(c["leaders"]) == 4 and {row["context"] for row in c["quarterbacks"]} == {"last5", "opponent"},
                  "Current totals/per-game or QB context coverage absent")
        dated = next(row for row in c["coverage"][-1]["bulletins"] if row["team"] == "DAL")
        g.require(dated["datedDepthBulletins"] and dated["expandedDatedOriginal"] and dated["datedDetailOriginal"],
                  "Native dated status disclosure/detail proof missing")
        for row in dated["datedDepthBulletins"]:
            g.require("Selected-game/week applicability unavailable" in row["text"] and
                      "2026 W6" not in row["text"] and "ESPN-reported INACTIVE" not in row["text"] and row["sourceIds"],
                      "Depth status promoted to selected game eligibility")
        inputs += len(c["nativeInputs"])
    originals = r["originals"]
    g.require(len(originals) == 18 and
              {(o["viewport"]["width"], o["role"]) for o in originals} == {(w, role) for w, _ in SIZES for role in ROLES} and
              all(o["naturalAnimationPhase"] is True and o["readiness"]["status"] == "passed" and
                  o["readiness"]["noStylesClockOrAnimationMutation"] is True for o in originals),
              "All untouched natural phone originals required")
    emitted = g.images(r, g.file(ref["path"]).parent)
    g.require(len(emitted) == 18, "Actual original emitter inventory mismatch")
    if hosted:
        served = r["servedRuntime"]
        g.require(len(served) == 235 and {row["file"] for row in served} == set(manifest) and
                  all(row["status"] == 200 and row["sha256"] == manifest[row["file"]] for row in served),
                  "Actual 235 decoded HTTPS identities differ")
        compression = r["actualFeedCompression"]
        g.require(compression["contentEncoding"] in ("gzip", "br") and
                  compression["sha256"] == manifest["assets/data/matchup-breakdown.json"] and
                  compression["bytes"] == len(g.file("assets/data/matchup-breakdown.json").read_bytes()) and
                  0 < int(compression["contentLength"]) < compression["bytes"],
                  "Actual encoded/decoded feed identity proof absent")
    return r, emitted, inputs


def inspect(doc, hosted=False):
    g.require(doc["status"] == "accepted" and doc.get("acceptedAt"), "Acceptance incomplete")
    g.require(doc["releaseGate"]["path"] == "qa/matchup-breakdown/verify-final-source-extension.py" and
              doc["releaseGate"]["sha256"] == g.SHA(Path(__file__).read_bytes()), "Gate logic changed")
    g.require(doc["acceptedBaselineReview"]["sha256"] == BASE_REVIEW and
              doc["actualBaselineGate"]["sha256"] == BASE_GATE, "Immutable accepted baseline chain rewritten")
    baseline = g.reference(doc["acceptedBaselineReview"])
    actual_baseline = g.reference(doc["actualBaselineGate"])
    g.require(actual_baseline["status"] == "passed" and actual_baseline["exitCode"] == 0 and
              actual_baseline["review"]["sha256"] == BASE_REVIEW, "Actual pre-extension baseline gate absent")
    before = g.reference(baseline["runtimeManifest"])
    manifest = g.reference(doc["runtimeManifest"])
    canonical = g.SHA(g.canonical(manifest))
    g.require(g.SHA(g.canonical(before)) == BASE_RUNTIME and len(manifest) == 235 and
              set(before) == set(manifest) and manifest == g.current_runtime() and
              canonical == doc["runtimeManifestSha256"], "Current runtime identity mismatch")
    g.require({p for p in before if before[p] != manifest[p]} == CHANGES,
              "Extension exceeds five coherent data files and the reviewed duplicate-note correction")
    old_reports = [g.reference(ref) for ref in baseline["nativeReports"]]
    original_tests = old_reports[0]["source"]["originalTestFiles"]
    g.require(len(original_tests) == 15 and all(r["source"]["originalTestFiles"] == original_tests for r in old_reports),
              "Original fifteen native helpers differ")
    g.helpers(original_tests)
    old_pictures = g.originals(baseline["originalScreenshots"])
    g.reviewers(baseline["reviewers"], BASE_RUNTIME, old_pictures,
                {(r["path"], r["sha256"]) for r in baseline["nativeReports"]})
    book = manifest["assets/data/matchup-breakdown.json"]
    math = g.reference(doc["currentMathematics"])
    g.require(math["status"] == "passed" and not math["failures"] and math["snapshotSha256"] == book and
              math["teams"] == 32 and math["windowsPerTeam"] == 48 and math["latestTeamWindowStates"] == 1536 and
              math["assertions"] >= 200000 and math["mathematicsIndependentlyVerified"] is True and
              math["statisticalProjectionEquivalent"] is False, "New independent current 1536-state arithmetic absent")
    g.reference(math["independentModel"], False)
    g.require(doc["currentMathematicsHelper"]["sha256"] == math["auditHelperSha256"], "Current math helper identity mismatch")
    g.reference(doc["currentMathematicsHelper"], False)
    source = g.reference(doc["currentSourceAudit"])
    source_manifest = g.reference(doc["currentSourceManifest"])
    g.require(source["status"] == "passed" and not source["failures"] and source["snapshotSha256"] == book and
              source["assertions"] >= 700000 and source["sourcesAudited"] >= 90 and
              source["sourceManifestSha256"] == doc["currentSourceManifest"]["sha256"] and
              source_manifest["snapshotSha256"] == book and
              source["checks"].get("rawCountingStat", 0) >= 250000 and
              source["checks"].get("independentFinalBasicCorroboration", 0) >= 1000 and
              source["checks"].get("depthBulletinScopeNeverInferred", 0) >= 20,
              "Actual archived primary/basic/depth source audit incomplete")
    g.require(doc["currentSourceAuditHelper"]["sha256"] == source["auditHelperSha256"], "Actual source auditor identity differs")
    g.reference(doc["currentSourceAuditHelper"], False)
    data = g.reference(doc["independentPlayerDataAudit"])
    g.require(data["status"] == "passed" and data["dataset"]["sha256"] == book and data["assertions"] >= 776 and
              data["expectedPlayerCount"] == 20 and data["primarySource"]["offensiveRows"] == 22,
              "Independent final ESPN20/NFL22 statistical checks incomplete")
    context = g.reference(doc["fixtureContextAudit"])
    g.require(context["status"] == "passed" and not context["failures"] and
              context["snapshotSha256"] == book and context["assertions"] >= 1500 and
              context["sourceManifestSha256"] == doc["currentSourceManifest"]["sha256"] and
              all(digest == manifest["assets/data/" + name] for name, digest in context["fiveSnapshotHashes"].items()) and
              doc["fixtureContextAuditHelper"]["sha256"] == context["auditHelperSha256"],
              "Current selected fixture/availability context audit absent")
    g.reference(doc["fixtureContextAuditHelper"], False)
    producer = g.reference(doc["producerFreeze"])
    g.require(producer["status"] == "passed-frozen-isolated-producer" and
              producer["noMoreProducerWrites"] is True and producer["sourceManifest"]["sha256"] == source["sourceManifestSha256"] and
              len(producer["fiveFiles"]) == 5 and all(
                  row["sha256"] == manifest["assets/data/" + Path(row["path"]).name] for row in producer["fiveFiles"]) and
              len(producer["actualCommands"]) == 7 and all(row["exitCode"] == 0 for row in producer["actualCommands"]) and
              producer["actualCommands"][-1]["tests"] == 33 and
              {row["command"] for row in producer["actualCommands"] if row["command"].endswith("--check")} ==
              {"python3 scripts/refresh-data.py --check", "python3 scripts/refresh-team-details.py --check",
               "python3 scripts/refresh-matchup-breakdown.py --check"},
              "Actual coherent producer three checks/33 tests incomplete")
    g.require(producer["directBodyArchives"] == source["sourcesAudited"] ==
              sum(bool(row.get("bodyPath")) for row in source_manifest["sources"]),
              "Actual current archive coverage differs from producer/source audit")
    g.reference(producer["parser"], False)
    g.reference(producer["tests"], False)
    native_reports, engines, pictures, inputs = set(), set(), set(), 0
    for ref in doc["nativeReports"]:
        r, emitted, count = actual_native(ref, manifest, original_tests, doc["nativeRunner"], False)
        engines.add(r["engine"])
        pictures |= emitted
        inputs += count
        native_reports.add((ref["path"], ref["sha256"]))
    g.require(len(doc["nativeReports"]) == 2 and engines == {"chromium", "webkit"}, "Both complete local engines required")
    common = g.originals(doc["originalScreenshots"])
    g.require(common == pictures and g.reference(doc["commonInventory"])["originalScreenshots"] == doc["originalScreenshots"],
              "Current both-engine common36 differs")
    g.reviewers(doc["reviewers"], canonical, common, native_reports)
    for ref in doc["buildAndUpdaterEvidence"]:
        proof = g.reference(ref)
        g.require(proof.get("status") == "passed", "Producer/updater check incomplete")
    injury = g.reference(doc["injuryContextRegression"])
    g.require(injury["status"] == "passed" and injury["unchangedDuringTests"] is True and
              injury["before"] == injury["after"] and len(injury["runs"]) == 2 and
              all(row["exitCode"] == 0 for row in injury["runs"]) and
              "tests 7" in injury["runs"][1]["stdout"] and "pass 7" in injury["runs"][1]["stdout"] and
              injury["after"]["assets/matchup-breakdown.js"] == manifest["assets/matchup-breakdown.js"] and
              injury["after"]["assets/data/matchup-breakdown.json"] == book and
              injury["after"][doc["nativeRunner"]["path"]] == doc["nativeRunner"]["sha256"],
              "Actual dated injury duplicate-note/qualification regressions missing")
    g.helpers(injury["after"])
    result = {"status": "passed", "runtimeManifestSha256": canonical, "runtimeFileCount": 235,
              "preservedRuntimeFiles": 229, "changedRuntimePaths": sorted(CHANGES),
              "currentMathematicsAssertions": math["assertions"], "currentTeamWindowStates": 1536,
              "currentArchivedSourceAssertions": source["assertions"], "sourceResponsesAudited": source["sourcesAudited"],
              "independentPlayerAssertions": data["assertions"], "localNativeInputs": inputs,
              "localCommonOriginals": len(common), "specialists": 6,
              "qualification": "New published final-player statistics receive separate acceptance; historical full suites and the completed UI-context gate are not relabeled current."}
    if hosted:
        local = g.reference(doc["acceptedLocalReview"])
        gate = g.reference(doc["actualLocalGate"])
        g.require(local["runtimeManifestSha256"] == canonical and gate["status"] == "passed" and gate["exitCode"] == 0 and
                  gate["review"]["sha256"] == doc["acceptedLocalReview"]["sha256"], "Prepublication current acceptance missing")
        r, emitted, count = actual_native(doc["hostedReport"], manifest, original_tests, doc["nativeRunner"], True)
        g.require(r["engine"] == "webkit", "Actual strict-TLS hosted WebKit required")
        originals = g.originals(doc["hostedOriginalScreenshots"])
        g.require(originals == emitted and
                  g.reference(doc["hostedCommonInventory"])["originalScreenshots"] == doc["hostedOriginalScreenshots"],
                  "All18 untouched hosted originals required")
        g.reviewers(doc["hostedReviewers"], canonical, originals,
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
