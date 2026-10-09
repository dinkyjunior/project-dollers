#!/usr/bin/env python3
"""Verify actual Pages jobs, branch heads and HTTPS bodies, not a build request."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REPO = "dinkyjunior/project-dollers"
BASE = "https://dinkyjunior.github.io/project-dollers/"


def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", "repos/" + REPO + "/" + endpoint], text=True, cwd=ROOT, timeout=45))


def require(value, message):
    if not value:
        raise ValueError(message)


def check_body(item):
    name, expected = item
    path = (ROOT / name).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), "Missing selected local file: " + name)
    require(hashlib.sha256(path.read_bytes()).hexdigest() == expected, "Local reviewed bytes changed: " + name)
    request = urllib.request.Request(BASE + urllib.parse.quote(name), headers={"Cache-Control": "no-cache", "User-Agent": "ProjectDollarReleaseVerifier/1.0"})
    digest = hashlib.sha256()
    size = 0
    with urllib.request.urlopen(request, timeout=60) as response:
        require(response.status == 200, "Hosted HTTP failure: " + name)
        for chunk in iter(lambda: response.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
        url, status = response.url, response.status
    require(url.startswith(BASE), "Hosted URL departed configured Pages site")
    require(digest.hexdigest() == expected, "Actual hosted body differs: " + name)
    return {"file": name, "status": status, "bytes": size, "sha256": digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--head", required=True)
    parser.add_argument("--pages-run", required=True, type=int)
    parser.add_argument("--files", required=True, help="JSON mapping of exact reviewed public file hashes")
    parser.add_argument("--output", required=True, help="Fresh immutable receipt, preferably outside Git")
    parser.add_argument("--require-automation-active", action="store_true")
    args = parser.parse_args()
    out = Path(args.output)
    require(not out.exists(), "Publication receipt must be fresh")
    report = {"status": "running", "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "head": args.head,
              "pagesRun": args.pages_run, "url": BASE, "strictTLS": True, "credentialOutput": False}
    try:
        require(len(args.head) == 40 and all(c in "0123456789abcdef" for c in args.head), "Exact commit SHA required")
        refs = {branch: api("git/ref/heads/" + branch)["object"]["sha"] for branch in ["main", "codex-rebuild"]}
        require(set(refs.values()) == {args.head}, "Production/development refs do not equal the published reviewed commit")
        report["refs"] = refs
        run = api("actions/runs/" + str(args.pages_run))
        jobs = api("actions/runs/" + str(args.pages_run) + "/jobs?per_page=100")["jobs"]
        require(run["name"] == "pages build and deployment" and run["head_sha"] == args.head and run["status"] == "completed" and run["conclusion"] == "success", "Exact actual Pages deployment did not succeed")
        require({j["name"] for j in jobs} == {"build", "report-build-status", "deploy"} and all(j["status"] == "completed" and j["conclusion"] == "success" for j in jobs), "All three real Pages jobs must succeed")
        report["pages"] = {"id": run["id"], "url": run["html_url"], "head": run["head_sha"], "conclusion": run["conclusion"], "jobs": [{"name": j["name"], "status": j["status"], "conclusion": j["conclusion"]} for j in jobs]}
        manifest = json.loads(Path(args.files).read_text())
        require(isinstance(manifest, dict) and "index.html" in manifest and "assets/data/matchup-breakdown.json" in manifest, "Complete runtime/public evidence selection required")
        runtime_paths = [ROOT / "index.html", *sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())]
        actual_runtime = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in runtime_paths}
        require(all(manifest.get(name) == digest for name, digest in actual_runtime.items()), "Public selection omits or changes actual runtime files")
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            report["servedFiles"] = list(pool.map(check_body, sorted(manifest.items())))
        report["finalRefs"] = {branch: api("git/ref/heads/" + branch)["object"]["sha"] for branch in ["main", "codex-rebuild"]}
        require(set(report["finalRefs"].values()) == {args.head}, "Branch heads changed during actual hosted body verification")
        report["workflowState"] = api("actions/workflows/refresh-nfl-data.yml")["state"]
        if args.require_automation_active:
            require(report["workflowState"] == "active", "Automatic source refresh is not restored")
        report["status"] = "passed"
    except Exception as error:
        report.update(status="failed", failure=str(error))
        raise
    finally:
        report["completedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "head": args.head, "pagesRun": args.pages_run, "verifiedPublicFiles": len(report["servedFiles"]), "verifiedBytes": sum(r["bytes"] for r in report["servedFiles"]), "workflowState": report["workflowState"], "receipt": str(out)}, indent=2))


if __name__ == "__main__":
    main()
