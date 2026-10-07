"""Verify the final public application and its immutable review evidence."""
import argparse
import concurrent.futures
import hashlib
import json
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://dinkyjunior.github.io/project-dollers/"
CA = "/usr/local/share/ca-certificates/environment-proxy-ca.crt"
DATA = {"assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def report(path):
    return json.loads((ROOT / path).read_text())


def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", "repos/dinkyjunior/project-dollers/" + endpoint], cwd=ROOT, text=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages-run", required=True)
    parser.add_argument("--output", default="/workspace/recovery-qa/home-luxury-final-publication.json")
    args = parser.parse_args()
    prefix = "qa/home-luxury/"
    accepted = report(prefix + "agent-acceptance.json")
    assert accepted["status"] == "all_six_visual_reviews_accepted"
    assert accepted["capturedScreens"] == 16 and len(accepted["reviewers"]) == 6
    for reviewer in accepted["reviewers"]:
        assert reviewer["decision"] == "accepted"
        assert reviewer["allFourSportsAtBothPhoneSizesInBothEnginesIndependentlyReviewed"]
        assert sha((ROOT / reviewer["evidence"]).read_bytes()) == reviewer["evidenceSha256"]
    checks = ["local-chromium/results.json", "local-webkit/results.json", "hosted-webkit/results.json", "review/results.json"]
    for path in checks:
        check = report(prefix + path)
        assert check["status"] == "passed", path
    assert report(prefix + "motion-approved/results.json")["status"] == "passed"
    manifest = dict(report(prefix + "refresh-integration/post-refresh-results.json")["expectedManifest"])
    refresh = report(prefix + "refresh-integration/post-refresh-results.json")
    manual = report(prefix + "refresh-integration/post-refresh-manual.json")
    assert refresh["status"] == manual["status"] == "passed"
    assert manual["linkedSmoke"]["sha256"] == sha((ROOT / prefix / "refresh-integration/post-refresh-results.json").read_bytes())
    assert manifest.keys() == accepted["runtimeManifest"].keys()
    for path, value in manifest.items():
        assert sha((ROOT / path).read_bytes()) == value, path
        if path not in DATA:
            assert value == accepted["runtimeManifest"][path], path
    if any(manifest[path] != accepted["runtimeManifest"][path] for path in DATA):
        diff = report(prefix + "refresh-integration/final-incoming-refresh.json")
        assert not diff["changedNonDataRuntimeFiles"]
        for path in DATA:
            assert diff["files"][path]["afterSha256"] == manifest[path]
        if diff["totalFactualDifferences"] == 0:
            assert diff["status"] == "factual-values-preserved"
        else:
            # Real roster/source changes cannot be disguised as retrieval
            # metadata. Require their explicit independent verification and
            # the complete current-source native regression as separate gates.
            assert diff["status"] == "differences-found"
            source = report(prefix + "refresh-integration/current-data-verification.json")
            assert source["status"] == "passed" and source["allDeclaredDifferencesReviewed"] is True
            assert source["declaredDifferenceCount"] == diff["totalFactualDifferences"]
            assert source["incomingDiff"]["sha256"] == sha((ROOT / prefix / "refresh-integration/final-incoming-refresh.json").read_bytes())
            assert source["runtimeManifest"] == manifest
            native = report(prefix + "current-data-local-webkit/results.json")
            assert native["status"] == "passed" and len(native["results"]) == 2
            assert native["runtimeManifest"] == manifest
    assert report(prefix + "preservation.json")["status"] == "passed"
    additional = ["CODEX_START.md", "CODEX_HANDOFF_STATUS.md", "CODEX_ENVIRONMENT.md", "DEPLOYMENT.md"]
    for folder in ["approved-local-captures", "approved-local-webkit", "baseline-local-chromium", "live-captures", "before-after", "review"]:
        additional.extend(str(path.relative_to(ROOT)) for path in sorted((ROOT / prefix / folder).iterdir()) if path.is_file() and path.suffix in {".json", ".html", ".png", ".md"})
    additional.extend([prefix + "agent-acceptance.json", prefix + "RELEASE.md", prefix + "preservation.json"])
    additional.extend(item["evidence"] for item in accepted["reviewers"])
    additional.extend(str(path.relative_to(ROOT)) for path in sorted((ROOT / prefix / "refresh-integration").iterdir()) if path.is_file() and path.suffix in {".json", ".md", ".txt"})
    for path in additional:
        manifest[path] = sha((ROOT / path).read_bytes())
    context = ssl.create_default_context(cafile=CA)

    def get(path):
        request = urllib.request.Request(BASE + path, headers={"Cache-Control": "no-cache"})
        retries = []
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, context=context, timeout=30) as response:
                    raw = response.read()
                    result = {"path": path, "httpStatus": response.status, "bytes": len(raw), "sha256": sha(raw)}
                break
            except urllib.error.HTTPError as error:
                if error.code not in {502, 503, 504} or attempt == 2:
                    raise
                retries.append({"attempt": attempt + 1, "status": error.code})
                time.sleep(attempt + 1)
        assert result["httpStatus"] == 200 and result["sha256"] == manifest[path], result
        if retries:
            result["transientRetries"] = retries
        return result

    started = datetime.now(timezone.utc).isoformat()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    run = api("actions/runs/" + args.pages_run)
    assert run["head_sha"] == commit and run["status"] == "completed" and run["conclusion"] == "success"
    jobs = api("actions/runs/" + args.pages_run + "/jobs")["jobs"]
    assert jobs and all(job["status"] == "completed" and job["conclusion"] == "success" for job in jobs)
    refs = {branch: api("git/ref/heads/" + branch)["object"]["sha"] for branch in ["main", "codex-rebuild"]}
    assert all(value == commit for value in refs.values()), refs
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        delivered = list(pool.map(get, sorted(manifest)))
    final = {"status": "passed", "startedAt": started, "completedAt": datetime.now(timezone.utc).isoformat(), "base": BASE,
             "evidenceCommit": commit, "branchRefs": refs, "pagesRun": {"id": args.pages_run, "sha": run["head_sha"], "conclusion": run["conclusion"]},
             "strictTLS": True, "servedFiles": delivered, "allSixVisualReviewsAcceptedBeforePublication": True,
             "actualHostedMobileAndDesktopQA": True, "sourceResponsesSubstituted": False,
             "qualification": "DPR2 browser mobile emulation and genuine Linux WebKit; physical iPhone hardware and device FPS were not measured. Approved visual authority is the user chat attachment; no pixel-registered identity claim."}
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(final, indent=2) + "\n")
    print(json.dumps({"status": "passed", "files": len(delivered), "commit": commit, "completedAt": final["completedAt"], "receipt": str(out)}))


if __name__ == "__main__":
    main()
