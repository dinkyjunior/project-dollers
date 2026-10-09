#!/usr/bin/env python3
"""Accept a factual-equivalent source refresh without relabelling visual evidence."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((ROOT / name).read_text())


def bound(name):
    return {"path": name, "sha256": digest(ROOT / name)}


def main():
    output = ROOT / "qa/home-gem/acceptance-source-current.json"
    assert not output.exists(), "Use a fresh immutable receipt"
    source_name = "qa/home-gem/reviews/source-integration-607d-review.json"
    report_name = "qa/home-gem/source-current-hosted-webkit-v3/results.json"
    original_name = "qa/home-gem/acceptance-hosted.json"
    source, report, original = read(source_name), read(report_name), read(original_name)
    assert digest(ROOT / original_name) == "44c7dca2d4959c3e5191b8944b2d93c3312d529377222ebc125f3e090f15a965"
    assert digest(ROOT / source_name) == "3b011f4558c44c094a8eaab3f6830390e923a0bfa4c30e07ea4d602417c56203"
    assert source["status"] == "passed" and source["assertions"] == 3937 and source["failures"] == []
    assert original["status"] == "accepted" and len(original["reviews"]) == 6
    assert original["runtimeManifestSha256"] == source["beforeRuntimeManifestSha256"]
    runtime = {p.relative_to(ROOT).as_posix(): digest(p) for p in
               [ROOT / "index.html", *sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())]}
    runtime_id = hashlib.sha256(json.dumps(runtime, separators=(",", ":"), sort_keys=True).encode()).hexdigest()
    assert runtime_id == source["runtimeManifestSha256"] == report["runtimeManifestSha256"]
    assert runtime == source["incomingRuntimeManifest"] == report["runtimeManifest"]
    prior = read("qa/home-gem/hosted-current-webkit/results.json")
    assert digest(ROOT / "qa/home-gem/hosted-current-webkit/results.json") == "f2be80b281cdc8d9b0e8147b5b70159c2a17f2aa2fd7957c562c5b221967ef82"
    changed = {name for name in runtime if runtime[name] != prior["runtimeManifest"][name]}
    assert changed == {"assets/data/" + name for name in source["snapshotHashes"]["incoming"]}
    assert len(changed) == 5 and len(runtime) == 245
    assert report["status"] == "passed" and report["browserClosed"] is True and report["completedAt"]
    assert report["runtimeUnchanged"] and report["originalTestsUnchanged"] and report["helpersUnchanged"]
    assert report["base"] == "https://dinkyjunior.github.io/project-dollers/" and report["engine"] == "webkit"
    assert report["sourceReview"] == {**bound(source_name), "status": "passed"}
    assert report["helperSha256"] == digest(ROOT / "qa/home-gem/source-companion-v3.cjs")
    assert report["originalTests"] == prior["originalTestFiles"] and len(report["originalTests"]) == 15
    assert report["guardedFiles"] == {
        "qa/home-gem/final-native.cjs": prior["helperSha256"],
        "qa/home-gem/controls-audit.cjs": prior["controlsHelperSha256"]}
    for name, sha in {**report["originalTests"], **report["guardedFiles"]}.items():
        assert digest(ROOT / name) == sha
    qualification = report["qualification"]
    assert all(qualification[k] is True for k in ("actualBrowser", "strictTLS", "nativePhoneEmulation", "naturalMotion"))
    assert all(qualification[k] is False for k in ("responseSubstitution", "DOMOrCSSSubstitution", "clockSubstitution", "physicalIPhone", "fullVisualAudit"))
    assert len(report["results"]) == 2
    assert {(r["viewport"]["width"], r["viewport"]["height"]) for r in report["results"]} == {(393, 852), (430, 896)}
    semantic_hashes = json.loads(subprocess.check_output([
        "node", "-e", "const fs=require('fs'),c=require('crypto');let out={};for(const n of ['current','team-details','matchup-breakdown'])out[n]=c.createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync('assets/data/'+n+'.json')))).digest('hex');process.stdout.write(JSON.stringify(out));"], cwd=ROOT))
    expected_identities = {}
    for name, sha in semantic_hashes.items():
        data = read("assets/data/" + name + ".json")
        expected_identities[name] = {k: data[k] for k in ("season", "throughWeek", "retrievedAt") if k in data}
        expected_identities[name]["serializedSha256"] = sha
        assert report["expectedDatasetIdentity"][name] == {
            **expected_identities[name], "file": "assets/data/" + name + ".json"}
    for result in report["results"]:
        assert result["status"] == "passed" and result["completedAt"]
        assert all(not result["errors"][k] for k in ("javascript", "console", "http", "failed", "external"))
        assert all(r["error"] in {"Load request cancelled", "net::ERR_ABORTED"} and r["url"].startswith(report["base"])
                   for r in result["errors"].get("cancelledNavigation", []))
        rows = result["servedRuntime"]
        assert len(rows) == 245 and {r["file"]: r["sha256"] for r in rows} == runtime
        assert all(r["status"] == 200 and r["bytes"] == (ROOT / r["file"]).stat().st_size for r in rows)
        assert result["sourceDesignatedFixture"]
        assert len(result["actions"]) >= 10
        assert any(r["kind"] == "native-direct-route-reload" and r["httpStatus"] == 200
                   and r["indexSha256"] == runtime["index.html"] for r in result["actions"])
        assert {r["kind"] for r in result["identities"]} >= {
            "current", "team-details", "matchup-breakdown", "matchup-breakdown-after-reload", "current-after-return"}
        for identity in result["identities"]:
            name = next(k for k in expected_identities if identity["kind"] == k or identity["kind"].startswith(k + "-after-"))
            assert {k: v for k, v in identity.items() if k != "kind"} == expected_identities[name]
        for motion in (result["motion"], result["returnMotion"]):
            samples, frames = motion["samples"], motion["frames"]
            assert motion["status"] == "passed"
            assert len(samples) == len(frames) == 4
            assert len({f["file"] for f in frames}) == 4 and len({f["sha256"] for f in frames}) >= 2
            for sample in samples:
                assert sample["state"] == "running" and sample["circuits"] == 4 and sample["glints"] == 12
                assert len(sample["paths"]) == 14 and all(p["play"] == "running" for p in sample["paths"])
            for index, first in enumerate(samples[0]["paths"]):
                assert all(s["paths"][index]["class"] == first["class"] for s in samples)
                assert any(s["paths"][index]["dash"] != first["dash"] for s in samples[1:])
            for frame in frames:
                image = (ROOT / Path(report_name).parent / frame["file"]).resolve()
                assert image.is_relative_to(ROOT / Path(report_name).parent) and image.is_file()
                assert digest(image) == frame["sha256"] and image.stat().st_size == frame["bytes"]
                assert frame["viewport"] == result["viewport"] and frame["at"]
    assert len(report["originals"]) == 2
    assert {(r["viewport"]["width"], r["viewport"]["height"]) for r in report["originals"]} == {(393, 852), (430, 896)}
    originals = []
    for row in report["originals"]:
        name = str(Path(report_name).parent / row["file"])
        assert digest(ROOT / name) == row["sha256"] and (ROOT / name).stat().st_size == row["bytes"]
        originals.append(bound(name))
    receipt = {"status": "accepted", "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "runtimeManifestSha256": runtime_id, "runtimeFiles": len(runtime), "originalHostedAcceptance": bound(original_name),
               "sourceReview": bound(source_name), "freshHostedSourceCompanion": bound(report_name),
               "changedRuntimeFiles": sorted(changed), "unchangedReviewedNondataFiles": 240,
               "actualServedBodyChecks": 490, "newSupplementalOriginals": originals,
               "qualification": "The six-agent visual/control acceptance remains bound to its actual original c940 dataset. This separate fresh HTTPS companion accepts only the audited factual-equivalent five-source-file integration."}
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({k: receipt[k] for k in ("status", "runtimeManifestSha256", "actualServedBodyChecks", "unchangedReviewedNondataFiles")}, indent=2))


if __name__ == "__main__":
    main()
