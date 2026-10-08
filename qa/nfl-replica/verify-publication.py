"""Verify exact production refs, successful Pages jobs and served file bytes."""
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
PREFIX = Path("qa/nfl-replica")
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def api(endpoint):
    return json.loads(subprocess.check_output(
        ["gh", "api", "repos/dinkyjunior/project-dollers/" + endpoint],
        cwd=ROOT, text=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages-run", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    assert not output.exists(), "Preserve previous publication receipts"
    original_manifest_file = ROOT / PREFIX / "after-runtime-manifest.json"
    original_manifest = json.loads(original_manifest_file.read_bytes())
    manifest_file = ROOT / PREFIX / "published-runtime-manifest.json"
    manifest = json.loads(manifest_file.read_bytes())
    review = json.loads((ROOT / PREFIX / "release-review.json").read_bytes())
    assert review["status"] == "all_six_reviews_accepted"
    assert review["runtimeManifestSha256"] == sha(original_manifest_file.read_bytes())
    assert len(review["reviewers"]) == 6
    for row in review["reviewers"]:
        assert row["decision"] == "accepted"
        assert sha((ROOT / row["evidence"]).read_bytes()) == row["evidenceSha256"]
    integration = json.loads((ROOT / PREFIX / "refresh-integration" / "release-integration.json").read_bytes())
    assert integration["status"] == "all_six_reviews_accepted"
    assert integration["originalRuntimeManifestSha256"] == sha(original_manifest_file.read_bytes())
    assert integration["publishedRuntimeManifestSha256"] == sha(manifest_file.read_bytes())
    assert set(manifest) == set(original_manifest)
    changed = {file for file in manifest if manifest[file] != original_manifest[file]}
    assert changed == {"assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"}
    assert integration["factualChanges"] == 0 and integration["structuralChanges"] == 0
    assert len(integration["reviewers"]) == 6
    for row in integration["reviewers"]:
        assert row["decision"] == "accepted"
        assert sha((ROOT / row["evidence"]).read_bytes()) == row["evidenceSha256"]
    assert integration["unchangedOtherRuntimeFiles"] == len(manifest) - len(changed)
    for file, expected in manifest.items():
        assert sha((ROOT / file).read_bytes()) == expected, file
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    refs = {branch: api("git/ref/heads/" + branch)["object"]["sha"]
            for branch in ("main", "codex-rebuild")}
    assert all(value == head for value in refs.values()), refs
    run = api("actions/runs/" + args.pages_run)
    jobs = api("actions/runs/" + args.pages_run + "/jobs")["jobs"]
    assert run["name"] == "pages build and deployment"
    assert run["head_sha"] == head and run["status"] == "completed" and run["conclusion"] == "success"
    assert len(jobs) == 3 and all(job["conclusion"] == "success" for job in jobs)
    tracked = subprocess.check_output(["git", "ls-files", "-z", str(PREFIX)], cwd=ROOT).decode().split("\0")
    files = sorted(set(manifest) | {file for file in tracked if file})
    context = ssl.create_default_context(cafile="/usr/local/share/ca-certificates/environment-proxy-ca.crt")

    def verify(file):
        request = urllib.request.Request(BASE + urllib.parse.quote(file) + "?verify=" + head,
                                         headers={"Cache-Control": "no-cache", "User-Agent": "ProjectDollar-QA"})
        with urllib.request.urlopen(request, timeout=60, context=context) as response:
            raw, status = response.read(), response.status
        expected = sha((ROOT / file).read_bytes())
        assert status == 200 and sha(raw) == expected, file
        return {"path": file, "httpStatus": status, "sha256": expected, "bytes": len(raw)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(verify, files))
    receipt = {"status": "passed", "completedAt": datetime.now(timezone.utc).isoformat(),
               "base": BASE, "gitHead": head, "refs": refs,
               "runtimeManifestSha256": sha(manifest_file.read_bytes()),
               "pagesRun": {"id": run["id"], "url": run["html_url"], "head": run["head_sha"],
                            "jobs": [{"name": job["name"], "conclusion": job["conclusion"]} for job in jobs]},
               "strictTLS": True, "fileCount": len(rows), "totalBytes": sum(row["bytes"] for row in rows),
               "files": rows,
               "qualification": "Checks actual production bytes and exact refs/Pages jobs. Separate original hosted native browser reports establish interactions, visual appearance and motion."}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"PASS: {len(rows)} exact HTTP 200 files, production {head}, Pages {run['id']}")


if __name__ == "__main__":
    main()
