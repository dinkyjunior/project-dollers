"""Verify the exact published NFL release, its branch refs and QA artifacts."""
import argparse
import concurrent.futures
import hashlib
import json
import ssl
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://dinkyjunior.github.io/project-dollers/"
PREFIX = Path("qa/nfl-diamond")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(name):
    return json.loads((ROOT / PREFIX / name).read_text())


def api(endpoint):
    return json.loads(subprocess.check_output(
        ["gh", "api", "repos/dinkyjunior/project-dollers/" + endpoint],
        cwd=ROOT, text=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages-run", required=True)
    parser.add_argument("--output", required=True,
                        help="Fresh receipt outside Git avoids recursive evidence commits")
    args = parser.parse_args()
    output = Path(args.output)
    assert not output.exists(), "Never overwrite an earlier publication receipt"
    started = datetime.now(timezone.utc).isoformat()
    manifest = read("runtime-manifest.json")
    acceptance = read("agent-acceptance.json")
    assert acceptance["status"] == "all_six_reviews_accepted"
    assert acceptance["runtimeManifestSha256"] == digest((ROOT / PREFIX / "runtime-manifest.json").read_bytes())
    assert len(acceptance["reviewers"]) == 6
    for reviewer in acceptance["reviewers"]:
        assert reviewer["decision"] == "accepted"
        assert digest((ROOT / reviewer["evidence"]).read_bytes()) == reviewer["evidenceSha256"]
    original_manifest = read("approved-runtime-manifest.json")
    for name in ["approved-local/chromium/results.json", "approved-local/webkit/results.json"]:
        original = read(name)
        assert original["status"] == "passed" and original["unchangedDuringQA"] is True
        assert original["source"]["runtimeFiles"] == original_manifest
    changed = {name for name in manifest if manifest[name] != original_manifest[name]}
    assert changed == {"assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"}
    integration = read("refresh-integration/integrated-source.json")
    assert integration["status"] == "passed" and integration["unchangedNonDataRuntimeFiles"] == 200
    assert integration["currentRuntimeManifest"] == manifest
    assert integration["allApprovedEnrichedLeaderRowsPreserved"] == 816
    assert integration["allIncomingCurrentFieldsPreservedExceptApprovedLeaderEnrichment"] is True
    assert integration["incomingHistoryBytesExact"] is True
    for name in ["local-chromium/results.json", "local-webkit/results.json",
                 "hosted-webkit/results.json", "hosted-desktop/results.json"]:
        report = read(name)
        assert report["status"] == "passed", name
        assert report["source"]["runtimeFiles"] == manifest, name
        assert report["unchangedDuringQA"] is True, name
    assert read("preservation.json")["status"] == "passed"
    hosted_review = read("hosted-visual-review.json")
    assert hosted_review["status"] == "accepted actual hosted release"
    assert hosted_review["runtimeManifest"]["sha256"] == digest((ROOT / PREFIX / "runtime-manifest.json").read_bytes())
    assert hosted_review["runtimeManifest"]["currentDiskSourceExactlyMatches"] is True
    assert hosted_review["scope"]["reviewerDidNotMutateRuntime"] is True
    hosted_mobile = read("hosted-mobile-review.json")
    assert hosted_mobile["status"] == "passed"
    assert hosted_mobile["allServedRuntimeFilesHTTP200"] is True
    assert hosted_mobile["allServedRuntimeBytesMatchReviewedSource"] is True
    # Keep complete application/visual receipts bound to their original snapshot.
    # A later automated source refresh gets its own explicit difference proof and
    # targeted native checks rather than relabelling the original full suites.
    reviewed_manifest = dict(manifest)
    manifest = read("final-runtime-manifest.json")
    changed_latest = {name for name in manifest if manifest[name] != reviewed_manifest[name]}
    assert changed_latest == {"assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"}
    refresh = read("final-refresh/source-proof.json")
    assert refresh["status"] == "passed"
    assert refresh["previousRuntimeManifest"] == reviewed_manifest
    assert refresh["currentRuntimeManifest"] == manifest
    assert refresh["factualOrStructuralDifferences"] == []
    assert refresh["metadataValueChanges"] == 1806
    assert refresh["removedMetadataKeys"] == [
        "assets/data/current.json:/provenance/weeklyLeaders/enrichedAt",
        "assets/data/provenance.json:/datasets/weeklyLeaders/enrichedAt"]
    assert refresh["unchangedNonDataRuntimeFiles"] == 200
    assert refresh["allRetainedLeaderRowsExact"] == 816
    for name in ["final-refresh/local-chromium.json", "final-refresh/local-webkit.json",
                 "final-refresh/hosted-webkit.json"]:
        report = read(name)
        assert report["status"] == "passed", name
        assert report["source"]["runtimeFiles"] == manifest, name
        assert report["unchangedDuringQA"] is True, name
        assert len(report["results"]) == 2, name
        for case in report["results"]:
            assert case["status"] == "passed", name
            assert case["manualRefresh"]["httpStatus"] == 200, name
            assert case["manualRefresh"]["sha256"] == manifest["assets/data/current.json"], name
    latest_hosted = read("final-refresh/hosted-webkit.json")
    assert latest_hosted["qualification"]["strictTLS"] is True
    served = latest_hosted["servedRuntime"]
    assert len(served) == 203
    assert {entry["file"] for entry in served} == set(manifest)
    for entry in served:
        assert entry["status"] == 200
        assert entry["sha256"] == manifest[entry["file"]]
    for name, expected in manifest.items():
        assert digest((ROOT / name).read_bytes()) == expected, name
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    run = api("actions/runs/" + args.pages_run)
    assert run["name"] == "pages build and deployment", "Require the actual Pages deployment run"
    assert run["head_sha"] == commit and run["status"] == "completed" and run["conclusion"] == "success"
    jobs = api("actions/runs/" + args.pages_run + "/jobs")["jobs"]
    assert jobs and all(j["status"] == "completed" and j["conclusion"] == "success" for j in jobs)
    assert {j["name"] for j in jobs} >= {"build", "report-build-status", "deploy"}
    refs = {b: api("git/ref/heads/" + b)["object"]["sha"] for b in ["main", "codex-rebuild"]}
    assert all(value == commit for value in refs.values()), refs
    for p in (ROOT / PREFIX).rglob("*"):
        if p.is_file():
            manifest[str(p.relative_to(ROOT))] = digest(p.read_bytes())
    for name in ["CODEX_START.md", "CODEX_HANDOFF_STATUS.md", "CODEX_ENVIRONMENT.md",
                 "DEPLOYMENT.md", "reference/NFL_DIAMOND_CHAT_SOURCE.md"]:
        manifest[name] = digest((ROOT / name).read_bytes())
    ca = Path("/usr/local/share/ca-certificates/environment-proxy-ca.crt")
    tls = ssl.create_default_context(cafile=str(ca) if ca.exists() else None)

    def fetch(name):
        req = urllib.request.Request(BASE + urllib.parse.quote(name), headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, context=tls, timeout=30) as response:
            raw = response.read()
            result = {"path": name, "httpStatus": response.status,
                      "bytes": len(raw), "sha256": digest(raw)}
        assert result["httpStatus"] == 200 and result["sha256"] == manifest[name], result
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        delivered = list(pool.map(fetch, sorted(manifest)))
    result = {"status": "passed", "startedAt": started,
              "completedAt": datetime.now(timezone.utc).isoformat(), "base": BASE,
              "commit": commit, "branchRefs": refs,
              "pagesRun": {"id": args.pages_run, "sha": run["head_sha"], "conclusion": run["conclusion"]},
              "jobs": [{"name": j["name"], "conclusion": j["conclusion"]} for j in jobs],
              "strictTLS": True, "servedFiles": delivered,
              "allSixReviewsAcceptedBeforePublication": True,
              "actualHostedMobileAndDesktopQA": True, "sourceResponsesSubstituted": False,
              "qualification": "Browser emulation and genuine Linux WebKit; no physical iPhone/FPS or registered reference pixel-identity claim."}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "files": len(delivered),
                      "commit": commit, "receipt": str(output)}))


if __name__ == "__main__":
    main()
