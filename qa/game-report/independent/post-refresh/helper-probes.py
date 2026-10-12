#!/usr/bin/env python3
"""Six isolated checks of the evidence helper; no production/source/browser work."""
import copy
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[4]
HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(tempfile.mkdtemp(prefix="game-report-post-refresh-probes-", dir="/workspace/recovery-qa"))
DATA = ROOT / "assets/data"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


protected = [HERE / "audit-refresh.py", *DATA.glob("*.json"), *(DATA / "game-reports").glob("*.json")]
before = {str(p): sha(p) for p in protected}
original = json.loads((DATA / "game-reports.json").read_bytes())
baseline = json.loads((HERE / "reviewed-baseline.json").read_bytes())
cases = []


def fixture(name):
    repo = OUT / name
    data = repo / "assets/data"
    details = data / "game-reports"
    details.mkdir(parents=True)
    for p in DATA.glob("*.json"):
        if p.name != "game-reports.json":
            (data / p.name).symlink_to(p)
    for p in (DATA / "game-reports").glob("*.json"):
        (details / p.name).symlink_to(p)
    return repo, data, copy.deepcopy(original)


def changed_detail(data, index, game_id, change):
    path = data / "game-reports" / f"{game_id}.json"
    report = json.loads(path.read_bytes())
    change(report)
    path.unlink()  # Remove the isolated symlink; never write through it.
    body = (json.dumps(report, indent=2) + "\n").encode()
    path.write_bytes(body)
    entry = index["games"][game_id]
    entry.update(sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))
    for row in index["knownDisagreements"]:
        if row["gameId"] == game_id:
            row["reportSha256"] = entry["sha256"]


def run(name, repo, data, index, expected_code, expected_status, verify):
    (data / "game-reports.json").write_text(json.dumps(index))
    output = OUT / (name + ".json")
    proc = subprocess.run([sys.executable, str(HERE / "audit-refresh.py"), "--repo", str(repo), "--baseline", str(HERE / "reviewed-baseline.json"), "--output", str(output)], capture_output=True, text=True)
    receipt = json.loads(output.read_bytes())
    passed = proc.returncode == expected_code and receipt.get("status") == expected_status and verify(receipt)
    cases.append({"case": name, "passed": passed, "exitCode": proc.returncode, "status": receipt.get("status"), "error": receipt.get("error"), "receiptSha256": sha(output)})


repo, data, index = fixture("metadata-only")
changed_detail(data, index, "2026_04_DAL_HOU", lambda r: r.update(generatedAt="2099-01-01T00:00:00Z"))
run("metadata-only", repo, data, index, 0, "passed", lambda r: "2026_04_DAL_HOU" in r["metadataOnlyChangedReports"] and not r["sportingFactChanges"])

repo, data, index = fixture("changed-player-stat")


def change_player(report):
    player = next(p for p in report["players"]["DAL"] if p["stats"].get("passingYards") is not None)
    player["stats"]["passingYards"] += 1


changed_detail(data, index, "2026_04_DAL_HOU", change_player)
run("changed-player-stat", repo, data, index, 2, "needs_targeted_data_review", lambda r: any(v["gameId"] == "2026_04_DAL_HOU" and "players" in v["changedSections"] for v in r["sportingFactChanges"]))

repo, data, index = fixture("swapped-source-readings")
row = index["knownDisagreements"][0]
row["readings"][0]["value"], row["readings"][1]["value"] = row["readings"][1]["value"], row["readings"][0]["value"]
run("swapped-source-readings", repo, data, index, 1, "failed", lambda r: "source/value mapping" in r.get("error", ""))

repo, data, index = fixture("wrong-source-event-url")


def wrong_source_url(report):
    source = next(s for s in report["sources"] if s["id"] == "espn_game_report_401872967")
    source["url"] = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872980"


changed_detail(data, index, "2026_04_DAL_HOU", wrong_source_url)
run("wrong-source-event-url", repo, data, index, 1, "failed", lambda r: "ESPN selected-event URL" in r.get("error", ""))

repo, data, index = fixture("unresolvable-player-field-source")


def missing_source(report):
    player = next(p for p in report["players"]["DAL"] if p["stats"].get("passingYards") is not None)
    player["provenance"]["fieldSources"]["passingYards"] = ["missing_official_source"]


changed_detail(data, index, "2026_04_DAL_HOU", missing_source)
run("unresolvable-player-field-source", repo, data, index, 1, "failed", lambda r: "Unresolvable report/field source reference" in r.get("error", ""))

repo, data, index = fixture("removed-retained-archive")
game_id = next(g for g in index["games"] if g not in baseline["linkedGameIds"])
event = index["games"].pop(game_id)["espnEventId"]
index["eventIdToGameId"].pop(str(event))
index["knownDisagreements"] = [r for r in index["knownDisagreements"] if r["gameId"] != game_id]
index["coverage"]["reports"] -= 1
index["coverage"]["retainedArchiveReports"] -= 1
run("removed-retained-archive", repo, data, index, 1, "failed", lambda r: "Previously addressable reports disappeared" in r.get("error", ""))

after = {str(p): sha(p) for p in protected}
receipt = {"createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "helperSha256": before[str(HERE / "audit-refresh.py")], "cases": cases, "passed": all(c["passed"] for c in cases) and before == after, "productionUnchanged": before == after, "scope": "Six new outside-repository isolated fixtures; book/detail symlinks read-only except detached individual fake copies; no provider requests, refresh build or browser", "qualification": "The metadata-only timestamp and modified player value are controlled fixtures, not historical-source claims."}
path = OUT / "receipt.json"
path.write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"passed": receipt["passed"], "cases": cases, "productionUnchanged": receipt["productionUnchanged"], "receipt": str(path), "receiptSha256": sha(path)}, indent=2))
sys.exit(0 if receipt["passed"] else 1)
