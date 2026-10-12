#!/usr/bin/env python3
"""Check an approved candidate; --apply is for root after browser freeze ends.

Never fetches source data. Refuses changed original input bodies or a modified
candidate, and delegates installation/rollback to the reviewed report producer.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[3]
AUDIT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Install only after root approval and all browser processes have closed")
    args = parser.parse_args()
    receipt = json.loads((AUDIT / "conservative-candidate-receipt.json").read_bytes())
    candidate = Path(receipt["candidateRoot"])
    for path, checksum in receipt["inputHashes"].items():
        assert sha(ROOT / path) == checksum, (path, "Original snapshot changed: do not overwrite newer work")
    assert sha(candidate / "game-reports.json") == receipt["candidateIndexSha256"], "Candidate index differs from audit"
    spec = importlib.util.spec_from_file_location("reports", ROOT / "scripts/refresh-game-reports.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    validated = module.validate(candidate / "game-reports.json", candidate / "game-reports")
    if not args.apply:
        print(json.dumps({"status": "passed", "mode": "dry-run", "installed": False, "candidateIndexSha256": receipt["candidateIndexSha256"], "validation": validated}, indent=2))
        return
    with tempfile.TemporaryDirectory(prefix=".reviewed-archive-correction-", dir=ROOT / "assets/data") as staged:
        staged = Path(staged)
        shutil.copyfile(candidate / "game-reports.json", staged / "game-reports.json")
        shutil.copytree(candidate / "game-reports", staged / "game-reports")
        module.validate(staged / "game-reports.json", staged / "game-reports")
        assert all(sha(ROOT / path) == checksum for path, checksum in receipt["inputHashes"].items()), "Input changed while staging"
        module.install_candidate(staged / "game-reports.json", staged / "game-reports", ROOT / "assets/data/game-reports.json", ROOT / "assets/data/game-reports")
    assert sha(ROOT / "assets/data/game-reports.json") == receipt["candidateIndexSha256"]
    print(json.dumps({"status": "passed", "mode": "installed", "installed": True, "sourceRetrievalClaim": None, "candidateIndexSha256": receipt["candidateIndexSha256"], "validation": module.validate(ROOT / "assets/data/game-reports.json", ROOT / "assets/data/game-reports")}, indent=2))


if __name__ == "__main__":
    main()
