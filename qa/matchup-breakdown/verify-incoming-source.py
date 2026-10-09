#!/usr/bin/env python3
"""Validate a scheduled source integration without rewriting prior acceptance."""
import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("prior_gate", HERE / "verify-upcoming-delta.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
BASE = "4cef01219db146255b3df0021735458f4a62b3a1692adae561e1c468420859b4"
CURRENT = "753411933517ebf23a5822a6eab054f18bee59212552c740d80f8999df3f6f49"
BASE_REVIEW = "e8d5e956bcddfcda969f8871a7071718a6cdb14010bc2051f2f4e63719505472"
BASE_GATE = "317803dd953bfe228200f551c2bc5df37ff7d20f397f74b543b014ba8ecf9449"
BEFORE_BOOK = "5f74fb4648db53bea09dc64936dd1b5909a6ae91078216edcfc27f5a2cf2149a"
AFTER_BOOK = "e2f6f7ce3296e0835db717b5f7d4eb415898009f09d060a3d853778b8c001401"
CHANGED = {"assets/data/" + n + ".json" for n in
           ("current", "team-details", "matchup-breakdown", "player-history", "provenance")}
GROUPS = {("DAL", "2026_05_TB_DAL", "players"),
          ("DAL", "2026_06_DAL_GB", "currentTeamBulletin")}


def clean_errors(value):
    g.require(isinstance(value, dict), "Missing browser error record")
    for key, rows in value.items():
        if key != "cancelledNavigation":
            g.require(isinstance(rows, list) and not rows, "Browser errors: " + key)


def completed(ref, manifest):
    r = g.reference(ref)
    g.require(r.get("status") == "passed" and r.get("completedAt") and
              r.get("browserClosed") is True and r.get("unchangedDuringQA") is True,
              "Incomplete current native report")
    g.require(r["source"]["runtimeFiles"] == manifest, "Wrong current report runtime")
    g.helpers(r["source"]["testFiles"])
    if "helperSha256" in r["source"]:
        helper = {"headerReport": "incoming-live-header.cjs",
                  "injuryDetailReport": "incoming-injury-detail.cjs"}
        name = helper[ref["role"]]
        g.require(g.SHA((HERE / name).read_bytes()) == r["source"]["helperSha256"],
                  "Supplement helper changed")
    g.require(len(r["results"]) == 2 and
              {(c["viewport"]["width"], c["viewport"]["height"]) for c in r["results"]}
              == {(393, 852), (430, 896)}, "Both phone cases required")
    for c in r["results"]:
        g.require(c.get("status") == "passed", "Current phone incomplete")
        clean_errors(c["errors"])
    return r


def inspect(doc):
    g.require(doc.get("status") == "accepted" and doc.get("acceptedAt"), "Acceptance incomplete")
    g.require(doc["baseHostedAcceptance"]["sha256"] == BASE_REVIEW and
              doc["baseHostedGate"]["sha256"] == BASE_GATE, "Prior acceptance rewritten")
    previous = g.reference(doc["baseHostedAcceptance"])
    previous_gate = g.reference(doc["baseHostedGate"])
    g.require(previous_gate["status"] == "passed" and previous_gate["exitCode"] == 0 and
              previous_gate["review"]["sha256"] == BASE_REVIEW, "Prior actual gate did not pass")
    old = g.reference(previous["runtimeManifest"])
    manifest = g.reference(doc["runtimeManifest"])
    g.require(g.SHA(g.canonical(old)) == BASE and g.SHA(g.canonical(manifest)) == CURRENT and
              doc["runtimeManifestSha256"] == CURRENT, "Runtime manifest identity mismatch")
    g.require(len(manifest) == 235 and manifest.keys() == old.keys() and
              g.current_runtime() == manifest, "Actual current runtime differs")
    g.require({k for k in old if old[k] != manifest[k]} == CHANGED,
              "Changes exceed the five scheduled source files")
    prior_host = g.reference(previous["hostedReport"])
    g.require(prior_host["status"] == "passed" and prior_host["completedAt"] and
              prior_host["source"]["runtimeFiles"] == old, "Prior host binding mismatch")
    g.helpers(prior_host["source"]["testFiles"])
    prior_common = g.originals(previous["hostedOriginalScreenshots"])
    g.reviewers(previous["hostedReviewers"], BASE, prior_common,
                {(previous["hostedReport"]["path"], previous["hostedReport"]["sha256"])})

    projection = g.reference(doc["projectionEquivalence"])
    g.require(projection["status"] == "passed" and not projection["failures"] and
              projection["statisticalProjectionEquivalent"] is True and
              projection["availabilityEquivalent"] is False and
              projection["assertions"] == 206813 and
              projection["totalTeamWindowBranches"] == 1536 and projection["teams"] == 32,
              "Independent statistical equivalence absent")
    g.require(projection["beforeSnapshotSha256"] == BEFORE_BOOK and
              projection["afterSnapshotSha256"] == AFTER_BOOK and
              manifest["assets/data/matchup-breakdown.json"] == AFTER_BOOK,
              "Statistical proof input mismatch")
    g.reference(projection["independentModel"], False)
    g.require(g.SHA((HERE / "reviews/source-evidence/audit-incoming-3735200-projected-equivalence.cjs").read_bytes())
              == projection["auditHelperSha256"], "Independent audit helper changed")
    classification = g.reference(doc["sourceClassification"])
    g.require(classification["status"] == "classified" and
              classification["beforeSha256"] == BEFORE_BOOK and
              classification["afterSha256"] == AFTER_BOOK and
              classification["materialChangeCount"] == 19 and
              len(classification["materialChanges"]) == 19,
              "Material source changes not independently classified")

    reports, emitted, native_inputs, engines = set(), set(), 0, set()
    for ref in doc["nativeReports"]:
        r = completed(ref, manifest)
        engines.add(r["engine"])
        g.require(r["testLogicUnchangedDuringQA"] is True and
                  r["originalTestLogicUnchangedDuringQA"] is True and
                  r["source"]["originalTestFiles"] == prior_host["source"]["testFiles"],
                  "Original native assertions changed")
        if r["engine"] == "webkit":
            g.require(r["base"].startswith("https:") and r["qualification"]["strictTLS"] is True,
                      "Actual strict-TLS WebKit proof required")
        else:
            g.require(r["engine"] == "chromium" and r["base"].startswith("http://127.0.0.1:"),
                      "Current Chromium scope must be qualified local")
        for c in r["results"]:
            g.require(c.get("completedAt") and len(c["nativeInputs"]) == 4 and
                      {(v["team"], v["gameId"], v["field"]) for v in c["availabilityCoverage"]} == GROUPS,
                      "Changed availability/native routing coverage missing")
            native_inputs += len(c["nativeInputs"])
        reports.add((ref["path"], ref["sha256"]))
        emitted.update(g.images(r["results"], g.file(ref["path"]).parent))
    g.require(engines == {"chromium", "webkit"}, "Both genuine engines required")
    for role in ("headerReport", "injuryDetailReport"):
        ref = {**doc[role], "role": role}
        r = completed(ref, manifest)
        g.require(r["engine"] == "webkit" and r["hosted"] is True and
                  r["qualification"]["strictTLS"] is True and
                  r["source"]["testFiles"] == prior_host["source"]["testFiles"],
                  "Strict hosted supplement binding mismatch")
        for c in r["results"]:
            if role == "headerReport":
                text = " ".join(c["text"].split())
                g.require(all(v in text for v in ("TB 24–16 DAL", "5:26", "4th", "In Progress", "Provider snapshot")),
                          "Actual visible new source header mismatch")
            else:
                g.require(len(c["nativeInputs"]) == 1 and "Alijah Clark" in c["text"] and
                          "Questionable" in c["text"] and "ESPN-reported INACTIVE" not in c["text"],
                          "Actual Clark row/native activation mismatch")
                native_inputs += len(c["nativeInputs"])
        if role == "headerReport":
            served = r["servedRuntime"]
            g.require(len(served) == 235 and {x["file"] for x in served} == set(manifest), "Every actual served body required")
            for row in served:
                g.require(row["status"] == 200 and row["sha256"] == manifest[row["file"]], "Actual hosted body mismatch")
            comp = r["actualFeedCompression"]
            g.require(comp["contentEncoding"] == "gzip" and int(comp["contentLength"]) == 1460270 and
                      comp["bytes"] == 27891861 and comp["sha256"] == AFTER_BOOK, "Genuine gzip identity mismatch")
        reports.add((ref["path"], ref["sha256"]))
        emitted.update(g.images(r["results"], g.file(ref["path"]).parent))

    failed = g.reference(doc["failedTransportReport"])
    g.require(failed["status"] == "failed" and "ERR_CERT_AUTHORITY_INVALID" in failed["failure"]["message"] and
              not failed["coverage"], "Failed pre-app transport evidence was relabelled")
    inventory = g.reference(doc["commonInventory"])
    g.require(inventory["originalScreenshots"] == doc["originalScreenshots"], "Common inventory mismatch")
    originals = g.originals(doc["originalScreenshots"])
    g.require(len(originals) == 16 and originals == emitted, "All actual emitted originals required")
    g.reviewers(doc["reviewers"], CURRENT, originals, reports)
    return {"status": "passed", "runtimeManifestSha256": CURRENT, "runtimeFileCount": 235,
            "preservedRuntimeFiles": 230, "changedRuntimePaths": sorted(CHANGED),
            "statisticalAssertions": 206813, "statisticalProjectionBranches": 1536,
            "materialSourceLeaves": 19, "currentNativeInputs": native_inputs,
            "currentOriginals": 16, "specialists": 6, "actualHTTPSBodies": 235,
            "qualification": "Historical acceptance remains immutable; new source status/availability receives separate native and actual HTTPS verification."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(json.loads(g.file(args.review).read_bytes())), indent=2))
