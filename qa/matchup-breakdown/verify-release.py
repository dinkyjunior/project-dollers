#!/usr/bin/env python3
"""Bind new-screen acceptance to actual application, native QA and six reviews."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "qa/matchup-breakdown"
REVIEWERS = {"visual", "controls", "data", "sources", "assets-motion", "qa"}
SHA = lambda body: hashlib.sha256(body).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def file(name):
    path = (ROOT / name).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), "Missing or outside-repository file: " + str(name))
    return path


def referenced(row):
    path = file(row["path"])
    require(SHA(path.read_bytes()) == row["sha256"], "Evidence byte mismatch: " + row["path"])
    return json.loads(path.read_text())


def runtime():
    paths = [ROOT / "index.html", *sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())]
    return {p.relative_to(ROOT).as_posix(): SHA(p.read_bytes()) for p in paths}


def emitted_images(value, directory):
    """Actual capture records emitted by a completed, source-bound browser run."""
    found = set()
    if isinstance(value, dict):
        name, digest = value.get("file"), value.get("sha256")
        if isinstance(name, str) and name.endswith(".png") and isinstance(digest, str):
            image = (directory / name).resolve()
            require(image.is_relative_to(ROOT), "Browser capture escaped the repository")
            found.add((image.relative_to(ROOT).as_posix(), digest))
        for child in value.values():
            found.update(emitted_images(child, directory))
    elif isinstance(value, list):
        for child in value:
            found.update(emitted_images(child, directory))
    return found


def inspect(document, hosted=False):
    require(document.get("status") == "accepted", "Release is not accepted")
    manifest = referenced(document["runtimeManifest"])
    require(manifest == runtime(), "Reviewed application differs from actual worktree")
    binding = SHA(canonical(manifest))
    require(document["runtimeManifestSha256"] == binding, "Manifest identity differs")
    required_files = {"assets/matchup-breakdown.js", "assets/matchup-breakdown.css",
                      "assets/matchup-breakdown-motion.js", "assets/data/matchup-breakdown.json"}
    require(required_files.issubset(manifest), "New-screen runtime is incomplete")
    snapshot = json.loads(file("assets/data/matchup-breakdown.json").read_text())
    require(snapshot["dependencies"]["currentSha256"] == manifest["assets/data/current.json"], "Core dependency differs")
    require(snapshot["dependencies"]["teamDetailsSha256"] == manifest["assets/data/team-details.json"], "Team dependency differs")
    inventory = document["originalScreenshots"]
    require(len(inventory) >= 12, "Missing actual phone/tab/scroll originals")
    for row in inventory:
        require(file(row["path"]).suffix == ".png", "An original must be PNG")
        require(SHA(file(row["path"]).read_bytes()) == row["sha256"], "Original screenshot changed")
    expected_originals = {(r["path"], r["sha256"]) for r in inventory}
    require(len(expected_originals) == len(inventory), "Original screenshot inventory contains duplicates")
    reports = []
    actual_images = set()
    for row in document["nativeReports"]:
        report = referenced(row)
        require(report.get("status") == "passed" and report.get("completedAt") and not report.get("failure"), "Native QA is incomplete or failed")
        require(not report.get("captureOnly"), "Capture-only is not functional acceptance")
        require(report.get("unchangedDuringQA") is True and report.get("testLogicUnchangedDuringQA") is True,
                "Native application or assertions changed during execution")
        require(report["source"]["runtimeFiles"] == manifest, "Native QA belongs to another application")
        for name, digest in report["source"]["testFiles"].items():
            require(SHA(file(name).read_bytes()) == digest, "Native assertion/helper changed: " + name)
        for result in report["results"]:
            require(result.get("status") == "passed" and result.get("completedAt"), "Incomplete viewport")
            errors = result.get("errors", {})
            require(all(errors.get(key) == [] for key in ["javascriptAndConsole", "http", "external", "failed"]), "Browser/request errors remain")
            require(result.get("directLoadReload") is True, "Missing direct URL/document refresh")
            require(result.get("controls") and result.get("isolatedUpdateRecovery") and result.get("protected"), "Required interaction/recovery/protected coverage missing")
        reports.append(report)
        actual_images.update(emitted_images(report, file(row["path"]).parent))
    require(expected_originals <= actual_images,
            "Common originals were not emitted by the completed source-bound native reports")
    require({r["engine"] for r in reports} >= {"chromium", "webkit"}, "Both real browser engines required")
    for engine in ["chromium", "webkit"]:
        sizes = {(r["viewport"]["width"], r["viewport"]["height"]) for p in reports if p["engine"] == engine for r in p["results"]}
        require({(393, 852), (430, 896)} <= sizes, "Both primary phones required: " + engine)
    chrome_sizes = {r["viewport"]["width"] for p in reports if p["engine"] == "chromium" for r in p["results"]}
    require({768, 1440} <= chrome_sizes, "Tablet and desktop responsive checks required")
    reviewers = document["reviewers"]
    require({r["name"] for r in reviewers} == REVIEWERS and len(reviewers) == 6, "All six independent specialists required")
    completed_reports = {(row["path"], row["sha256"]) for row in document["nativeReports"]}
    for row in reviewers:
        receipt = referenced(row)
        require(receipt.get("status") == "accepted", "Specialist has not accepted: " + row["name"])
        require(receipt.get("auditedAt"), "Specialist review lacks its actual audit time")
        require(receipt.get("runtimeManifestSha256") == binding, "Specialist inspected another runtime")
        completed = receipt.get("completedActualReport", {})
        require((completed.get("path"), completed.get("sha256")) in completed_reports,
                "Specialist did not bind a completed actual native report: " + row["name"])
        viewed = {(r["path"], r["sha256"]) for r in receipt.get("personallyViewedOriginals", [])}
        require(expected_originals <= viewed, "Specialist did not inspect every common original: " + row["name"])
    source = referenced(document["independentSourceAudit"])
    require(source.get("status") in {"passed", "accepted"}, "Independent data audit failed")
    require(source.get("completedAt") and source.get("assertions", 0) >= 1000 and source.get("failures") == [], "Independent source checks incomplete or unresolved")
    require(source.get("snapshotSha256", source.get("datasetSha256")) == manifest["assets/data/matchup-breakdown.json"], "Source audit dataset differs")
    if hosted:
        deployed = referenced(document["hostedReport"])
        require(deployed.get("status") == "passed" and deployed.get("hosted") is True and deployed.get("completedAt"), "Actual hosted verification incomplete")
        require(deployed["source"]["runtimeFiles"] == manifest, "Actual hosted application differs")
        require(deployed.get("qualification", {}).get("strictTLS") is True, "Actual host TLS not verified")
        served = deployed["servedRuntime"]
        require({r["file"] for r in served} == set(manifest), "Not every served application file checked")
        for row in served:
            require(row["status"] == 200 and row["sha256"] == manifest[row["file"]], "Served application differs: " + row["file"])
    return {"status": "passed", "runtimeManifestSha256": binding, "runtimeFileCount": len(manifest),
            "nativeReportCount": len(reports), "specialistCount": 6, "originalScreenshotCount": len(inventory),
            "hostedVerificationRequired": hosted, "snapshotSha256": manifest["assets/data/matchup-breakdown.json"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review", default=PREFIX + "/release/review.json")
    parser.add_argument("--hosted", action="store_true")
    args = parser.parse_args()
    print(json.dumps(inspect(json.loads(file(args.review).read_text()), args.hosted), indent=2))


if __name__ == "__main__":
    main()
