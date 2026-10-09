#!/usr/bin/env python3
"""Preserve current runnable source, assets and provenance without credentials."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    assert output.is_relative_to(ROOT / "backups") and not output.exists()
    files = {p for p in ROOT.iterdir() if p.is_file() and
             (p.suffix in {".md", ".json", ".html"} or p.name in {".gitignore", ".nojekyll"})}
    for directory in ["assets", "scripts", ".github", "reference"]:
        files.update(p for p in (ROOT / directory).rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    files.update(p for p in (ROOT / "qa").rglob("*") if p.is_file() and
                 p.suffix in {".py", ".cjs", ".mjs", ".js", ".sh", ".md"} and "__pycache__" not in p.parts)
    files.update(p for p in (ROOT / "qa/home-gem").rglob("*.json") if p.is_file())
    files.update(p for p in (ROOT / "qa/home-gem/reviews").rglob("*.gz") if p.is_file())
    files = sorted(files)
    inventory = [{"path": p.relative_to(ROOT).as_posix(), "bytes": p.stat().st_size,
                  "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for p in files:
            archive.write(p, p.relative_to(ROOT).as_posix())
        archive.writestr("BACKUP_CONTENTS.json", json.dumps(inventory, indent=2) + "\n")
        archive.writestr("RESTORE_BACKUP.md", "# Project Dollar Home gemstone source backup\n\n"
                        "Extract into a new folder and serve the folder with a local HTTP server. "
                        "The complete current index.html/assets runtime, local fonts, images, data snapshots, "
                        "source/update builders, GitHub workflows, QA source, Home review receipts and the small "
                        "current public-source corroboration archives are included. "
                        "Source-specific retrieval timestamps and unknown/disputed values remain intact.\n\n"
                        "Git history, workspace credentials, installed dependencies and large browser PNG collections "
                        "are excluded. The public Home gallery links their original browser evidence. This compact "
                        "backup does not include historical raw provider archives; those remain in the earlier "
                        "project-dollar-matchup-source-v4.zip with their actual original dates. Neither those older "
                        "archives nor the current derived snapshots are claimed to be newly retrieved raw responses.\n")
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        for row in inventory:
            assert hashlib.sha256(archive.read(row["path"])).hexdigest() == row["sha256"]
    receipt = {"status": "verified-application-source-backup", "createdAt":
               datetime.datetime.now(datetime.timezone.utc).isoformat(), "path": output.relative_to(ROOT).as_posix(),
               "bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
               "fileCount": len(inventory), "allMemberHashesChecked": True, "crcChecked": True,
               "contents": inventory, "qualification": "Exact current runtime and provenance; no Git/credentials/browser PNGs/historical raw provider archives."}
    output.with_suffix(".json").write_text(json.dumps(receipt, indent=2) + "\n")
    output.with_suffix(".sha256").write_text(receipt["sha256"] + "  " + output.name + "\n")
    print(json.dumps({k: receipt[k] for k in ["status", "path", "bytes", "sha256", "fileCount"]}, indent=2))


if __name__ == "__main__":
    main()
