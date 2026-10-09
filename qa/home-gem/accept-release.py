#!/usr/bin/env python3
"""Require complete native browser evidence and six independent visual reviews."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEWERS = {"aperture", "gem-controls", "motion", "controls-audit", "mobile-qa", "visual-director"}
PHONE_CASES = {(width, height, sport) for width, height in ((393, 852), (430, 896))
               for sport in ("nfl", "nba", "nrl", "ufc")}
ORIGINAL_TESTS = ["qa/matchup-breakdown/" + name for name in [
    "run.cjs", "hosted.cjs", "qa.cjs", "controls.cjs", "model.cjs", "model.test.cjs",
    "run-durable.py", "protected.cjs", "updates.cjs"]] + [
    "qa/run.cjs", "qa/team-details/capture-ready.cjs", "qa/team-details/qa.cjs",
    "qa/nfl-dashboard/qa.cjs", "qa/home-gate.cjs", "qa/hosted-webkit.cjs"]
CONTRACTS = {
    "Four native button selections preserve semantic state, image, scene, destination and availability",
    "Coming-soon entry and all unavailable destination shortcuts are captured without closing More",
    "Keyboard arrows wrap and Home/End select exact focused sport; irrelevant keys remain untouched",
    "All valid session selections restore and corrupt values safely default to NFL",
    "Blocked session storage preserves all four fully functional selections"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def checked_path(name):
    path = (ROOT / name).resolve()
    assert path.is_relative_to(ROOT) and path.is_file(), name
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports", nargs="+", required=True)
    parser.add_argument("--reviews", nargs="+", required=True)
    parser.add_argument("--source-review", default="qa/home-gem/reviews/source-integration-review-v2.json")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = ROOT / args.output
    assert not output.exists(), "Use a fresh immutable acceptance receipt"
    runtime = {p.relative_to(ROOT).as_posix(): digest(p) for p in
               [ROOT / "index.html", *sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())]}
    runtime_id = hashlib.sha256(json.dumps(runtime, separators=(",", ":"), sort_keys=True).encode()).hexdigest()
    reviewed_path = checked_path("qa/home-gem/iteration-3-chromium/results.json")
    assert digest(reviewed_path) == "94a4860502c673fa492a6e488f0fe519e6c1c90c3b5c896e417037307a95e46a"
    reviewed = read(reviewed_path)
    assert reviewed["status"] == "passed" and reviewed["browserClosed"] is True
    nondata = lambda manifest: {name: sha for name, sha in manifest.items()
                                if not name.startswith("assets/data/") or name not in {
                                    "assets/data/current.json", "assets/data/provenance.json",
                                    "assets/data/player-history.json", "assets/data/team-details.json",
                                    "assets/data/matchup-breakdown.json"}}
    assert nondata(runtime) == nondata(reviewed["runtimeManifest"])
    reports, originals, engines = {}, {}, set()
    for name in args.reports:
        path = checked_path(name)
        report = read(path)
        assert report["status"] == "passed" and report["completedAt"] and report["browserClosed"] is True
        assert report["runtimeManifest"] == runtime and report["runtimeManifestSha256"] == runtime_id
        assert report["engine"] in {"chromium", "webkit"} and report["engine"] not in engines
        engines.add(report["engine"])
        assert report["runtimeUnchanged"] and report["helperUnchanged"] and report["originalTestsUnchanged"]
        assert report["originalTestFiles"] == {name: digest(checked_path(name)) for name in ORIGINAL_TESTS}
        assert report["helperSha256"] == digest(ROOT / "qa/home-gem/final-native.cjs")
        assert report["controlsHelperSha256"] == digest(ROOT / "qa/home-gem/controls-audit.cjs")
        assert report["interactionSourceContracts"]["status"] == "passed"
        assert report["interactionSourceContracts"]["sourceSha256"] == runtime["assets/home-interactions.js"]
        assert {row["name"] for row in report["interactionSourceContracts"]["tests"]} == CONTRACTS
        assert len(report["interactionSourceContracts"]["tests"]) == len(CONTRACTS)
        assert all(row["status"] == "passed" for row in report["interactionSourceContracts"]["tests"])
        tested_phones = set()
        for result in report["results"]:
            assert result["status"] == "passed" and result["completedAt"]
            assert all(not result["errors"][key] for key in ["javascript", "console", "http", "failed", "external"])
            assert all(row["error"] in {"net::ERR_ABORTED", "Load request cancelled"}
                       for row in result["errors"].get("cancelledNavigation", []))
            assert result["nativeControls"]["status"] == "passed"
            if result["viewport"]["width"] in (393, 430):
                tested_phones.add((result["viewport"]["width"], result["viewport"]["height"]))
                assert result["motion"]["status"] == "passed"
        assert tested_phones == {(393, 852), (430, 896)}
        cases = set()
        for row in report["originals"]:
            image = path.parent / row["file"]
            assert digest(image) == row["sha256"] and image.stat().st_size == row["bytes"]
            if row["viewport"]["width"] in (393, 430):
                cases.add((row["viewport"]["width"], row["viewport"]["height"], row["sport"]))
                originals[image.relative_to(ROOT).as_posix()] = row["sha256"]
        assert cases == PHONE_CASES
        reports[name] = digest(path)
    assert engines == {"chromium", "webkit"} and len(originals) == 16
    reviewers, review_records = set(), []
    for name in args.reviews:
        path = checked_path(name)
        review = read(path)
        assert review["status"] == "accepted" and review["completedAt"]
        assert review["runtimeManifestSha256"] == runtime_id
        reviewer = review["reviewer"]
        assert reviewer in REVIEWERS and reviewer not in reviewers
        reviewers.add(reviewer)
        bound_reports = {row["path"]: row["sha256"] for row in review["reports"]}
        assert all(bound_reports.get(p) == sha for p, sha in reports.items())
        viewed = {row["path"]: row["sha256"] for row in review["personallyViewedOriginals"]}
        assert all(viewed.get(p) == sha for p, sha in originals.items()), reviewer + " did not review all phone originals"
        review_records.append({"path": name, "sha256": digest(path), "reviewer": reviewer})
    assert reviewers == REVIEWERS
    baseline = read(ROOT / "qa/home-gem/baseline-runtime.json")
    source_path = checked_path(args.source_review)
    source = read(source_path)
    assert source["status"] == "passed"
    source_names = {"current.json", "provenance.json", "player-history.json", "team-details.json", "matchup-breakdown.json"}
    assert set(source["snapshotHashes"]["incoming"]) == source_names
    assert source["snapshotHashes"]["incoming"] == {
        name: runtime["assets/data/" + name] for name in source_names}
    allowed_source_changes = {"assets/data/" + name for name in source_names
                              if baseline["allExistingAssetFiles"]["assets/data/" + name] != runtime["assets/data/" + name]}
    changed = [name for name, sha in baseline["allExistingAssetFiles"].items() if runtime.get(name) != sha]
    assert set(changed) == {"assets/home-interactions.js"} | allowed_source_changes, changed
    html = (ROOT / "index.html").read_text()
    protected = html[html.index('      <section class="page nfl-premium-dashboard'):]
    assert hashlib.sha256(protected.encode()).hexdigest() == baseline["protectedNonHomeHTMLSha256"]
    receipt = {"status": "accepted", "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "runtimeManifestSha256": runtime_id, "runtimeFiles": len(runtime), "runtimeManifest": runtime,
               "reports": reports, "originals": originals, "reviews": review_records,
               "sourceReview": {"path": args.source_review, "sha256": digest(source_path)},
               "preservedAutomaticSourceChanges": sorted(allowed_source_changes),
               "protectedExistingAssetCount": len(baseline["allExistingAssetFiles"]) - len(changed),
               "protectedNonHomeHTMLSha256": baseline["protectedNonHomeHTMLSha256"],
               "qualification": "Independent render comparison with chat attachment; no registered pixel identity or physical iPhone FPS claim."}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"status": receipt["status"], "runtime": runtime_id, "reviewers": sorted(reviewers),
                      "phoneOriginals": len(originals), "receipt": args.output}, indent=2))


if __name__ == "__main__":
    main()
