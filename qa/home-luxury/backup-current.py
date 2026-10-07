"""Create verified source and QA backups without copying credentials or Git state."""
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def archive(target, paths):
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for relative in sorted(paths):
            output.write(ROOT / relative, "project-dollers/" + relative)
    with zipfile.ZipFile(target) as check:
        assert check.testzip() is None
        for relative in sorted(paths):
            assert hashlib.sha256(check.read("project-dollers/" + relative)).hexdigest() == digest(ROOT / relative)
    return {"file": str(target), "files": len(paths), "bytes": target.stat().st_size, "sha256": digest(target), "allEntriesCrcAndSha256Verified": True}


def main():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = Path("/workspace/backups") / ("home-luxury-" + timestamp)
    out.mkdir(parents=True, exist_ok=False)
    tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines()
    source = {p for p in tracked if not p.startswith("qa/")}
    source.update(str(p.relative_to(ROOT)) for p in (ROOT / "assets").rglob("*") if p.is_file())
    # Preserve existing executable QA helpers without bundling huge historical
    # screenshot/data-fixture archives into the working source download.
    source.update(p for p in tracked if p.startswith("qa/") and Path(p).suffix in {".py", ".cjs", ".js"})
    evidence = {str(p.relative_to(ROOT)) for p in (ROOT / "qa/home-luxury").rglob("*") if p.is_file() and "__pycache__" not in p.parts}
    source.update(p for p in evidence if Path(p).suffix in {".md", ".json", ".txt", ".cjs", ".py", ".html"})
    source = {p for p in source if (ROOT / p).is_file() and not any(x in Path(p).parts for x in [".git", "node_modules", "__pycache__"])}
    manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "gitCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "source": archive(out / "project-dollar-reviewed-working-source.zip", source),
                "evidence": archive(out / "project-dollar-complete-luxury-qa.zip", evidence),
                "qualification": "Source contains the current local reviewed implementation; it is not proof of push or deployment. QA ZIP separately preserves all final and rejected/intermediate evidence, including ignored files. Earlier historical QA and Git history remain in the existing repository/previous recovery backups. No credentials, credential stores or Git internals are copied."}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
