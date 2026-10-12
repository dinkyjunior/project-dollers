#!/usr/bin/env python3
"""Stage a conservative legacy-metadata repair; never install published data.

This does not assert that absent original raw sources proved a flag was absent.
Legacy false values cannot distinguish explicit false from a default. They are
replaced with unknown, with separate provenance. Detailed play flags, factual
values, original source bodies' hashes and all retrieval clocks are preserved.
"""
import argparse
import collections
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[3]
AUDIT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def diff(a, b, path=""):
    if type(a) is not type(b):
        return [(path, a, b)]
    if isinstance(a, dict):
        result = []
        for key in sorted(a.keys() | b.keys()):
            p = f"{path}/{key}"
            if key not in a or key not in b:
                result.append((p, a.get(key), b.get(key)))
            else:
                result.extend(diff(a[key], b[key], p))
        return result
    if isinstance(a, list):
        if len(a) != len(b):
            return [(path, a, b)]
        return [change for i, (x, y) in enumerate(zip(a, b)) for change in diff(x, y, f"{path}/{i}")]
    return [] if a == b else [(path, a, b)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, default=Path("/workspace/archive-integrity-candidate"))
    args = parser.parse_args()
    if args.candidate.exists():
        raise ValueError("Refusing to replace an existing candidate")
    published_index = ROOT / "assets/data/game-reports.json"
    published_details = ROOT / "assets/data/game-reports"
    input_paths = [published_index, ROOT / "assets/data/team-details.json", ROOT / "assets/data/matchup-breakdown.json", ROOT / "assets/data/player-history.json", ROOT / "scripts/refresh-game-reports.py", *sorted(published_details.glob("*.json"))]
    frozen = {str(p.relative_to(ROOT)): sha(p) for p in input_paths}
    spec = importlib.util.spec_from_file_location("reports", ROOT / "scripts/refresh-game-reports.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    args.candidate.mkdir(parents=True)
    candidate_index = args.candidate / "game-reports.json"
    candidate_details = args.candidate / "game-reports"
    shutil.copytree(published_details, candidate_details)
    index = json.loads(published_index.read_bytes())
    corrected_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed = []
    cell_count = 0
    row_count = 0
    contradictions = []
    flags = collections.Counter()
    known_detailed = collections.Counter()
    for gid, entry in index["games"].items():
        path = candidate_details / f"{gid}.json"
        before = json.loads(path.read_bytes())
        after = json.loads(path.read_bytes())
        pointers = []
        changed_rows = 0
        detailed = {p["id"]: p for p in before["plays"] if p.get("id")}
        for i, row in enumerate(after["scoringPlays"]):
            touched = False
            for field in ("isPenalty", "isTurnover"):
                if row.get(field) is not False:
                    continue
                pointers.append(f"/scoringPlays/{i}/{field}")
                flags[field] += 1
                match = detailed.get(row.get("id"), {})
                detailed_value = match.get(field)
                known_detailed[f"{field}:{detailed_value}"] += 1
                if detailed_value is True:
                    contradictions.append({"gameId": gid, "playId": row["id"], "field": field, "condensedBefore": False, "detailedValuePreserved": True})
                row[field] = None
                touched = True
            changed_rows += int(touched)
        if not pointers:
            continue
        after["provenance"]["scoringPlayFlags"] = {
            "status": "unavailable", "origin": "legacy-default-cleared", "sourceIds": [],
            "fields": ["isPenalty", "isTurnover"], "scope": "scoringPlays only",
            "correctedAt": corrected_at, "sourceRetrievedAt": None,
            "note": "These legacy condensed-scoring false flags could have been normalization defaults. Their original raw response is unavailable for this correction, so they are conservatively unknown. No new source retrieval is claimed; detailed play flags and all scores/statistics remain unchanged."
        }
        differences = diff(before, after)
        expected = set(pointers) | {"/provenance/scoringPlayFlags"}
        assert {p for p, _, _ in differences} == expected, (gid, "Unexpected semantic change")
        assert all(old is False and new is None for p, old, new in differences if p in pointers)
        assert before["plays"] == after["plays"] and before["sources"] == after["sources"]
        assert all(before[k] == after[k] for k in ("retrievedAt", "generatedAt", "stats", "players", "quarters", "drives", "availability", "verification"))
        before_hash = sha(path)
        new_hash, new_size = module.atomic_json(path, after)
        entry.update(sha256=new_hash, bytes=new_size)
        changed.append({"gameId": gid, "beforeSha256": before_hash, "afterSha256": new_hash, "cells": len(pointers), "rows": changed_rows, "changedPointers": pointers, "retrievedAtPreserved": before["retrievedAt"], "sourceHashesPreserved": {s["id"]: s.get("sha256") for s in before["sources"]}})
        cell_count += len(pointers)
        row_count += changed_rows
    teams = json.loads((ROOT / "assets/data/team-details.json").read_bytes())
    matchup = json.loads((ROOT / "assets/data/matchup-breakdown.json").read_bytes())
    index["knownDisagreements"] = module.disagreement_catalog(index["games"], candidate_details, teams, matchup)
    module.atomic_json(candidate_index, index)
    validated = module.validate(candidate_index, candidate_details)
    assert all(sha(ROOT / path) == digest for path, digest in frozen.items()), "Published input changed during audit"
    receipt = {
        "status": "passed", "candidateOnly": True, "publishedDataUntouched": True,
        "method": "Conservative unknown replacement, not source-verified absence migration",
        "originalRawProofAvailableForAffectedReports": False,
        "correctedAt": corrected_at, "sourceRetrievedAt": None,
        "affectedReports": len(changed), "affectedCondensedRows": row_count,
        "falseToUnknownCells": cell_count, "fieldCounts": dict(flags),
        "matchingDetailedFlagCounts": dict(known_detailed),
        "contradictoryFalseCells": len(contradictions), "contradictions": contradictions,
        "validation": validated, "candidateRoot": str(args.candidate),
        "inputHashes": frozen, "candidateIndexSha256": sha(candidate_index),
        "changedReports": changed,
        "limitations": ["Original raw ESPN bodies for all 414 affected reports were not recoverable from retained evidence. None of 290 retained compressed raw sources matches the affected original SHA checksums.", "Public archive retrieval failed with cloud tunnel HTTP 403; no mass retrieval was attempted.", "Null deliberately does not assert the flags were false or true. Existing explicit false values, if present in the unavailable original raw bodies, also become unknown.", "This candidate requires root review and installation. It is not a published update."]
    }
    (AUDIT / "conservative-candidate-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({k: receipt[k] for k in ("status", "candidateOnly", "publishedDataUntouched", "affectedReports", "affectedCondensedRows", "falseToUnknownCells", "contradictoryFalseCells", "candidateIndexSha256", "validation")}, indent=2))


if __name__ == "__main__":
    main()
