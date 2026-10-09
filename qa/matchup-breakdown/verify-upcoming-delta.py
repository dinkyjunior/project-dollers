#!/usr/bin/env python3
"""Validate historical full acceptance plus the separately executed current delta.

The old full browser suites remain evidence for their exact old application.
Only an independently proved equal statistical projection is reused; changed
fixture, price, availability and selector behavior requires new native evidence.
"""
import argparse
import gzip
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "qa/matchup-breakdown"
ROLES = {"visual", "controls", "data", "sources", "assets-motion", "qa"}
CHANGES = {"assets/team-details.js", *["assets/data/" + n + ".json" for n in
           ("current", "team-details", "matchup-breakdown", "player-history", "provenance")]}
BASE_REVIEW_SHA = "102b511eed2572a749049b56a298c333cc74e33cfa61bc867a9682f2cab51682"
BASE_CANONICAL = "82ae9f0ae262a83f644b3cf6895d801ffe33362b9d5d09c5d1c0aac8b8ba0cee"
BASE_ZIP_SHA = "c12100c0d33f18c505cd034f2a871303aa276399797f805a7f1ea0d2f0775f98"
SHA = lambda b: hashlib.sha256(b).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def file(name):
    p = (ROOT / name).resolve()
    require(p.is_relative_to(ROOT) and p.is_file(), "Missing/outside evidence: " + str(name))
    return p


def reference(row, parse=True):
    body = file(row["path"]).read_bytes()
    require(SHA(body) == row["sha256"], "Evidence changed: " + row["path"])
    return json.loads(body) if parse else body


def current_runtime():
    return {p.relative_to(ROOT).as_posix(): SHA(p.read_bytes()) for p in
            [ROOT / "index.html", *sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())]}


def helpers(v):
    for name, digest in v.items():
        require(SHA(file(name).read_bytes()) == digest, "Assertion helper changed: " + name)


def images(v, directory):
    found = set()
    if isinstance(v, dict):
        n, h = v.get("file"), v.get("sha256")
        if isinstance(n, str) and n.endswith(".png") and isinstance(h, str):
            p = (directory / n).resolve()
            require(p.is_relative_to(ROOT), "Capture outside repository")
            found.add((p.relative_to(ROOT).as_posix(), h))
        for child in v.values():
            found.update(images(child, directory))
    elif isinstance(v, list):
        for child in v:
            found.update(images(child, directory))
    return found


def originals(rows):
    pairs = {(r["path"], r["sha256"]) for r in rows}
    require(len(pairs) == len(rows), "Duplicate common original")
    for row in rows:
        require(file(row["path"]).suffix == ".png", "Original is not PNG")
        reference(row, False)
    return pairs


def reviewers(rows, binding, expected, reports):
    require(len(rows) == 6 and {r["name"] for r in rows} == ROLES, "Six real specialists required")
    for row in rows:
        r = reference(row)
        require(r.get("status") == "accepted" and r.get("auditedAt"), "Incomplete review: " + row["name"])
        require(r.get("runtimeManifestSha256") == binding, "Wrong reviewed runtime: " + row["name"])
        b = r.get("completedActualReport", {})
        require((b.get("path"), b.get("sha256")) in reports, "Wrong completed report: " + row["name"])
        require(expected <= {(i["path"], i["sha256"]) for i in r.get("personallyViewedOriginals", [])},
                "Specialist did not inspect every new original: " + row["name"])


