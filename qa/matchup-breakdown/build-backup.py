#!/usr/bin/env python3
"""Create a portable application/source backup without environment credentials."""
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
    assert output.is_relative_to(ROOT) and not output.exists()
    files = {p for p in ROOT.iterdir() if p.is_file() and
             (p.suffix in {".md", ".json", ".html"} or p.name in {".gitignore", ".nojekyll"})}
    for folder in ["assets", "scripts", ".github", "reference"]:
        files.update(p for p in (ROOT / folder).rglob("*") if p.is_file() and
                     "__pycache__" not in p.parts)
    # All QA source programs and documentation, with the source archives/map
    # required to restore and independently validate this matchup dataset.
    files.update(p for p in (ROOT / "qa").rglob("*") if p.is_file() and
                 p.suffix in {".py", ".cjs", ".mjs", ".js", ".sh", ".md"})
    current_evidence = ROOT / "qa/matchup-breakdown/final-source-evidence"
    for p in (ROOT / "qa/matchup-breakdown/data").rglob("*"):
        if not p.is_file():
            continue
        if current_evidence.exists() and (p.name == "source-manifest.json" or
                "sources" in p.relative_to(ROOT / "qa/matchup-breakdown/data").parts):
            # Preserve the immutable week-advance regression fixture; current
            # raw-source acceptance is in the separately bound fresh directory.
            if p.name != "espn_fixture_summary_401873007.source.gz":
                continue
        files.add(p)
    if current_evidence.exists():
        files.update(p for p in current_evidence.rglob("*") if p.is_file())
    files.update((ROOT / "qa/matchup-breakdown/release").glob("runtime-manifest*.json"))
    files = sorted(p for p in files if "__pycache__" not in p.parts and p != output)
    inventory = [{"path": p.relative_to(ROOT).as_posix(), "bytes": p.stat().st_size,
                  "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for p in files:
            archive.write(p, p.relative_to(ROOT).as_posix())
        archive.writestr("BACKUP_CONTENTS.json", json.dumps(inventory, indent=2) + "\n")
        archive.writestr("RESTORE_BACKUP.md", "# Project Dollar application/source backup\n\n"
                        "Extract this ZIP into a new folder. Serve that folder with a local HTTP "
                        "server to open index.html; retain the /assets folder. The source includes "
                        "all runtime data, bundled visual assets, update builders, GitHub workflows, "
                        "QA programs and the reviewed raw matchup source archives.\n\n"
                        "When a newer source archive is present, it is under "
                        "qa/matchup-breakdown/final-source-evidence. The fixed older "
                        "week-advance regression fixture remains under data/sources. "
                        "The previous complete source version is retained separately "
                        "as project-dollar-matchup-source.zip.\n\n"
                        "This is an application/source backup. Git history, workspace credentials "
                        "and the large browser screenshot/report collection are excluded. "
                        "The public QA gallery and repository retain those reports. "
                        "Source timestamps are preserved; no fresh retrieval is claimed.\n")
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        for row in inventory:
            assert hashlib.sha256(archive.read(row["path"])).hexdigest() == row["sha256"]
    receipt = {"status": "verified-application-source-backup", "createdAt":
               datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "path": output.relative_to(ROOT).as_posix(), "bytes": output.stat().st_size,
               "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
               "fileCount": len(inventory), "crcChecked": True,
               "allMemberHashesChecked": True, "contents": inventory,
               "qualification": "Runtime/assets/data/source/workflows/QA code/raw matchup archives; "
               "Git history, credentials and large browser screenshots/reports excluded."}
    output.with_suffix(".json").write_text(json.dumps(receipt, indent=2) + "\n")
    output.with_suffix(".sha256").write_text(receipt["sha256"] + "  " + output.name + "\n")
    print(json.dumps({k: receipt[k] for k in ["status", "path", "bytes", "sha256", "fileCount"]}, indent=2))


if __name__ == "__main__":
    main()
