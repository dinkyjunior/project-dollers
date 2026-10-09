#!/usr/bin/env python3
"""Bind six actual hosted reviews to the immutable accepted local application."""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("home_local_gate", Path(__file__).with_name("accept-release.py"))
local_gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_gate)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked(name):
    path = (ROOT / name).resolve()
    assert path.is_relative_to(ROOT) and path.is_file(), name
    return path


def read(name):
    return json.loads(checked(name).read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True)
    parser.add_argument("--reviews", nargs="+", required=True)
    parser.add_argument("--publication", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = ROOT / args.output
    assert not output.exists(), "Use a fresh immutable acceptance receipt"
    local_name = "qa/home-gem/acceptance-local.json"
    assert digest(checked(local_name)) == "603860212f00be5491f569dbdc29650b4d2eedbeb4bd4c54078a0994daad5509"
    local = read(local_name)
    assert local["status"] == "accepted"
    runtime = {p.relative_to(ROOT).as_posix(): digest(p) for p in
               [ROOT / "index.html", *sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())]}
    runtime_id = hashlib.sha256(json.dumps(runtime, separators=(",", ":"), sort_keys=True).encode()).hexdigest()
    assert runtime == local["runtimeManifest"] and runtime_id == local["runtimeManifestSha256"]
    report = read(args.report)
    assert report["status"] == "passed" and report["completedAt"] and report["browserClosed"] is True
    assert report["base"] == "https://dinkyjunior.github.io/project-dollers/" and report["engine"] == "webkit"
    assert report["runtimeManifest"] == runtime and report["runtimeManifestSha256"] == runtime_id
    assert report["runtimeUnchanged"] and report["helperUnchanged"] and report["originalTestsUnchanged"]
    assert report["helperSha256"] == digest(checked("qa/home-gem/final-native.cjs"))
    assert report["controlsHelperSha256"] == digest(checked("qa/home-gem/controls-audit.cjs"))
    assert report["originalTestFiles"] == {name: digest(checked(name)) for name in local_gate.ORIGINAL_TESTS}
    qualification = report["qualification"]
    assert all(qualification[key] is True for key in ("actualBrowser", "naturalMotion", "strictTLS", "nativeOSReducedMotionPreference"))
    assert all(qualification[key] is False for key in ("animationClockSubstitution", "DOMOrCSSSubstitution", "responseSubstitution", "physicalIPhone"))
    contracts = report["interactionSourceContracts"]
    assert contracts["status"] == "passed" and contracts["sourceSha256"] == runtime["assets/home-interactions.js"]
    assert len(contracts["tests"]) == 5 and {row["name"] for row in contracts["tests"]} == local_gate.CONTRACTS
    assert all(row["status"] == "passed" for row in contracts["tests"])
    assert len(report["results"]) == 2
    assert {(row["viewport"]["width"], row["viewport"]["height"]) for row in report["results"]} == {(393, 852), (430, 896)}
    for result in report["results"]:
        assert result["status"] == "passed" and result["completedAt"]
        assert result["nativeControls"]["status"] == "passed" and result["motion"]["status"] == "passed"
        assert len(result["actions"]) == 45
        assert all(not result["errors"][key] for key in ("javascript", "console", "http", "failed", "external"))
        assert all(row["error"] in {"Load request cancelled", "net::ERR_ABORTED"}
                   and row["url"].startswith(report["base"])
                   for row in result["errors"].get("cancelledNavigation", []))
    served = report["servedRuntime"]
    assert len(served) == len(runtime) == 245
    assert {row["file"]: row["sha256"] for row in served} == runtime
    assert all(row["status"] == 200 and row["bytes"] == checked(row["file"]).stat().st_size for row in served)
    originals = {}
    cases = set()
    assert len(report["originals"]) == 8
    for row in report["originals"]:
        image = checked(str(Path(args.report).parent / row["file"]))
        assert digest(image) == row["sha256"] and image.stat().st_size == row["bytes"]
        cases.add((row["viewport"]["width"], row["viewport"]["height"], row["sport"]))
        originals[image.relative_to(ROOT).as_posix()] = row["sha256"]
    assert cases == local_gate.PHONE_CASES
    report_sha = digest(checked(args.report))
    reviewers, review_records = set(), []
    for name in args.reviews:
        review = read(name)
        assert review["status"] == "accepted" and review["completedAt"]
        assert review["runtimeManifestSha256"] == runtime_id
        reviewer = review["reviewer"]
        assert reviewer in local_gate.REVIEWERS and reviewer not in reviewers
        reviewers.add(reviewer)
        assert {row["path"]: row["sha256"] for row in review["reports"]}.get(args.report) == report_sha
        assert all({row["path"]: row["sha256"] for row in review["personallyViewedOriginals"]}.get(p) == sha for p, sha in originals.items())
        review_records.append({"path": name, "sha256": digest(checked(name)), "reviewer": reviewer})
    assert reviewers == local_gate.REVIEWERS
    publication = read(args.publication)
    assert publication["status"] == "passed" and publication["strictTLS"] is True
    assert publication["url"] == report["base"] and publication["workflowState"] == "active"
    assert publication["head"] == "3e047c86df61208a6675bf60fbd8e98051566cbf"
    assert set(publication["refs"]) == set(publication["finalRefs"]) == {"main", "codex-rebuild"}
    assert set(publication["refs"].values()) == set(publication["finalRefs"].values()) == {publication["head"]}
    assert publication["pages"]["head"] == publication["head"] and publication["pages"]["conclusion"] == "success"
    assert {row["name"] for row in publication["pages"]["jobs"]} == {"build", "deploy", "report-build-status"}
    assert len(publication["pages"]["jobs"]) == 3
    assert all(row["status"] == "completed" and row["conclusion"] == "success" for row in publication["pages"]["jobs"])
    public_rows = {row["file"]: row for row in publication["servedFiles"]}
    assert len(public_rows) == len(publication["servedFiles"]) == 360
    for name, row in public_rows.items():
        body = subprocess.check_output(["git", "show", publication["head"] + ":" + name], cwd=ROOT)
        assert row["status"] == 200 and row["bytes"] == len(body)
        assert row["sha256"] == hashlib.sha256(body).hexdigest()
    assert all(public_rows[name]["sha256"] == sha and public_rows[name]["status"] == 200 for name, sha in runtime.items())
    assert public_rows["backups/project-dollar-home-gem-source.zip"]["sha256"] == digest(checked("backups/project-dollar-home-gem-source.zip"))
    receipt = {"status": "accepted", "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "runtimeManifestSha256": runtime_id, "runtimeFiles": len(runtime), "nativeActions": 90,
               "localAcceptance": {"path": local_name, "sha256": digest(checked(local_name))},
               "hostedReport": {"path": args.report, "sha256": report_sha}, "originals": originals,
               "reviews": review_records, "publication": {"path": args.publication, "sha256": digest(checked(args.publication))},
               "qualification": qualification}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"status": "accepted", "runtime": runtime_id, "reviewers": sorted(reviewers), "nativeActions": 90,
                      "hostedOriginals": len(originals), "servedRuntimeFiles": len(served), "receipt": args.output}, indent=2))


if __name__ == "__main__":
    main()
