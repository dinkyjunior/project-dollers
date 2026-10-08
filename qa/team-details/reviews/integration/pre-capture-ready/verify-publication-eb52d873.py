"""Verify a reviewed Dallas release against exact refs, Pages jobs and served bytes.

This read-only verifier is a release gate, not a deployment command. Missing,
partial, capture-only or mismatched evidence fails instead of granting acceptance.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import re
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
PREFIX = Path("qa/team-details")
BASE = "https://dinkyjunior.github.io/project-dollers/"
REPO = "dinkyjunior/project-dollers"
APPLICATION_REF = "refs/tags/team-details-reviewed-fe69378e"
TEAM_HASH = "fc77b349652f8894fe5478b6541f25d9de15b97e84fa3ea3ddae84e30d7187c4"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
PHONES = {(393, 852), (430, 896)}
CHROME_SIZES = PHONES | {(768, 1024), (1440, 1000)}
DATA_DELTA = {"assets/data/current.json", "assets/data/player-history.json", "assets/data/provenance.json"}
PROTECTED_SCRIPT_SHA = "74a74e5d4f427fbbcd4631ddec4d3f886ec0c23919b505db90d4623e8cc946f2"
sha = lambda value: hashlib.sha256(value).hexdigest()


class VerificationError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def timestamp(value):
    require(isinstance(value, str), "Missing completion/retrieval timestamp")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parsed.tzinfo is not None, "Timestamp lacks timezone")
    return parsed.astimezone(timezone.utc)


def safe_file(value):
    require(isinstance(value, str) and value and not any(ord(c) < 32 for c in value), "Invalid evidence path")
    parts = PurePosixPath(value)
    require(not parts.is_absolute() and ".." not in parts.parts, "Evidence must remain inside the repository")
    file = ROOT.joinpath(*parts.parts)
    require(file.resolve().is_relative_to(ROOT.resolve()), "Evidence symlink leaves the repository")
    return file


def read_json(file):
    return json.loads(file.read_bytes())


def source_equivalence(incoming_path, original_path, published_path, selected=None):
    """No bare equivalent-status claim can waive a changed provider checksum."""
    guard = ROOT / PREFIX / "verify-source-equivalence.py"
    value = json.loads(subprocess.check_output([sys.executable, str(guard),
        "--classification", incoming_path.relative_to(ROOT).as_posix(),
        "--original-manifest", original_path.relative_to(ROOT).as_posix(),
        "--published-manifest", published_path.relative_to(ROOT).as_posix()], cwd=ROOT, timeout=60))
    require(value.get("status") == "passed" and value.get("consumedFootballAndStructureChanges") == 0 and
            value.get("rawWholeBodyHashesEqual") is False, "Changed games source lacks actual qualified projection recomputation")
    if selected is not None:
        selected.add(guard.relative_to(ROOT).as_posix())
        for name in value["boundEvidenceFiles"]:
            safe_file(name); selected.add(name)
    return value


def manifest(file):
    value = read_json(file)
    require(isinstance(value, dict) and len(value) == 231, "Require the exact 231-file runtime manifest")
    for name, digest in value.items():
        safe_file(name)
        require(isinstance(digest, str) and SHA256.fullmatch(digest), "Malformed runtime hash: " + name)
    require(value.get("assets/data/team-details.json") == TEAM_HASH, "Retained Dallas dataset differs from its source audit")
    return value


def api(endpoint):
    return json.loads(subprocess.check_output(
        ["gh", "api", "repos/" + REPO + "/" + endpoint], cwd=ROOT, text=True, timeout=60))


def commit_blobs(head, files):
    require(bool(COMMIT.fullmatch(head)), "Invalid commit identity")
    process = subprocess.Popen(["git", "cat-file", "--batch"], cwd=ROOT,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    result = {}
    try:
        for name in sorted(files):
            safe_file(name)
            process.stdin.write((head + ":" + name + "\n").encode())
            process.stdin.flush()
            header = process.stdout.readline().decode().strip().split()
            require(len(header) == 3 and header[1] == "blob", "Missing committed blob: " + name)
            size = int(header[2])
            raw = process.stdout.read(size)
            require(len(raw) == size and process.stdout.read(1) == b"\n", "Incomplete Git blob: " + name)
            result[name] = raw
    finally:
        process.stdin.close()
        process.stdout.close()
        process.stderr.close()
        process.wait(timeout=20)
    return result


def verify_reviewers(document, status, selected, expected_manifest=None, original_manifest=None):
    require(document.get("status") == status, "Missing complete six-reviewer acceptance")
    rows = document.get("reviewers")
    require(isinstance(rows, list) and len(rows) == 6, "Exactly six reviewer receipts are required")
    names = [row.get("name") for row in rows]
    require(all(isinstance(n, str) and n for n in names) and len(set(names)) == 6, "Reviewer identities must be unique")
    evidence_paths = [row.get("evidence") for row in rows]
    require(all(isinstance(name, str) and name for name in evidence_paths) and len(set(evidence_paths)) == 6,
            "Each independent reviewer needs its own distinct original receipt")
    for row in rows:
        require(row.get("decision") == "accepted", "A reviewer has not accepted")
        file = safe_file(row.get("evidence"))
        require(sha(file.read_bytes()) == row.get("evidenceSha256"), "Reviewer evidence hash mismatch: " + str(file))
        evidence = read_json(file)
        require(evidence.get("status", evidence.get("decision")) in ("accepted", "passed"), "Reviewer receipt is not accepted/passed")
        if expected_manifest is not None:
            binding = evidence.get("runtimeManifestSha256", evidence.get("runtimeManifest", {}).get("sha256"))
            binding = evidence.get("publishedRuntimeManifestSha256", binding)
            require(binding == expected_manifest, "Reviewer receipt belongs to a different runtime: " + str(file))
        if original_manifest is not None:
            require(evidence.get("originalRuntimeManifestSha256") == original_manifest,
                    "Refresh reviewer has not bound the original accepted runtime: " + str(file))
        selected.add(file.relative_to(ROOT).as_posix())
    return rows


def referenced_check(row, selected):
    require(row.get("status") == "passed", "A coordinator check has not passed")
    file = safe_file(row.get("file"))
    require(sha(file.read_bytes()) == row.get("sha256"), "Check receipt hash mismatch: " + str(file))
    value = read_json(file)
    require(value.get("status") == "passed", "Referenced original check is not passed: " + str(file))
    require(not value.get("captureOnly") and not value.get("failure"), "Capture-only/failed evidence cannot establish functional acceptance")
    timestamp(value.get("completedAt", value.get("auditedAt", value.get("recordedAt", value.get("reviewedAt")))))
    selected.add(file.relative_to(ROOT).as_posix())
    return value


def verify_helper_bytes(value, selected):
    helpers = value.get("source", {}).get("testFiles")
    if helpers is None:
        return
    require(isinstance(helpers, dict) and helpers, "Referenced native helper hashes are missing")
    for name, digest in helpers.items():
        file = safe_file(name)
        require(SHA256.fullmatch(digest) and sha(file.read_bytes()) == digest,
                "Original native test logic differs from the retained helper: " + name)
        selected.add(name)


def stopped_infinite_clocks(sample):
    """Use measured native animation clocks, rather than informational DOM state."""
    clocks = sample.get("clocks")
    return isinstance(clocks, list) and all(clock.get("state") in {"paused", "finished", "idle"} for clock in clocks)


def complete_native(value, expected_manifest, hosted):
    """Return covered viewports only for an actual completed full team runner."""
    if value.get("engine") not in ("chromium", "webkit"):
        return set()
    qualification = value.get("qualification", {})
    require(value.get("hosted") is hosted, "Native browser evidence has the wrong hosted/local scope")
    require(qualification.get("genuineBrowser") is True and qualification.get("noSiteOrSourceDataSubstitution") is True,
            "Require genuine native browser evidence without site/source substitutions")
    require(value.get("captureOnly") is False, "Native functional evidence must explicitly exclude capture-only mode")
    require(value.get("unchangedDuringQA") is True and value.get("testLogicUnchangedDuringQA") is True,
            "Runtime and independent helpers must remain frozen during the complete run")
    require(value.get("source", {}).get("runtimeFiles") == expected_manifest, "Native report belongs to a different runtime")
    require(value["source"].get("teamFormHash") == TEAM_HASH, "Native report used different Dallas data")
    if hosted:
        require(qualification.get("strictTLS") is True and value.get("base") == BASE,
                "Require actual approved hosted URL with strict TLS")
    result = set()
    require(isinstance(value.get("results"), list) and value["results"], "Native report contains no executed cases")
    for case in value["results"]:
        require(case.get("status") == "passed", "Native browser case has not passed")
        require(case.get("directLoadReload") is True, "Native direct load/refresh was not verified")
        require(all(not rows for rows in case.get("errors", {}).values()) and bool(case.get("errors")),
                "Native browser errors were present or not measured")
        controls = case.get("controls", {})
        require(controls.get("status") == "passed" and len(controls.get("nativeClicks", [])) >= 312,
                "Missing complete native interaction coverage")
        require(len(controls.get("filterCases", [])) >= 24 and len(controls.get("gameReports", [])) >= 20
                and len(controls.get("playerDisclosures", [])) >= 83, "Missing filter/report/player coverage")
        coverage = controls.get("coverage", {})
        require(coverage.get("untested") == [] and coverage.get("observed") and
                set(coverage["observed"]) <= set(coverage.get("exercised", [])) | set(coverage.get("disabled", [])),
                "An implemented control was left untested")
        viewport = case.get("viewport", {})
        if (viewport.get("width"), viewport.get("height")) in PHONES:
            motion = case.get("motion", {})
            require(motion.get("visibleAdvancingClocks", 0) > 0 and
                    motion.get("paint", {}).get("actualNaturalPixelChange") is True and
                    stopped_infinite_clocks(motion.get("reduced", {})) and
                    stopped_infinite_clocks(motion.get("inactive", {})),
                    "Actual mobile visible, reduced and inactive motion checks are incomplete")
        require(case.get("initialGeometry", {}).get("clipped") == [] and case.get("finalGeometry", {}).get("clipped") == [],
                "Native full-screen geometry was clipped or not measured")
        if (viewport.get("width"), viewport.get("height")) == (393, 852):
            routes = case.get("allTeamRoutes", {})
            require(routes.get("status") == "passed" and routes.get("teams") == 32 and len(routes.get("results", [])) == 32 and
                    len({row.get("team") for row in routes["results"]}) == 32,
                    "Complete direct-route coverage for all 32 NFL clubs is missing")
        result.add((viewport.get("width"), viewport.get("height")))
    return result


def protected_regression(value, binding, original, engine, selected):
    """Require the real retained legacy report and its full-runtime freeze receipt."""
    require(value.get("status") == binding.get("status") == "passed", "Protected regression is incomplete")
    timestamp(value.get("completedAt")); timestamp(binding.get("completedAt"))
    require("genuine " + engine in value.get("mode", "") and value.get("browser") and
            value.get("testScriptSha256") == PROTECTED_SCRIPT_SHA,
            "Protected native engine or exact original regression logic differs")
    subset = value.get("runtimeManifest", {})
    require(len(subset) == 44 and all(original.get(name) == digest for name, digest in subset.items()) and
            value.get("runtimeManifestAfterQA") == subset,
            "Protected original 44-file runtime subset changed or differs from the accepted application")
    require(value.get("source", {}).get("path") == "assets/data/current.json" and
            value["source"].get("sha256") == original["assets/data/current.json"],
            "Protected current-data source differs from the frozen candidate")
    require(binding.get("runtimeFiles") == original and binding.get("unchangedDuringQA") is True and
            binding.get("testLogicUnchangedDuringQA") is True,
            "Protected regression lacks its exact 231-file runtime/test freeze receipt")
    helpers = binding.get("testFiles", {})
    require(helpers.get("qa/run.cjs") == PROTECTED_SCRIPT_SHA and len(helpers) == 4,
            "Protected original helper inventory/hash is incomplete")
    for name, digest in helpers.items():
        file = safe_file(name)
        require(SHA256.fullmatch(digest) and sha(file.read_bytes()) == digest, "Protected helper changed: " + name)
        selected.add(name)
    cases = value.get("results", [])
    expected = CHROME_SIZES | {(320, 700)} if engine == "chromium" else PHONES
    require(len(cases) == len(expected) and {(case.get("viewport", {}).get("width"), case.get("viewport", {}).get("height")) for case in cases} == expected,
            "All required protected native viewport cases must complete")
    for case in cases:
        require(case.get("status") == "passed" and
                all(case.get(key) == 0 for key in ("externalRequests", "consoleErrors", "httpErrors", "failedRequests")) and
                len(case.get("checks", [])) >= 22, "Protected native errors or incomplete original behavior checks")
        for field, expanded in (("perimeter", False), ("expandedPerimeter", True)):
            rows = case.get(field, [])
            require(len(rows) == 5 and len({row.get("player") for row in rows}) == 5,
                    "All five complete player card perimeters must be audited")
            if expanded:
                require(any(row.get("expanded") is True and row.get("expandedResearchVisibleCount", 0) >= 1 for row in rows),
                        "At least the originally expanded personal-research card must be measured")
            for row in rows:
                track, phase = row.get("maxTrackDistance"), row.get("maxLightPhaseDifference")
                require(row.get("samples") == 32 and set(row.get("edges", [])) == {"top", "right", "bottom", "left"} and
                        row.get("enclosesPortraitNameAndStats") is True and isinstance(row.get("expanded"), bool) and
                        (expanded or row["expanded"] is False) and
                        row.get("width", 0) > 0 and row.get("height", 0) > 0 and
                        isinstance(track, (int, float)) and math.isfinite(track) and 0 <= track < 2 and
                        isinstance(phase, (int, float)) and math.isfinite(phase) and 0 <= phase < .2,
                        "Protected complete-card geometry or synchronized travelling-light threshold failed")
                if row["expanded"]:
                    require(row.get("expandedResearchVisibleCount", 0) >= 1,
                            "Expanded personal research was not enclosed by the complete-card perimeter")
    return {(case["viewport"]["width"], case["viewport"]["height"]) for case in cases}


def operational_supervision(local_values, selected):
    """Keep the explicit 2400/4800-second process qualification separate from QA."""
    directory = str(PREFIX / "local-webkit-final-v3-process")
    names = {"originalStart": directory + "/started.json", "originalExit": directory + "/exit.json",
             "supervisionStart": directory + "/external-supervision/started.json",
             "supervisionExit": directory + "/external-supervision/exit.json"}
    documents = {}
    for key, name in names.items():
        file = safe_file(name); documents[key] = read_json(file); selected.add(name)
    start, exit = documents["originalStart"], documents["originalExit"]
    begin, end = documents["supervisionStart"], documents["supervisionExit"]
    raw = local_values.get(str(PREFIX / "local-webkit-final-v3/results.json"))
    require(raw is not None and raw.get("status") == "passed", "Original full native report is mandatory for process disposition")
    require(start.get("timeoutSeconds") == begin.get("originalTimeoutSeconds") == 2400 and
            begin.get("effectiveTimeoutSeconds") == end.get("effectiveTimeoutSeconds") == 4800 and
            begin.get("originalStartedAt") == end.get("originalStartedAt") == start.get("startedAt"),
            "Original/effective native operational budgets were not explicitly preserved")
    require(begin.get("originalStartedReceiptSha256") == end.get("originalStartedReceiptSha256") == sha(safe_file(names["originalStart"]).read_bytes()),
            "Operational supervisor refers to a different original process receipt")
    require(begin.get("childIdentity", {}).get("pid") == start.get("pid") and
            begin["childIdentity"].get("argv") == start.get("command") and
            begin.get("parentIdentity", {}).get("pid") and begin["parentIdentity"].get("startTicks") and
            begin["childIdentity"].get("startTicks") and begin.get("authorization") and
            begin.get("runtimeAndTestsUnchangedBefore") is True and end.get("runtimeAndTestsUnchangedAfter") is True and
            begin.get("frozenRuntimeFiles") == 231 and begin.get("frozenTestFiles") == raw["source"]["testFiles"],
            "Operational process identity, authorization or frozen QA/source identity is incomplete")
    require(end.get("status") == "child-exited-awaiting-original-wrapper" and end.get("parentResumedAt") and
            not end.get("error") and not end.get("terminationAt") and
            exit.get("status") == "passed-qa" and exit.get("exitCode") == exit.get("qaExitCode") == 0 and
            exit.get("qaReportStatus") == "passed" and exit.get("qaReportCompletedAt") == raw.get("completedAt"),
            "Actual native process/wrapper did not reap a completed passing report")
    require(end.get("finalResultsSha256") == sha(safe_file(str(PREFIX / "local-webkit-final-v3/results.json")).read_bytes()),
            "Operational final report hash differs from the untouched completed native original")
    elapsed = (timestamp(raw["completedAt"]) - timestamp(start["startedAt"])).total_seconds()
    require(0 < elapsed <= 4800 and timestamp(end.get("completedAt")) <= timestamp(begin["effectiveDeadlineUtc"]) and
            timestamp(begin["startedAt"]) < timestamp(start["startedAt"]) + timedelta(seconds=2400),
            "Completed native report exceeds its explicitly authorized effective operational budget")
    helper = safe_file(str(PREFIX / "supervise-owned-qa.py"))
    require(sha(helper.read_bytes()) == begin.get("operationalHelperSha256") == end.get("operationalHelperSha256"),
            "Actual operational supervisor code differs from its recorded identity")
    selected.add(helper.relative_to(ROOT).as_posix()); selected.add(str(PREFIX / "run-durable.py"))
    return {"originalTimeoutSeconds": 2400, "effectiveTimeoutSeconds": 4800,
            "completedFromOriginalStartSeconds": elapsed,
            "qualification": "Explicit bounded operational extension; original budget receipt preserved. Original wrapper reaped genuine completed native QA. Operational receipts do not count as functional test passes.",
            "receipts": [{"file": name, "sha256": sha(safe_file(name).read_bytes())} for name in names.values()]}


def targeted_refresh(value, published, original_sha, published_sha, incoming_sha, incoming, current, team, expected_viewports=PHONES):
    """Validate the actual narrowed post-refresh runner, never a full-suite proxy."""
    require(len(published) == 231 and published.get("assets/data/team-details.json") == TEAM_HASH,
            "Narrowed refresh acceptance still requires the full independently audited runtime")
    require(value.get("status") == "passed" and value.get("engine") in {"chromium", "webkit"},
            "Incomplete or unknown native refresh report")
    timestamp(value.get("completedAt"))
    qualification = value.get("qualification", {})
    require(qualification.get("genuineNativeBrowser") is True and
            qualification.get("noFixtureOrResponseSubstitution") is True and
            qualification.get("strictTLS") is True,
            "Native refresh evidence must use genuine browser/source responses without TLS bypass")
    require(value.get("unchangedDuringQA") is True and value.get("testLogicUnchangedDuringQA") is True,
            "Post-integration runtime or QA logic changed during verification")
    if value.get("hosted"):
        require(value.get("base") == BASE, "Refresh evidence used an unexpected hosted URL")
    else:
        base = urllib.parse.urlparse(value.get("base", ""))
        require(base.scheme == "http" and base.hostname == "127.0.0.1",
                "Local refresh evidence must use its genuine loopback static server")
    require(expected_viewports == PHONES or expected_viewports == {(1440, 1000)},
            "Unsupported targeted native acceptance scope")
    if expected_viewports == {(1440, 1000)}:
        require(value.get("hosted") is True, "The separately qualified desktop smoke must exercise the actual hosted website")
    source = value.get("source", {})
    require(source.get("runtimeFiles") == published and source.get("originalManifestSha256") == original_sha and
            source.get("currentManifestSha256") == published_sha and source.get("classificationSha256") == incoming_sha,
            "Refresh report does not bind the exact runtime transition/classification")
    require(source.get("footballValueChanges") == source.get("typeKeyAndArrayShapeChanges") == 0 and
            source.get("unchangedRuntimeFiles") == 228 and
            source.get("independentlyVerifiedMetadataLeaves") == incoming.get("leafChangeCount") and
            source.get("categories") == incoming.get("categories"),
            "Refresh report lacks the independently verified metadata-only delta")
    require(source.get("baselineCommit") == incoming.get("baselineCommit") and
            source.get("incomingCommit") == incoming.get("incomingCommit"),
            "Refresh report source commits differ from the recorded classifier")
    if incoming.get("sourceEquivalence"):
        classifier = safe_file("qa/team-details/incoming-source/" + incoming["incomingCommit"][:12] + "-data-classification.json")
        expected_equivalence = source_equivalence(classifier, ROOT / PREFIX / "candidate-runtime-manifest.json", ROOT / PREFIX / "published-runtime-manifest.json")
        require(source.get("sourceEquivalence") == expected_equivalence,
                "Native refresh report lacks the exact independently recomputed changed-games-source evidence")
        require("qa/team-details/verify-source-equivalence.py" in source.get("testFiles", {}),
                "The source projection guard must remain frozen during native QA")
    classified = {row["path"]: row for row in incoming["files"]}
    changed = source.get("changedFiles", [])
    require(len(changed) == 3 and {row.get("file") for row in changed} == DATA_DELTA,
            "Refresh report omits a changed public data file")
    for row in changed:
        before_after = classified[row["file"]]
        require(row.get("beforeSha256") == before_after["beforeSha256"] and
                row.get("afterSha256") == before_after["afterSha256"] and
                row.get("afterSha256") == published[row["file"]] and
                row.get("metadataLeaves") == sum(delta["path"].startswith(row["file"] + "/") for delta in incoming["allChanges"]),
                "Refresh changed-file receipt differs from the exact classification")
    require(isinstance(source.get("testFiles"), dict) and
            "qa/team-details/post-refresh.cjs" in source["testFiles"] and
            all(SHA256.fullmatch(digest) for digest in source["testFiles"].values()),
            "Native refresh helper hashes are missing")
    cases = value.get("results", [])
    require(len(cases) == len(expected_viewports) and
            {(case.get("viewport", {}).get("width"), case.get("viewport", {}).get("height")) for case in cases} == expected_viewports,
            "The exact fully completed target viewports are required for this scoped native check")
    requested = value.get("requestedViewports", [])
    require(len(requested) == len(expected_viewports) and
            {(row.get("width"), row.get("height")) for row in requested} == expected_viewports,
            "Native refresh execution scope was not explicitly recorded")
    def exact_body(row, name):
        require(row.get("status") == 200 and row.get("bytes", 0) > 0 and
                row.get("sha256") == published[name] and
                row.get("url") == urllib.parse.urljoin(value["base"], name),
                "Actual browser HTTP200 source bytes differ: " + name)
    selectors = {".td-hero", "#team-window-select", "#team-season-select", "#team-venue-select", "[data-team-game]", '[data-td-action="refresh"]'}
    for case in cases:
        mobile = case.get("viewport", {}).get("width", 0) < 600
        require(case.get("mobile") is mobile and case.get("nativeInputMode") == ("touch" if mobile else "pointer"),
                "Native refresh interaction mode does not match its recorded viewport")
        require(case.get("status") == "passed" and not case.get("failure") and case.get("directReload") is True and
                case.get("homeLadderTeamRoundTrip") is True and len(case.get("nativeActions", [])) >= 20,
                "A native refresh case is incomplete")
        errors = case.get("errors", {})
        require(all(errors.get(key) == [] for key in ("javascriptAndConsole", "http", "external", "transport")),
                "Native refresh runtime errors were present or not measured")
        require(all(row.get("message") in {"net::ERR_ABORTED", "Load request cancelled"} for row in errors.get("cancelled", [])),
                "An unexpected transport failure was classified as navigation cancellation")
        bodies = case.get("sourceBodies", [])
        for name in DATA_DELTA | {"assets/data/team-details.json"}:
            matched = [row for row in bodies if urllib.parse.urlparse(row.get("url", "")).path.endswith("/" + name)]
            require(len(matched) == 1, "Missing actual source body: " + name)
            exact_body(matched[0], name)
        for key, name in (("teamRefresh", "assets/data/team-details.json"), ("currentRefresh", "assets/data/current.json")):
            refresh = case.get(key, {})
            require(refresh.get("httpStatus") in {200, 304} and refresh.get("url") == urllib.parse.urljoin(value["base"], name),
                    "Actual manual refresh did not validate its same-origin source")
            if refresh["httpStatus"] == 200:
                require(refresh.get("sha256") == published[name] and refresh.get("responseBytes", 0) > 0,
                        "Actual refresh response body differs from the published source")
            exact_body(refresh.get("exactRevalidation", {}), name)
        identity = case["teamRefresh"].get("domIdentity", {})
        nodes = identity.get("nodes", [])
        require(len(nodes) == 6 and {node.get("selector") for node in nodes} == selectors and
                all(node.get("exists") is True and node.get("connected") is True and node.get("same") is True for node in nodes) and
                len(identity.get("events", [])) == 1 and identity["events"][0].get("changed") is False and
                case["teamRefresh"].get("filterContextRetained") is True,
                "Successful identical refresh replaced DOM or lost its selected context")
        status = case["currentRefresh"].get("status", {})
        require(status.get("reason") == "manual" and status.get("state") in {"unchanged", "updated"} and
                status.get("sourceRetrievedAt") == current["retrievedAt"],
                "Current-data refresh status lacks the exact published retrieval context")
        timestamp(status.get("lastCheckedAt"))
        citations = case.get("teamSources", {})
        links = citations.get("links", [])
        require([row.get("url") for row in links] == [row["url"] for row in team["sources"]] and
                all(row.get("target") == "_blank" and {"noopener", "noreferrer"} <= set(row.get("rel", "").split()) for row in links) and
                citations.get("sourceRetrievedAt") == team["retrievedAt"] and
                all(issue["issue"] in citations.get("content", "") for issue in team.get("disagreements", [])),
                "Published source links, retrieval context or disagreements were not verified")
        bridge = case.get("steelersBridge", {})
        require(bridge.get("historyStatus") == "ready" and bridge.get("historySha256") == published["assets/data/player-history.json"] == current["playerHistory"]["sha256"] and
                bridge.get("retrievedAt") == current["playerHistory"]["retrievedAt"],
                "Existing Steelers player-history bridge lost its published source binding")
        require({row.get("tab") for row in case.get("tabs", [])} == {"players", "lineup", "form"} and
                len(case.get("aggregate", [])) == 6 and len(case.get("report", {}).get("rows", [])) == 9 and
                set(case.get("scheduleEvents", [])) == {game["id"] for game in team["teams"]["DAL"]["games"] if game["season"] == team["season"]},
                "Source-derived tabs, aggregate/report or full season schedule checks are incomplete")
        for key in ("directGeometry", "afterTeamRefreshGeometry", "finalNflGeometry"):
            geometry = case.get(key, {})
            require(geometry.get("clipped") == [], "A post-refresh native layout is clipped or unmeasured")
        if not mobile:
            require(0 < case["directGeometry"].get("page", {}).get("width", 0) <= 400.5,
                    "The hosted desktop app stretched beyond its approved compact frame")
    return value["engine"]


def hosted_deployment(value, report_file, published, original_sha, published_sha, incoming_sha, incoming, current, team, selected):
    """Actual hosting delta only; full local functional audits remain mandatory."""
    require(value.get("status") == "passed" and value.get("hosted") is True and value.get("base") == BASE and
            value.get("engine") in {"chromium", "webkit"} and not value.get("captureOnly"),
            "Hosted deployment verification is incomplete or incorrectly scoped")
    timestamp(value.get("completedAt"))
    qualification = value.get("qualification", {})
    require(qualification.get("genuineBrowser") is True and qualification.get("strictTLS") is True and
            qualification.get("noSiteOrSourceDataSubstitution") is True and
            qualification.get("scope", "").startswith("Targeted actual deployment verification;"),
            "Require honestly scoped genuine strict-TLS hosting verification without substitutions")
    source = value.get("source", {})
    require(source.get("runtimeFiles") == published and source.get("currentHash") == published["assets/data/current.json"] and
            source.get("teamFormHash") == TEAM_HASH and source.get("originalManifestSha256") == original_sha and
            source.get("currentManifestSha256") == published_sha and source.get("classificationSha256") == incoming_sha and
            "qa/team-details/hosted-deployment.cjs" in source.get("testFiles", {}) and
            value.get("unchangedDuringQA") is True and value.get("testLogicUnchangedDuringQA") is True,
            "Hosted deployment report lacks its exact source/runtime/helper freeze")
    children = value.get("providerRefreshReports", [])
    require(len(children) == 2 and len({row.get("file") for row in children}) == 2,
            "Both original hosted phone and desktop source-refresh child receipts are required")
    child_scopes = set()
    for row in children:
        child = referenced_check(row, selected); verify_helper_bytes(child, selected)
        scope = {(v.get("width"), v.get("height")) for v in row.get("viewports", [])}
        require(scope in (PHONES, {(1440, 1000)}) and child.get("engine") == value["engine"] and
                child.get("hosted") is True and child.get("completedAt") == row.get("completedAt"),
                "Hosted source-refresh child scope, engine or completion differs")
        targeted_refresh(child, published, original_sha, published_sha, incoming_sha, incoming, current, team, scope)
        child_scopes.add(frozenset(scope))
    require(child_scopes == {frozenset(PHONES), frozenset({(1440, 1000)})},
            "A phone source-refresh child cannot be counted twice in place of desktop")
    served = value.get("servedRuntime", {})
    rows = served.get("rows", [])
    require(served.get("status") == "passed" and len(rows) == 231 and
            {row.get("file") for row in rows} == set(published),
            "Every actual served runtime file must be present in the native hosted byte check")
    for row in rows:
        require(row.get("status") == 200 and row.get("bytes", 0) > 0 and
                row.get("sha256") == published[row["file"]] and row.get("url") == urllib.parse.urljoin(BASE, row["file"]),
                "Actual native served runtime bytes differ: " + row["file"])
    def clean(errors):
        require(all(errors.get(key) == [] for key in ("javascriptAndConsole", "http", "external", "transport")),
                "Actual hosted deployment runtime errors were present or unmeasured")
        require(all(row.get("message") in {"net::ERR_ABORTED", "Load request cancelled"} for row in errors.get("cancelledNavigation", [])),
                "Unexpected hosted transport failure was classified as navigation cancellation")
    clean(served.get("errors", {}))
    cases = value.get("results", [])
    expected = PHONES | {(1440, 1000)}
    require(len(cases) == 3 and {(case.get("viewport", {}).get("width"), case.get("viewport", {}).get("height")) for case in cases} == expected,
            "All three actual hosted phone/desktop cases must complete")
    capture_parent = PurePosixPath(report_file).parent
    def capture_original(row):
        require(isinstance(row, dict) and SHA256.fullmatch(row.get("sha256", "")) and row.get("bytes", 0) > 0,
                "Actual hosted original image hash/body missing")
        image = safe_file((capture_parent / row.get("file", "")).as_posix())
        require(image.suffix == ".png" and sha(image.read_bytes()) == row["sha256"],
                "Actual hosted original image bytes differ")
        selected.add(image.relative_to(ROOT).as_posix())
    def animated(motion, home=False):
        require(motion.get("visibleAdvancingClocks", 0) > 0 and
                motion.get("paint", {}).get("actualNaturalPixelChange") is True and
                SHA256.fullmatch(motion.get("paint", {}).get("sha256", "")) and
                SHA256.fullmatch(motion.get("paint", {}).get("laterSha256", "")) and
                motion["paint"]["sha256"] != motion["paint"]["laterSha256"],
                "Natural hosted clocks/paint were not independently sampled")
        require(stopped_infinite_clocks(motion.get("reduced", {})) and stopped_infinite_clocks(motion.get("inactive", {})),
                "Hosted reduced/inactive lighting remains running or unmeasured")
    for case in cases:
        require(case.get("status") == "passed" and not case.get("failure") and case.get("directLoadReload") is True,
                "An actual hosted deployment case has not completed")
        timestamp(case.get("completedAt")); clean(case.get("errors", {}))
        mobile = case["viewport"]["width"] < 600
        require(case.get("mobile") is mobile and len(case.get("nativeActions", [])) >= 9 and
                all(row.get("input") == ("native-touch" if mobile else "pointer") for row in case["nativeActions"]),
                "Hosted actions lack the correct actual touch/pointer scope")
        for field in ("initialGeometry", "finalGeometry"):
            require(case.get(field, {}).get("clipped") == [], "An actual hosted team layout is clipped or unmeasured")
        require(case.get("images") and case.get("finalImages"), "Actual hosted image decoding/geometry was unmeasured")
        sports = case.get("homeSports", [])
        require(len(sports) == 4 and {row.get("sport") for row in sports} == {"nfl", "nba", "nrl", "ufc"},
                "Each approved Home sport must be exercised on the host")
        for row in sports:
            sport, state = row["sport"], row.get("state", {})
            require(state.get("sport") == sport and state.get("selected") == [sport] and
                    state.get("entryDisabled") is (sport != "nfl") and
                    state.get("teamsLabel") == ("Fighters" if sport == "ufc" else "Teams") and
                    not re.search(r"preview\s+only", state.get("text", ""), flags=re.I),
                    "An approved hosted Home selection/availability label is incorrect")
            channels = []
            for field in ("left", "right"):
                colour = state.get(field, "")
                require(re.fullmatch(r"#[a-f0-9]{6}", colour, flags=re.I), "Hosted sport palette was not measured")
                channels.append([int(colour[i:i+2], 16) for i in (1, 3, 5)])
            left, right = channels
            if sport == "nba":
                require(left[2] > left[0] and right[0] > right[2], "Hosted NBA blue/red split is incorrect")
            else:
                primary = {"nfl": 2, "nrl": 1, "ufc": 0}[sport]
                require(left == right and left[primary] > max(left[index] for index in range(3) if index != primary),
                        "Hosted whole-panel sport hue is incorrect")
            if sport != "nfl":
                guard = row.get("comingSoonGuard", {})
                require(guard.get("sameRoute") is True and sport in guard.get("message", "").lower() and
                        "coming soon" in guard.get("message", "").lower(), "A coming-soon sport entered the NFL flow")
            require(row.get("images") and row.get("geometry", {}).get("documentWidth", float("inf")) <= case["viewport"]["width"] + 1,
                    "A hosted Home selection has broken image/layout evidence")
            capture_original(row.get("capture"))
        venue = case.get("venueDestination", {})
        require(len(venue.get("rows", [])) == 4 and {row.get("venue") for row in venue.get("expected", [])} == {"home", "away", "neutral", "unknown"} and
                venue.get("appliedVenue") == "home" and venue.get("focusRestored") is True,
                "Hosted venue destination/filter/focus was not verified")
        animated(case.get("homeMotion", {}), True); animated(case.get("motion", {}))
        shots = case.get("scroll", {}).get("shots", [])
        require(len(shots) >= 3, "Actual hosted normal top/mid/bottom captures are missing")
        for shot in shots:
            capture_original(shot.get("capture", shot))
        capture_original(case.get("fullContent")); capture_original(case.get("finalCapture"))
    return expected


def leaf_delta(before, after, path):
    require(type(before) is type(after), "Structural/type change: " + path)
    result = []
    if isinstance(before, dict):
        require(set(before) == set(after), "Object-key change: " + path)
        for key in sorted(before):
            result.extend(leaf_delta(before[key], after[key], path + "/" + key))
    elif isinstance(before, list):
        require(len(before) == len(after), "Array-shape change: " + path)
        for index, (left, right) in enumerate(zip(before, after)):
            result.extend(leaf_delta(left, right, path + "/" + str(index)))
    elif before != after:
        result.append({"path": path, "kind": "value", "before": before, "after": after})
    return result


def metadata_kind(row):
    name = row["path"].split("/")[-1]
    if name in {"checkedAt", "generatedAt", "refreshAfter", "retrievedAt", "scheduleRetrievedAt"}:
        timestamp(row["before"]); timestamp(row["after"])
        return "metadata-timestamp"
    if name in {"sha256", "playerHistorySha256", "snapshotSha256CanonicalJson"} or "/currentSourceHashes/" in row["path"] or "/sourceHashes/" in row["path"]:
        require(all(isinstance(v, str) and SHA256.fullmatch(v) for v in (row["before"], row["after"])), "Invalid metadata hash")
        return "metadata-content-hash"
    if name in {"bytes", "etag", "lastModified"} and "/sources/" in row["path"]:
        return "metadata-source-validator"
    raise VerificationError("Non-metadata football value changed: " + row["path"])


def select_originals(mapping, selected):
    require(isinstance(mapping, dict) and mapping, "Actual original image hashes are missing")
    for name, expected in mapping.items():
        file = safe_file(name)
        require(file.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} and sha(file.read_bytes()) == expected,
                "Original image hash mismatch: " + name)
        selected.add(name)


def verify_local_evidence():
    selected = {str(PREFIX / name) for name in ["verify-publication.py", "candidate-runtime-manifest.json",
                "published-runtime-manifest.json", "release-review.json", "hosted-review.json", "hosted-verification.json",
                "refresh-integration/release-integration.json", "source-audit.py", "reviews/sources/source-audit.json"]}
    original_file, published_file = ROOT / PREFIX / "candidate-runtime-manifest.json", ROOT / PREFIX / "published-runtime-manifest.json"
    original, published = manifest(original_file), manifest(published_file)
    original_sha, published_sha = sha(original_file.read_bytes()), sha(published_file.read_bytes())
    release = read_json(ROOT / PREFIX / "release-review.json")
    require(release.get("runtimeManifestSha256") == original_sha, "Release review belongs to a different candidate")
    require(release.get("runtimeFiles") == 231 and release.get("completeLocalChecksStatus") == "passed", "Complete local release gate is missing")
    verify_reviewers(release, "all_six_reviews_accepted", selected, original_sha)
    select_originals(release.get("commonOriginals"), selected)
    app_head = release.get("applicationCodeHead")
    require(release.get("applicationCodeRef") == APPLICATION_REF,
            "Original reviewed application head needs its portable exact GitHub tag")
    original_blobs = commit_blobs(app_head, original)
    require(all(sha(original_blobs[p]) == digest for p, digest in original.items()), "Application code head differs from the reviewed 231 runtime files")
    source = read_json(ROOT / PREFIX / "reviews/sources/source-audit.json")
    require(source.get("status") == "passed" and source.get("dataSha256") == TEAM_HASH and source.get("failures") == [], "Independent source/data audit is missing or failed")
    require(source.get("teams") == 32 and source.get("uniqueGames", 0) >= 500 and sum(source.get("checks", {}).values()) >= 73244,
            "Independent data audit scope is incomplete")
    fetched = [row for row in source.get("independentSources", []) if row.get("httpStatus") == 200 and row.get("status") == "retrieved"]
    require(len(fetched) >= 31, "Independent provider evidence is incomplete")
    for row in fetched:
        require(row.get("url", "").startswith("https://") and SHA256.fullmatch(row.get("sha256", ""))
                and row.get("bytes", 0) > 0, "Independent source receipt lacks a legitimate URL/hash/body")
        timestamp(row.get("retrievedAt"))
    timestamp(source.get("auditedAt"))
    checks = release.get("completeLocalChecks")
    require(isinstance(checks, list) and checks, "Actual completed local browser receipts are missing")
    local_coverage = {"chromium": set(), "webkit": set()}
    local_values = {}
    for row in checks:
        value = referenced_check(row, selected)
        require(row["file"] not in local_values, "Duplicate local check path cannot stand in for another mandatory report")
        local_values[row["file"]] = value
        verify_helper_bytes(value, selected)
        if value.get("engine") in local_coverage:
            local_coverage[value["engine"]] |= complete_native(value, original, False)
    require(CHROME_SIZES <= local_coverage["chromium"] and PHONES <= local_coverage["webkit"], "Completed four-size Chromium and two-phone native WebKit coverage is required")
    protected_coverage = {}
    for engine in ("chromium", "webkit"):
        directory = str(PREFIX / ("regression-" + engine + "-final-v3"))
        report_file, binding_file = directory + "/results.json", directory + "/runtime-binding.json"
        require(report_file in local_values and binding_file in local_values,
                "Missing mandatory original protected report/full freeze receipt: " + engine)
        protected_coverage[engine] = protected_regression(local_values[report_file], local_values[binding_file], original, engine, selected)
    native_supervision = operational_supervision(local_values, selected)
    integration = read_json(ROOT / PREFIX / "refresh-integration/release-integration.json")
    require(integration.get("originalRuntimeManifestSha256") == original_sha and integration.get("publishedRuntimeManifestSha256") == published_sha,
            "Refresh integration manifest bounds are wrong")
    verify_reviewers(integration, "all_six_reviews_accepted", selected, published_sha, original_sha)
    require(set(original) == set(published), "Published runtime paths differ")
    changed = {p for p in published if published[p] != original[p]}
    require(changed == DATA_DELTA, "Only the three audited metadata data files may change")
    require(integration.get("factualChanges") == 0 and integration.get("structuralChanges") == 0 and
            integration.get("unchangedOtherRuntimeFiles") == len(published) - len(changed), "Factual/structural refresh changes lack acceptance")
    incoming_path = safe_file(integration.get("incomingAudit"))
    require(sha(incoming_path.read_bytes()) == integration.get("incomingAuditSha256"), "Incoming classification hash mismatch")
    selected.add(incoming_path.relative_to(ROOT).as_posix()); incoming = read_json(incoming_path)
    require(incoming.get("status") == "passed" and incoming.get("footballValueChanges") == 0 and incoming.get("typeKeyAndArrayShapeChanges") == 0,
            "Incoming data is not independently classified as metadata only")
    actual_delta = []
    for name in sorted(changed):
        actual_delta.extend(leaf_delta(json.loads(original_blobs[name]), read_json(safe_file(name)), name))
    for row in actual_delta:
        row["category"] = metadata_kind(row)
    require(sorted(actual_delta, key=lambda r: r["path"]) == sorted(incoming.get("allChanges", []), key=lambda r: r["path"]),
            "Recorded incoming metadata rows do not match the actual original/published JSON delta")
    require(len(actual_delta) == incoming.get("leafChangeCount"), "Incoming metadata change count differs")
    current = read_json(ROOT / "assets/data/current.json"); team = read_json(ROOT / "assets/data/team-details.json")
    a, b = {s["id"]: s for s in current["sources"]}, {s["id"]: s for s in team["sources"]}
    shared = set(a) & set(b)
    require(len(shared) >= 7, "Shared original/provider source contracts are missing")
    scoped_equivalence = None
    for identifier in shared:
        require(a[identifier].get("status") == b[identifier].get("status") == "verified" and
                a[identifier].get("url") == b[identifier].get("url"),
                "Incoming source status or identity differs from retained Dallas facts: " + identifier)
        if a[identifier].get("sha256") != b[identifier].get("sha256"):
            require(identifier == "nflverse_games", "Another provider differs from retained Dallas facts: " + identifier)
            scoped_equivalence = source_equivalence(incoming_path, original_file, published_file, selected)
    conference_rows = current["weeks"][str(current["currentWeek"])]["conferences"]
    dallas_rows = [row for rows in conference_rows.values() for row in rows if row["abbr"] == "DAL"]
    require(len(dallas_rows) == 1 and all(team["teams"]["DAL"]["record"][key] == dallas_rows[0][key]
            for key in ("w", "l", "ties", "pointsFor", "pointsAgainst", "record")),
            "Dallas record/points differ between the two published feeds")
    refresh_checks = integration.get("targetedNativeRefreshChecks")
    require(isinstance(refresh_checks, list) and len(refresh_checks) >= 2, "Post-integration native refresh checks are missing")
    refresh_engines = set()
    for row in refresh_checks:
        value = referenced_check(row, selected)
        verify_helper_bytes(value, selected)
        refresh_engines.add(targeted_refresh(value, published, original_sha, published_sha,
            integration["incomingAuditSha256"], incoming, current, team))
    require(refresh_engines == {"chromium", "webkit"}, "Both native refresh engines are required")
    hosted_review = read_json(ROOT / PREFIX / "hosted-review.json")
    require(hosted_review.get("runtimeManifestSha256") == published_sha and hosted_review.get("runtimeFiles") == 231,
            "Hosted review belongs to different or incomplete runtime")
    verify_reviewers(hosted_review, "all_six_hosted_visual_reviews_accepted", selected, published_sha)
    select_originals(hosted_review.get("personallyInspectedCommonHostedOriginals"), selected)
    hosted = read_json(ROOT / PREFIX / "hosted-verification.json")
    require(hosted.get("status") == "passed" and hosted.get("runtimeManifestSha256") == published_sha and hosted.get("runtimeFiles") == 231,
            "Completed actual hosted verification is missing")
    hosted_checks = hosted.get("checks")
    require(isinstance(hosted_checks, list) and hosted_checks, "Hosted native originals are missing")
    hosted_coverage = set()
    hosted_full_engines = {"chromium": set(), "webkit": set()}
    hosted_targeted_engines = {"chromium": set(), "webkit": set()}
    for row in hosted_checks:
        value = referenced_check(row, selected)
        verify_helper_bytes(value, selected)
        if "qa/team-details/hosted-deployment.cjs" in value.get("source", {}).get("testFiles", {}):
            coverage = hosted_deployment(value, row["file"], published, original_sha, published_sha,
                integration["incomingAuditSha256"], incoming, current, team, selected)
            hosted_targeted_engines[value["engine"]] |= coverage
        elif value.get("engine") in hosted_full_engines:
            full = complete_native(value, published, True)
            hosted_full_engines[value["engine"]] |= full
            hosted_coverage |= full
    require(PHONES | {(1440, 1000)} <= hosted_targeted_engines["webkit"],
            "Completed genuine strict-TLS native WebKit deployment verification at both phones and desktop is required")
    for name, expected in published.items():
        require(sha(safe_file(name).read_bytes()) == expected, "Working file differs from published manifest: " + name)
    return {"original": original, "published": published, "publishedSha256": published_sha, "selected": selected,
            "metadataLeafChanges": len(actual_delta), "sharedProviderHashes": sorted(shared), "scopedSourceEquivalence": scoped_equivalence, "hosted": hosted,
            "applicationCodeHead": app_head, "applicationCodeRef": release["applicationCodeRef"],
            "localNativeCoverage": {k:sorted(v) for k,v in local_coverage.items()},
            "protectedNativeCoverage": {k: sorted(v) for k, v in protected_coverage.items()},
            "nativeOperationalSupervision": native_supervision,
            "hostedNativeFullCoverage": {k: sorted(v) for k, v in hosted_full_engines.items()},
            "hostedTargetedDeploymentCoverage": {k: sorted(v) for k, v in hosted_targeted_engines.items()}}


def verify_pages(run_id, head):
    require(str(run_id).isdigit(), "Pages run ID must be numeric")
    run = api("actions/runs/" + str(run_id)); jobs = api("actions/runs/" + str(run_id) + "/jobs?per_page=100")["jobs"]
    require(run.get("name") == "pages build and deployment" and run.get("head_sha") == head and
            run.get("status") == "completed" and run.get("conclusion") == "success", "Exact Pages run is not successful for the target commit")
    require(len(jobs) == 3 and {j["name"] for j in jobs} == {"build", "report-build-status", "deploy"} and
            all(j.get("status") == "completed" and j.get("conclusion") == "success" and j.get("completed_at") for j in jobs),
            "All three actual Pages jobs must complete successfully")
    return {"id":run["id"],"url":run["html_url"],"head":run["head_sha"],
            "jobs":[{"name":j["name"],"conclusion":j["conclusion"],"completedAt":j["completed_at"]} for j in jobs]}


def verify_publication(pages_run):
    proof = verify_local_evidence()
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    refs = {branch:api("git/ref/heads/" + branch)["object"]["sha"] for branch in ("main", "codex-rebuild")}
    require(all(value == head for value in refs.values()), "Production/codex-rebuild refs differ from the reviewed checkout")
    application_ref = api("git/ref/" + proof["applicationCodeRef"].removeprefix("refs/"))
    require(application_ref.get("ref") == APPLICATION_REF and
            application_ref.get("object", {}).get("type") == "commit" and
            application_ref["object"].get("sha") == proof["applicationCodeHead"],
            "Portable reviewed-application tag differs from the original accepted commit")
    pages = api("pages")
    require(pages.get("html_url", "").rstrip("/") == BASE.rstrip("/") and
            pages.get("source") == {"branch":"main","path":"/"}, "Unexpected GitHub Pages production source")
    run = verify_pages(pages_run, head)
    files = sorted(set(proof["published"]) | proof["selected"])
    committed = commit_blobs(head, files)
    expected = {name:sha(safe_file(name).read_bytes()) for name in files}
    require(all(sha(committed[name]) == expected[name] for name in files), "Selected runtime/evidence bytes are not committed at the published HEAD")
    hosted_head = proof["hosted"].get("applicationHead")
    hosted_blobs = commit_blobs(hosted_head, proof["published"])
    require(all(sha(hosted_blobs[name]) == digest for name,digest in proof["published"].items()), "Tested hosted application commit differs from published runtime")
    application_run = verify_pages(proof["hosted"].get("applicationPagesRun"), hosted_head)
    context = ssl.create_default_context()
    environment_ca = Path("/usr/local/share/ca-certificates/environment-proxy-ca.crt")
    if environment_ca.exists():
        context.load_verify_locations(cafile=str(environment_ca))
    require(context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED, "TLS verification must remain enabled")
    def fetch(name):
        request = urllib.request.Request(BASE + urllib.parse.quote(name, safe="/") + "?verify=" + head,
                                        headers={"Cache-Control":"no-cache","User-Agent":"ProjectDollar-publication-audit"})
        with urllib.request.urlopen(request, timeout=60, context=context) as response:
            raw,status,url = response.read(),response.status,response.geturl()
        require(status == 200 and url.startswith(BASE) and sha(raw) == expected[name], "Production bytes differ: " + name)
        return {"path":name,"httpStatus":status,"sha256":expected[name],"bytes":len(raw),"url":url}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(fetch, files))
    refs_after = {branch:api("git/ref/heads/" + branch)["object"]["sha"] for branch in refs}
    application_ref_after = api("git/ref/" + proof["applicationCodeRef"].removeprefix("refs/"))
    require(refs_after == refs and subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip() == head,
            "Repository refs changed during verification")
    require(application_ref_after == application_ref, "Original reviewed-application tag changed during verification")
    require(all(sha(safe_file(name).read_bytes()) == digest for name,digest in expected.items()), "Selected local evidence changed during verification")
    return {"status":"passed","completedAt":datetime.now(timezone.utc).isoformat(),"base":BASE,"gitHead":head,"refs":refs,
            "runtimeManifestSha256":proof["publishedSha256"],"runtimeFiles":231,"pagesRun":run,"testedApplicationPagesRun":application_run,
            "reviewedApplicationRef":{"ref":APPLICATION_REF,"head":proof["applicationCodeHead"],"type":"commit"},
            "strictTLS":True,"selectedEvidenceFiles":len(proof["selected"]),"fileCount":len(rows),"totalBytes":sum(r["bytes"] for r in rows),
            "metadataLeafChanges":proof["metadataLeafChanges"],"sharedProviderHashes":proof["sharedProviderHashes"],
            "localNativeCoverage":proof["localNativeCoverage"],"hostedNativeFullCoverage":proof["hostedNativeFullCoverage"],
            "protectedNativeCoverage": proof["protectedNativeCoverage"],
            "nativeOperationalSupervision": proof["nativeOperationalSupervision"],
            "hostedTargetedDeploymentCoverage":proof["hostedTargetedDeploymentCoverage"],"files":rows,
            "qualification":"Actual strict-TLS production bytes, exact refs/committed evidence and all three Pages jobs. Completed separately hash-bound native reports establish data, interactions, rendering and motion; capture-only and standalone scoped reviews cannot replace them. No physical iPhone/FPS or registered reference pixel-identity claim."}


def self_test():
    """Meaningful refusal fixtures, separate from actual publication acceptance."""
    import tempfile
    import unittest
    from unittest.mock import patch
    def refresh_fixture():
        """Qualification fixture only: no claim about current football/production."""
        published = {"fixture/file-" + str(i): "0" * 64 for i in range(227)}
        published.update({name: "1" * 64 for name in DATA_DELTA})
        published["assets/data/team-details.json"] = TEAM_HASH
        incoming = {"baselineCommit": "2" * 40, "incomingCommit": "3" * 40,
                    "leafChangeCount": 3, "categories": {"metadata-timestamp": 3},
                    "files": [{"path": name, "beforeSha256": "4" * 64, "afterSha256": published[name]} for name in sorted(DATA_DELTA)],
                    "allChanges": [{"path": name + "/retrievedAt"} for name in sorted(DATA_DELTA)]}
        current = {"retrievedAt": "2026-10-08T08:00:00Z",
                   "playerHistory": {"sha256": published["assets/data/player-history.json"], "retrievedAt": "2026-10-08T08:00:00Z"}}
        team = {"retrievedAt": current["retrievedAt"], "season": 2026,
                "sources": [{"url": "https://example.org/source"}], "disagreements": [{"issue": "Fixture difference"}],
                "teams": {"DAL": {"games": [{"id": "fixture", "season": 2026}]}}}
        base = "http://127.0.0.1:8000/project-dollers/"
        body = lambda name: {"url": base + name, "status": 200, "bytes": 1, "sha256": published[name]}
        def case(viewport):
            refresh = lambda name: {"url": base + name, "httpStatus": 200, "responseBytes": 1,
                                    "sha256": published[name], "exactRevalidation": body(name)}
            value = {"viewport": {"width": viewport[0], "height": viewport[1]}, "status": "passed",
                     "mobile": True, "nativeInputMode": "touch",
                     "directReload": True, "homeLadderTeamRoundTrip": True, "nativeActions": ["fixture"] * 20,
                     "errors": {k: [] for k in ("javascriptAndConsole", "http", "external", "transport", "cancelled")},
                     "sourceBodies": [body(name) for name in DATA_DELTA | {"assets/data/team-details.json"}],
                     "teamRefresh": refresh("assets/data/team-details.json"), "currentRefresh": refresh("assets/data/current.json"),
                     "teamSources": {"links": [{"url": "https://example.org/source", "target": "_blank", "rel": "noopener noreferrer"}],
                                     "sourceRetrievedAt": team["retrievedAt"], "content": "Fixture difference"},
                     "steelersBridge": {"historyStatus": "ready", "historySha256": current["playerHistory"]["sha256"],
                                        "retrievedAt": current["playerHistory"]["retrievedAt"]},
                     "tabs": [{"tab": tab} for tab in ("players", "lineup", "form")], "aggregate": [{}] * 6,
                     "report": {"rows": [[]] * 9}, "scheduleEvents": ["fixture"],
                     **{key: {"clipped": []} for key in ("directGeometry", "afterTeamRefreshGeometry", "finalNflGeometry")}}
            value["teamRefresh"].update({"filterContextRetained": True, "domIdentity": {
                "nodes": [{"selector": selector, "exists": True, "connected": True, "same": True} for selector in
                          (".td-hero", "#team-window-select", "#team-season-select", "#team-venue-select", "[data-team-game]", '[data-td-action="refresh"]')],
                "events": [{"changed": False, "recovered": False}]}})
            value["currentRefresh"]["status"] = {"reason": "manual", "state": "unchanged", "sourceRetrievedAt": current["retrievedAt"],
                                                "lastCheckedAt": "2026-10-08T08:01:00Z"}
            return value
        report = {"status": "passed", "engine": "webkit", "hosted": False, "base": base,
                  "completedAt": "2026-10-08T08:02:00Z", "qualification": {"genuineNativeBrowser": True,
                    "noFixtureOrResponseSubstitution": True, "strictTLS": True},
                  "unchangedDuringQA": True, "testLogicUnchangedDuringQA": True, "results": [case(phone) for phone in sorted(PHONES)],
                  "requestedViewports": [{"width": phone[0], "height": phone[1]} for phone in sorted(PHONES)],
                  "source": {"runtimeFiles": published, "originalManifestSha256": "5" * 64,
                    "currentManifestSha256": "6" * 64, "classificationSha256": "7" * 64,
                    "footballValueChanges": 0, "typeKeyAndArrayShapeChanges": 0, "unchangedRuntimeFiles": 228,
                    "independentlyVerifiedMetadataLeaves": 3, "categories": incoming["categories"],
                    "baselineCommit": incoming["baselineCommit"], "incomingCommit": incoming["incomingCommit"],
                    "testFiles": {"qa/team-details/post-refresh.cjs": "8" * 64},
                    "changedFiles": [{"file": row["path"], "beforeSha256": row["beforeSha256"],
                                      "afterSha256": row["afterSha256"], "metadataLeaves": 1} for row in incoming["files"]]}}
        return report, (published, "5" * 64, "6" * 64, "7" * 64, incoming, current, team)
    class RefusalFixtures(unittest.TestCase):
        def test_duplicate_reviewers_are_rejected(self):
            with self.assertRaises(VerificationError):
                verify_reviewers({"status":"all_six_reviews_accepted","reviewers":[{"name":"same"}]*6},"all_six_reviews_accepted",set())
        def test_missing_data_scope_is_rejected(self):
            with tempfile.TemporaryDirectory() as directory:
                file=Path(directory)/"manifest.json";file.write_text(json.dumps({"index.html":"0"*64}))
                with self.assertRaises(VerificationError):manifest(file)
        def test_factual_change_is_rejected_as_metadata(self):
            with self.assertRaises(VerificationError):
                metadata_kind({"path":"assets/data/current.json/roster/0/seasonStats/rushingYards","before":100,"after":101})
        def test_shape_or_type_change_is_rejected(self):
            with self.assertRaises(VerificationError):leaf_delta([1],[1,2],"data")
            with self.assertRaises(VerificationError):leaf_delta(1,True,"data")
        def test_capture_only_cannot_count_as_native_functional_pass(self):
            with self.assertRaises(VerificationError):complete_native({"engine":"webkit","hosted":False,"qualification":{"genuineBrowser":True,"noSiteOrSourceDataSubstitution":True},"captureOnly":True},{},False)
        def test_unsafe_evidence_path_is_rejected(self):
            with self.assertRaises(VerificationError):safe_file("../outside.json")
        def test_incomplete_pages_jobs_cannot_pass(self):
            good={"name":"pages build and deployment","head_sha":"1"*40,"status":"completed","conclusion":"success"}
            with patch(__name__+".api",side_effect=[good,{"jobs":[]}]),self.assertRaises(VerificationError):verify_pages("123","1"*40)
        def test_one_receipt_cannot_count_as_six_independent_reviews(self):
            rows = [{"name": "agent-" + str(i), "evidence": "same.json", "decision": "accepted"} for i in range(6)]
            with self.assertRaises(VerificationError): verify_reviewers({"status": "all_six_reviews_accepted", "reviewers": rows}, "all_six_reviews_accepted", set())
        def test_qualified_targeted_fixture_has_expected_schema(self):
            value, args = refresh_fixture()
            self.assertEqual(targeted_refresh(value, *args), "webkit")
        def test_incomplete_phone_run_is_rejected(self):
            value, args = refresh_fixture(); value["results"].pop()
            with self.assertRaises(VerificationError): targeted_refresh(value, *args)
        def test_unchanged_refresh_dom_replacement_is_rejected(self):
            value, args = refresh_fixture(); value["results"][0]["teamRefresh"]["domIdentity"]["nodes"][0]["same"] = False
            with self.assertRaises(VerificationError): targeted_refresh(value, *args)
        def test_provider_response_substitution_is_rejected(self):
            value, args = refresh_fixture(); value["results"][0]["sourceBodies"][0]["sha256"] = "9" * 64
            with self.assertRaises(VerificationError): targeted_refresh(value, *args)
        def test_tls_bypass_is_rejected(self):
            value, args = refresh_fixture(); value["qualification"]["strictTLS"] = False
            with self.assertRaises(VerificationError): targeted_refresh(value, *args)
        def test_retained_source_difference_cannot_disappear(self):
            value, args = refresh_fixture(); value["results"][0]["teamSources"]["content"] = ""
            with self.assertRaises(VerificationError): targeted_refresh(value, *args)
        def test_hosted_desktop_fixture_has_separate_scope(self):
            value, args = refresh_fixture()
            value["hosted"] = True
            value["results"] = [value["results"][0]]
            value["results"][0]["viewport"] = {"width": 1440, "height": 1000}
            value["results"][0].update({"mobile": False, "nativeInputMode": "pointer"})
            value["results"][0]["directGeometry"]["page"] = {"width": 400}
            value["requestedViewports"] = [{"width": 1440, "height": 1000}]
            raw = json.dumps(value).replace(value["base"], BASE)
            value = json.loads(raw)
            self.assertEqual(targeted_refresh(value, *args, {(1440, 1000)}), "webkit")
        def test_desktop_smoke_cannot_replace_both_phone_cases(self):
            value, args = refresh_fixture(); value["results"] = [value["results"][0]]
            value["results"][0]["viewport"] = {"width": 1440, "height": 1000}
            with self.assertRaises(VerificationError): targeted_refresh(value, *args)
        def test_local_desktop_smoke_cannot_count_as_hosted(self):
            value, args = refresh_fixture(); value["results"] = [value["results"][0]]
            value["results"][0]["viewport"] = {"width": 1440, "height": 1000}
            with self.assertRaises(VerificationError): targeted_refresh(value, *args, {(1440, 1000)})
        def test_measured_stopped_clocks_are_distinct_from_dom_label(self):
            self.assertTrue(stopped_infinite_clocks({"state": "running", "clocks": []}))
        def test_reduced_dom_label_cannot_hide_running_or_missing_clocks(self):
            self.assertFalse(stopped_infinite_clocks({"state": "reduced", "clocks": [{"state": "running"}]}))
            self.assertFalse(stopped_infinite_clocks({"state": "reduced"}))
        def test_old_accepted_review_cannot_authorize_another_candidate(self):
            with tempfile.TemporaryDirectory() as directory:
                file = Path(directory) / "review.json"
                file.write_text(json.dumps({"status": "accepted", "runtimeManifest": {"sha256": "0" * 64, "runtimeFiles": 231}}))
                rows = [{"name": "agent-" + str(i), "evidence": "proof-" + str(i) + ".json", "decision": "accepted",
                         "evidenceSha256": sha(file.read_bytes())} for i in range(6)]
                with patch(__name__ + ".safe_file", return_value=file), self.assertRaises(VerificationError):
                    verify_reviewers({"status": "all_six_reviews_accepted", "reviewers": rows}, "all_six_reviews_accepted", set(), "1" * 64)
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(RefusalFixtures)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    require(result.wasSuccessful(),"Verifier refusal fixtures failed")
    print("Preparation only: refusal fixtures passed; no publication acceptance was attempted.")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages-run")
    parser.add_argument("--output")
    parser.add_argument("--self-test",action="store_true")
    args=parser.parse_args()
    if args.self_test:
        require(not args.pages_run and not args.output,"Self tests cannot write a publication receipt")
        self_test();return
    require(args.pages_run and args.output,"--pages-run and a fresh --output are required")
    output=Path(args.output)
    require(not output.exists(),"Preserve prior immutable publication receipts; choose a fresh output path")
    started=datetime.now(timezone.utc).isoformat()
    try:
        receipt=verify_publication(args.pages_run)
    except Exception as error:
        receipt={"status":"failed","startedAt":started,"completedAt":datetime.now(timezone.utc).isoformat(),
                 "base":BASE,"failure":{"type":type(error).__name__,"message":str(error)},
                 "qualification":"No publication acceptance. Earlier complete, partial and failed originals remain preserved."}
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("x") as file:
        file.write(json.dumps(receipt,indent=2)+"\n")
    if receipt["status"] != "passed":
        print("FAIL: "+receipt["failure"]["message"],file=sys.stderr);sys.exit(1)
    print(f"PASS: {receipt['fileCount']} exact HTTP200 files, 231 runtime files, production {receipt['gitHead']}, Pages {receipt['pagesRun']['id']}")


if __name__ == "__main__":
    main()
