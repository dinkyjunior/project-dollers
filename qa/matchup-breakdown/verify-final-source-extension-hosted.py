#!/usr/bin/env python3
"""Separate strict-HTTPS gate: capture emitter rows and served asset rows have distinct roles."""
import argparse
import importlib.util
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("local_gate", HERE / "verify-final-source-extension.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
g = v.g
CONTRACTS, ROLES, SIZES = v.CONTRACTS, v.ROLES, v.SIZES
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
    emitted = g.images(r["originals"], g.file(ref["path"]).parent)
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

def inspect(doc):
    g.require(doc["hostedReleaseGate"]["path"] == "qa/matchup-breakdown/verify-final-source-extension-hosted.py" and
              doc["hostedReleaseGate"]["sha256"] == g.SHA(Path(__file__).read_bytes()), "Hosted gate logic changed")
    local = g.reference(doc["acceptedLocalReview"])
    gate = g.reference(doc["actualLocalGate"])
    g.require(gate["status"] == "passed" and gate["exitCode"] == 0 and
              gate["review"]["sha256"] == doc["acceptedLocalReview"]["sha256"], "Actual prepublication local gate absent")
    for key, value in local.items():
        if key not in ("acceptedAt", "qualification"):
            g.require(doc[key] == value, "Accepted local evidence changed: " + key)
    result = v.inspect(local, False)
    manifest = g.reference(doc["runtimeManifest"])
    original = g.reference(doc["nativeReports"][0])["source"]["originalTestFiles"]
    r, emitted, count = actual_native(doc["hostedReport"], manifest, original, doc["nativeRunner"], True)
    g.require(r["engine"] == "webkit", "Actual strict-TLS WebKit required")
    pictures = g.originals(doc["hostedOriginalScreenshots"])
    g.require(pictures == emitted and
              g.reference(doc["hostedCommonInventory"])["originalScreenshots"] == doc["hostedOriginalScreenshots"],
              "All18 actual hosted capture originals required")
    g.reviewers(doc["hostedReviewers"], doc["runtimeManifestSha256"], pictures,
                {(doc["hostedReport"]["path"], doc["hostedReport"]["sha256"])})
    result.update({"hosted": True, "hostedNativeInputs": count, "hostedCommonOriginals": len(pictures),
                   "actualHTTPSBodies": len(r["servedRuntime"]), "actualFeedCompression": r["actualFeedCompression"],
                   "qualification": "Immutable accepted local chain plus genuine strict-TLS hosted native coverage. Capture emitter inventory and served asset identities are validated separately; all earlier scope/assertions retained."})
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(json.loads(g.file(args.review).read_bytes())), indent=2))