def base_acceptance(row, manifest):
    require(row["sha256"] == BASE_REVIEW_SHA, "Historical acceptance was rewritten")
    doc = reference(row)
    require(doc["status"] == "accepted" and reference(doc["runtimeManifest"]) == manifest,
            "Historical manifest/review mismatch")
    expected = originals(doc["originalScreenshots"])
    emitted, sizes, inputs, reports = set(), {}, 0, set()
    original_helpers = None
    for ref in doc["nativeReports"]:
        r = reference(ref)
        require(r.get("status") == "passed" and r.get("completedAt") and not r.get("captureOnly"), "Historical suite incomplete")
        require(r.get("unchangedDuringQA") is True and r.get("testLogicUnchangedDuringQA") is True,
                "Historical source/assertions changed")
        require(r["source"]["runtimeFiles"] == manifest, "Historical suite belongs to another runtime")
        helpers(r["source"]["testFiles"])
        if r["engine"] == "webkit":
            original_helpers = r["source"]["testFiles"]
        for c in r["results"]:
            require(c.get("status") == "passed" and c.get("completedAt"), "Historical viewport incomplete")
            require(c.get("directLoadReload") is True and c.get("isolatedUpdateRecovery") and c.get("protected"),
                    "Historical required coverage absent")
            require(all(c.get("errors", {}).get(k) == [] for k in ("javascriptAndConsole", "http", "external", "failed")),
                    "Historical browser/request error")
            ctrl = c.get("controls", {})
            require(ctrl.get("status") == "passed" and len(ctrl.get("nativeInputs", [])) == 685,
                    "Historical 685-input coverage differs")
            require(ctrl.get("coverage", {}).get("unexercised") == [], "Historical control omitted")
            inputs += len(ctrl["nativeInputs"])
            sizes.setdefault(r["engine"], set()).add((c["viewport"]["width"], c["viewport"]["height"]))
        emitted |= images(r, file(ref["path"]).parent)
        reports.add((ref["path"], ref["sha256"]))
    require(sizes.get("chromium") == {(393, 852), (430, 896), (768, 1024), (1440, 1000)} or
            ({(393, 852), (430, 896)} <= sizes.get("chromium", set()) and
             {768, 1440} <= {w for w, _ in sizes.get("chromium", set())}), "Historical responsive coverage absent")
    require(sizes.get("webkit") == {(393, 852), (430, 896)} and inputs == 4110, "Historical full coverage differs")
    require(expected <= emitted, "Historical originals were not emitted")
    reviewers(doc["reviewers"], BASE_CANONICAL, expected, reports)
    a = reference(doc["independentSourceAudit"])
    require(a.get("status") == "passed" and a.get("failures") == [] and a.get("assertions", 0) >= 1000 and
            a.get("snapshotSha256", a.get("datasetSha256")) == manifest["assets/data/matchup-breakdown.json"],
            "Historical source audit differs")
    require(original_helpers is not None and len(original_helpers) == 15, "Original fifteen helper identity absent")
    return original_helpers


def complete_native(ref, manifest, original_helpers):
    r = reference(ref)
    require(r.get("status") == "passed" and r.get("completedAt") and r.get("browserClosed") is True,
            "Current native delta incomplete: " + ref["path"])
    require(r.get("unchangedDuringQA") is True and r.get("originalTestLogicUnchangedDuringQA") is True,
            "Current delta runtime/helpers changed")
    require(r["source"]["runtimeFiles"] == manifest, "Current native delta belongs to another runtime")
    require(r["source"].get("originalTestFiles") == original_helpers, "Original fifteen assertions changed")
    helpers(r["source"]["testFiles"])
    for c in r["results"]:
        require(c.get("status") == "passed" and c.get("completedAt"), "Current phone incomplete")
        errors = c.get("errors")
        if isinstance(errors, dict):
            require(all(errors.get(k) == [] for k in ("javascriptAndConsole", "http", "failed")),
                    "Current availability browser/request error")
        else:
            require(all(c.get(k) == [] for k in ("errors", "httpErrors", "transportErrors")), "Current browser/request error")
    return r


