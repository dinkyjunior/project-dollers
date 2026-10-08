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
    assert read("hosted-visual-review.json")["status"] == "accepted"
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