def inspect(doc, hosted=False):
    require(doc.get("status") == "accepted", "Current delta is not accepted")
    old = reference(doc["baseRuntimeManifest"])
    require(SHA(canonical(old)) == BASE_CANONICAL, "Historical runtime identity differs")
    old_helpers = base_acceptance(doc["baseAcceptance"], old)
    manifest = reference(doc["runtimeManifest"])
    binding = SHA(canonical(manifest))
    require(manifest == current_runtime() and doc["runtimeManifestSha256"] == binding, "Current worktree differs")
    require(set(old) == set(manifest) and len(manifest) == 235, "Runtime file set differs")
    changed = {p for p in old if old[p] != manifest[p]}
    require(changed == CHANGES == set(doc["changedRuntimePaths"]), "Delta exceeds its six reviewed runtime files")
    archive = doc["baseSourceArchive"]
    require(archive["sha256"] == BASE_ZIP_SHA, "Historical source ZIP differs")
    reference(archive, False)
    with zipfile.ZipFile(file(archive["path"])) as z:
        for p in CHANGES:
            require(SHA(z.read(p)) == old[p], "Historical preimage differs: " + p)
    before = reference(doc["baseSelectorBody"], False)
    after = file("assets/team-details.js").read_bytes()
    require(SHA(before) == old["assets/team-details.js"], "Archived selector differs")
    def excluding_selector(body):
        start = body.index(b"  function nextGame() {")
        end = body.index(b"  function dateTime(", start)
        return body[:start] + body[end:]
    require(excluding_selector(before) == excluding_selector(after), "Code changed outside nextGame")
    unit = reference(doc["resolverValidation"])
    require(unit.get("status") == "passed" and unit.get("onlyNextGameFunctionChanged") is True and
            unit.get("blockingFindings") == [], "Resolver validation failed")
    reference(unit["runtimeBody"], False); reference(unit["originalRuntimeBody"], False); reference(unit["testFile"], False)
    require(all(r["exitCode"] == 0 for r in unit["actualRuns"]), "Actual resolver checks failed")
    require(any("pass 12" in r.get("stdout", "") and "fail 0" in r.get("stdout", "") for r in unit["actualRuns"]),
            "Twelve meaningful resolver tests absent")
    independent = reference(doc["independentResolverAudit"])
    require(independent.get("status") == "passed" and independent.get("blockingFindings") == [] and
            independent.get("checks", 0) >= 78 and independent["bindings"]["teamDetailsJsSha256"] == manifest["assets/team-details.js"],
            "Independent resolver audit failed")
    snapshot = json.loads(file("assets/data/matchup-breakdown.json").read_text())
    require(snapshot["dependencies"]["currentSha256"] == manifest["assets/data/current.json"] and
            snapshot["dependencies"]["teamDetailsSha256"] == manifest["assets/data/team-details.json"], "Current data dependencies differ")
    adoption = reference(doc["sourceAdoption"])
    require(all(manifest[p] == h for p, h in adoption["adoptedSnapshotFiles"].items()), "Adopted five source bodies differ")
    source_manifest = reference(adoption["sourceManifest"])
    require(source_manifest["snapshotSha256"] == manifest["assets/data/matchup-breakdown.json"] and
            len(source_manifest["sources"]) == 94, "Current raw source manifest differs")
    for source in source_manifest["sources"]:
        body = file(source["bodyPath"]).read_bytes()
        encoding = source["archiveEncoding"]
        require(encoding in {"original-gzip", "gzip-of-exact-response"}, "Unsupported source archive encoding")
        response_body = body if encoding == "original-gzip" else gzip.decompress(body)
        require(SHA(body) == source["archiveSha256"] and SHA(response_body) == source["sha256"],
                "Exact retained public response differs: " + source["id"])
    for key, minimum in (("independentSourceAudit", 712248), ("fixtureSourceAudit", 1549)):
        a = reference(doc[key])
        require(a.get("status") == "passed" and a.get("completedAt") and a.get("failures") == [] and
                a.get("assertions", 0) >= minimum and a["snapshotSha256"] == manifest["assets/data/matchup-breakdown.json"] and
                a["sourceManifestSha256"] == adoption["sourceManifest"]["sha256"], "Current source audit failed: " + key)
        helper = "audit-dataset-final-refresh.py" if key == "independentSourceAudit" else "audit-fixture-context-final-refresh.py"
        require(SHA(file(PREFIX + "/reviews/source-evidence/" + helper).read_bytes()) == a["auditHelperSha256"],
                "Executed independent source assertion helper changed")
        if key == "fixtureSourceAudit":
            require(all(manifest["assets/data/" + name] == h for name, h in a["fiveSnapshotHashes"].items()),
                    "Fixture-context audit belongs to different source bodies")
    projection = reference(doc["projectionEquivalence"])
    require(projection.get("status") == "passed" and projection.get("failures") == [] and
            projection.get("beforeSnapshotSha256") == old["assets/data/matchup-breakdown.json"] and
            projection.get("afterSnapshotSha256") == manifest["assets/data/matchup-breakdown.json"] and
            projection.get("statisticalProjectionEquivalent") is True and projection.get("assertions", 0) >= 206812 and
            projection.get("totalTeamWindowBranches") == 1536, "Independent statistical projection is not equal")
    reference(projection["independentModel"], False)
    require(projection["independentModel"]["sha256"] == old_helpers[projection["independentModel"]["path"]], "Independent model changed")
    require(SHA(file(PREFIX + "/reviews/source-evidence/audit-projected-equivalence.cjs").read_bytes()) ==
            projection["auditHelperSha256"], "Executed independent projection assertion helper changed")
    required_availability = {(d["team"], d["gameId"], d["field"]) for d in projection["availabilityDifferences"]}
    report_refs = doc["nativeReports"]
    emitted, engines, report_pairs, inputs = set(), set(), set(), 0
    for ref in report_refs:
        r = complete_native(ref, manifest, old_helpers)
        engines.add(r["engine"])
        require({(c["viewport"]["width"], c["viewport"]["height"]) for c in r["results"]} == {(393, 852), (430, 896)},
                "Both current phones required")
        for c in r["results"]:
            cov = c["deltaCoverage"]
            require(cov.get("ownUpcomingCards") == 32 and all(cov.get(k) is True for k in
                    ("futureFixtureIdentity", "futureFixtureQBAvailability", "originatingTeamReturn", "directLoadReload",
                     "researchFixtureContext", "activeGameExcluded", "lineupAvailabilitySourceExact", "pittsburghOddsSourceExact")),
                    "Current scoped native behavior omitted")
            require(c.get("directLoadReload") is True and len(c.get("nativeInputs", [])) >= 80, "Native inputs/reload omitted")
            require(len(c["allClubSelectors"]) == 32 and all(x.get("nativeRoundTrip") is True and
                    x["metadataUpcoming"] == x["renderedAndClickedGame"] for x in c["allClubSelectors"]), "Club fixture route differs")
            inputs += len(c["nativeInputs"])
        emitted |= images(r, file(ref["path"]).parent)
        report_pairs.add((ref["path"], ref["sha256"]))
    require(engines == {"chromium", "webkit"}, "Both actual native delta engines required")
    # Availability is deliberately outside the equal historical projection.
    availability_cases = set()
    for ref in doc["availabilityReports"]:
        r = complete_native(ref, manifest, old_helpers)
        for c in r["results"]:
            covered = {(a["team"], a["gameId"], a["field"]) for a in c["availabilityCoverage"] if a.get("status") == "passed"}
            require(required_availability <= covered, "Changed current availability fact group omitted")
            availability_cases.add((r["engine"], c["viewport"]["width"], c["viewport"]["height"]))
        emitted |= images(r, file(ref["path"]).parent)
        report_pairs.add((ref["path"], ref["sha256"]))
    require(availability_cases >= {(e, w, h) for e in ("chromium", "webkit") for w, h in ((393, 852), (430, 896))},
            "Changed availability requires both phones in both engines")
    expected = originals(doc["originalScreenshots"])
    require(len(expected) >= 12 and expected <= emitted, "Current common originals missing or not emitted")
    reviewers(doc["reviewers"], binding, expected, report_pairs)
    if hosted:
        h = reference(doc["hostedReport"])
        require(h.get("status") == "passed" and h.get("completedAt") and h.get("hosted") is True and
                h.get("qualification", {}).get("strictTLS") is True and h["source"]["runtimeFiles"] == manifest,
                "Current actual strict-TLS hosted acceptance incomplete")
        helpers(h["source"]["testFiles"])
        require({s["file"] for s in h["servedRuntime"]} == set(manifest) and all(s["status"] == 200 and
                s["sha256"] == manifest[s["file"]] for s in h["servedRuntime"]), "Actual served bodies differ")
        require(all(c.get("status") == "passed" for c in h["results"]) and len(h["results"]) == 3, "Hosted scenarios incomplete")
    return {"status": "passed", "kind": "historical-full-plus-current-reviewed-delta", "baseRuntimeManifestSha256": BASE_CANONICAL,
            "runtimeManifestSha256": binding, "runtimeFileCount": len(manifest), "changedRuntimePaths": sorted(changed),
            "historicalNativeInputs": 4110, "currentDeltaNativeInputs": inputs, "statisticalProjectionBranches": 1536,
            "changedAvailabilityFactGroups": len(required_availability), "specialistCount": 6,
            "currentOriginalScreenshotCount": len(expected), "hostedVerificationRequired": hosted,
            "qualification": "Historical 4110 inputs retain their old source binding; current acceptance adds a verified equal statistical projection and new selector/fixture/price/availability native checks."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review", default=PREFIX + "/release/review-upcoming-delta.json")
    parser.add_argument("--hosted", action="store_true")
    args = parser.parse_args()
    print(json.dumps(inspect(json.loads(file(args.review).read_text()), args.hosted), indent=2))
