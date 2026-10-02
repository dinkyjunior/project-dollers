#!/usr/bin/env python3
"""Audit actual hosted bytes/assets with normal, verified HTTPS requests.

After publishing and synchronizing the tested local snapshot, run:
  python3 qa/hosted-http-audit.py \
    --ca-file /usr/local/share/ca-certificates/environment-proxy-ca.crt

The CA is supplied to curl per request; system trust and HOME are unchanged.
No insecure TLS flag, credential output, or external mutation is used. Output
defaults to qa/next-pass/HOSTED_HTTP_AUDIT.json; prior output is archived.
This verifies served files, provenance joins, and real compressed transfer size.
It does not substitute for actual browser navigation/render/interaction QA.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "https://dinkyjunior.github.io/project-dollers/"
DEFAULT_CA = Path("/usr/local/share/ca-certificates/environment-proxy-ca.crt")
SAFE_HEADERS = {"content-type", "content-encoding", "content-length", "cache-control", "etag", "last-modified", "vary"}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(body):
    return hashlib.sha256(body).hexdigest()


def redact(message):
    text = str(message)
    raw = os.environ.get("HTTPS_PROXY")
    if not raw:
        return text
    values = [raw]
    try:
        url = urllib.parse.urlsplit(raw)
        for value in (url.username, url.password):
            if value:
                values.extend((value, urllib.parse.unquote(value)))
    except ValueError:
        pass
    for value in sorted(set(values), key=len, reverse=True):
        text = text.replace(value, "[environment-proxy]")
    return text


def request(base, file, ca, method="GET"):
    url = urllib.parse.urljoin(base, file)
    with tempfile.TemporaryDirectory(prefix="pd-verified-http-", dir="/tmp") as folder:
        headers_path = Path(folder) / "headers"
        body_path = Path(folder) / "body"
        command = ["curl", "--proto", "=https", "--proto-redir", "=https", "--fail", "--silent", "--show-error", "--location", "--max-time", "35", "--compressed", "--dump-header", str(headers_path), "--output", str(body_path), "--write-out", '{"httpStatus":%{http_code},"wireBodyBytes":%{size_download},"tlsVerifyResult":%{ssl_verify_result},"effectiveUrl":"%{url_effective}"}', url]
        if ca:
            command[1:1] = ["--cacert", str(ca)]
        if method == "HEAD":
            command.insert(1, "--head")
        process = subprocess.run(command, capture_output=True, text=True)
        try:
            metadata = json.loads(process.stdout)
        except json.JSONDecodeError:
            metadata = {}
        selected = {}
        if headers_path.exists():
            for line in headers_path.read_text(errors="replace").splitlines():
                if line.startswith("HTTP/"):
                    selected = {}
                elif ":" in line:
                    key, value = line.split(":", 1)
                    if key.strip().lower() in SAFE_HEADERS:
                        selected[key.strip().lower()] = value.strip()
        passed = process.returncode == 0 and metadata.get("httpStatus") == 200 and metadata.get("tlsVerifyResult") == 0
        result = {"path": file, "method": method, "status": "passed" if passed else "failed", **metadata, "headers": selected}
        if process.returncode:
            result.update(curlExit=process.returncode, error=redact(process.stderr)[:400])
        body = body_path.read_bytes() if method == "GET" and body_path.exists() else b""
        if method == "GET":
            result.update(decodedBodyBytes=len(body), decodedSha256=digest(body))
        return result, body


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default=os.environ.get("HOSTED_QA_URL", DEFAULT_URL))
    parser.add_argument("--ca-file", default=os.environ.get("HOSTED_CA_FILE"))
    parser.add_argument("--output", type=Path, default=ROOT / "qa/next-pass/HOSTED_HTTP_AUDIT.json")
    args = parser.parse_args()
    parsed = urllib.parse.urlsplit(args.base)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error("Use an HTTPS site base without embedded credentials, query, or fragment.")
    base = args.base.rstrip("/") + "/"
    ca = Path(args.ca_file).resolve() if args.ca_file else DEFAULT_CA if DEFAULT_CA.is_file() else None
    if ca and not ca.is_file():
        parser.error("The supplied CA file must exist; certificate verification will not be disabled.")
    qa = json.loads((ROOT / "qa/results.json").read_text())
    manifest = qa.get("runtimeManifest", {})
    if not manifest:
        parser.error("Run local QA first so qa/results.json contains the tested runtime manifest.")
    local_mismatches = [file for file, sha in manifest.items() if digest((ROOT / file).read_bytes()) != sha]
    if local_mismatches:
        parser.error("Local runtime differs from the QA manifest; synchronize and complete local QA before auditing publication: " + ", ".join(local_mismatches))
    history_path = "assets/data/player-history.json"
    assert history_path in manifest and "assets/data/current.json" in manifest
    started = now()
    # A commit ID is read locally for evidence only; this script performs no Git mutation.
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    get_paths = list(manifest) + ["assets/data/provenance.json"]
    gets, payloads = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(request, base, file, ca): file for file in get_paths}
        for future in concurrent.futures.as_completed(futures):
            file = futures[future]
            result, body = future.result()
            gets[file], payloads[file] = result, body
            if file in manifest:
                result.update(expectedSha256=manifest[file], matchesTestedRuntime=result["decodedSha256"] == manifest[file])
    assets = sorted(str(file.relative_to(ROOT)) for file in (ROOT / "assets").rglob("*") if file.is_file())
    heads = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(request, base, file, ca, "HEAD") for file in assets]
        for future in concurrent.futures.as_completed(futures):
            heads.append(future.result()[0])
    heads.sort(key=lambda result: result["path"])

    data_checks, context = {}, {}
    data_error = None
    try:
        current = json.loads(payloads["assets/data/current.json"])
        history = json.loads(payloads[history_path])
        provenance = json.loads(payloads["assets/data/provenance.json"])
        history_sha = digest(payloads[history_path])
        canonical_sha = digest(json.dumps(current, sort_keys=True, ensure_ascii=False).encode())
        sources = {source["id"]: source.get("sha256") for source in current["sources"]}
        data_checks = {
            "historyPathMatchesCurrentMetadata": current["playerHistory"]["path"] == history_path,
            "historyMatchesCurrentMetadata": history_sha == current["playerHistory"]["sha256"],
            "historyMatchesProvenance": history_sha == provenance["playerHistorySha256"],
            "currentCanonicalMatchesProvenance": canonical_sha == provenance["snapshotSha256CanonicalJson"],
            "currentAndHistorySourceVersionsMatch": all(sources.get(key) == value for key, value in history["currentSourceHashes"].items()),
            "currentAndHistoryMetadataHashesMatch": current["playerHistory"]["currentSourceHashes"] == history["currentSourceHashes"],
            "seasonMatches": current["season"] == history["season"],
            "servedProvenanceMatchesLocalBytes": payloads["assets/data/provenance.json"] == (ROOT / "assets/data/provenance.json").read_bytes(),
        }
        context = {"season": current["season"], "currentWeek": current["currentWeek"], "throughWeek": current["throughWeek"], "retrievedAt": current["retrievedAt"], "rosterPlayers": len(current["roster"]), "historyPlayers": len(history["players"]), "historyGameRows": sum(len(player["games"]) for player in history["players"].values()), "historyCoverage": history["coverage"], "historySha256": history_sha, "canonicalSnapshotSha256": canonical_sha, "disagreementCount": len(current.get("disagreements", []))}
    except (ValueError, KeyError, TypeError) as error:
        data_error = redact(error)
        data_checks["parsedRequiredData"] = False

    get_failures = [result for result in gets.values() if result["status"] != "passed"]
    head_failures = [result for result in heads if result["status"] != "passed"]
    hash_mismatches = [result for result in gets.values() if result.get("matchesTestedRuntime") is False]
    hashes_after = {file: digest((ROOT / file).read_bytes()) for file in manifest}
    runtime_unchanged = hashes_after == manifest
    status = "passed" if not get_failures and not head_failures and not hash_mismatches and all(data_checks.values()) and runtime_unchanged else "failed"
    history_get = gets[history_path]
    encoding = history_get["headers"].get("content-encoding", "identity")
    wire, decoded = history_get.get("wireBodyBytes"), history_get["decodedBodyBytes"]
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    previous = None
    if output.exists():
        archive = output.parent / "http-audit-archive"
        archive.mkdir(exist_ok=True)
        timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        previous = archive / (timestamp + ".json")
        output.rename(previous)
    record = {
        "status": status, "startedAt": started, "completedAt": now(), "base": base,
        "publishedAppCommit": commit, "localQACommit": qa.get("gitHead"), "previousEvidence": str(previous.relative_to(ROOT)) if previous and previous.is_relative_to(ROOT) else str(previous) if previous else None,
        "tls": {"certificateVerificationEnabled": True, "hostnameVerificationEnabled": True, "explicitPerRequestCA": str(ca) if ca else None, "providedCASha256": digest(ca.read_bytes()) if ca else None, "systemTrustModified": False, "ignoreCertificateErrors": False},
        "method": "Ordinary read-only hosted HTTPS curl requests using the supplied normal environment route; GET bodies decoded according to observed Content-Encoding.",
        "runtimeManifestCount": len(manifest), "runtimeBodyMatches": len(manifest) - len(hash_mismatches), "runtimeHashesBefore": manifest, "runtimeHashesAfter": hashes_after, "runtimeUnchangedDuringAudit": runtime_unchanged,
        "runtimeGets": [gets[file] for file in manifest], "provenanceGet": gets["assets/data/provenance.json"],
        "dataChecks": data_checks, "dataCheckError": data_error, "datasetContext": context,
        "historyTransfer": {"observedContentEncoding": encoding, "observedWireBodyBytes": wire, "decodedBodyBytes": decoded, "compressionObserved": encoding != "identity", "wireToDecodedRatio": round(wire / decoded, 5) if wire is not None and decoded else None, "note": "Wire size is curl size_download for this actual GET response, not a locally estimated gzip/Brotli size."},
        "assetHeadCount": len(heads), "assetHeadPassed": len(heads) - len(head_failures), "assetHeads": heads,
        "failures": {"http": get_failures, "assetHeads": head_failures, "runtimeHashMismatches": hash_mismatches},
        "browserVerification": {"status": "Not established by this HTTP audit", "limit": "This confirms actual served bytes and HTTPS asset availability. Use the separate genuine hosted browser suites to verify navigation, rendering, motion, and interactions."},
    }
    output.write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps({key: record[key] for key in ("status", "completedAt", "runtimeManifestCount", "runtimeBodyMatches", "dataChecks", "historyTransfer", "assetHeadCount", "assetHeadPassed")}, indent=2))
    print("Evidence:", output)
    return 0 if status == "passed" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("HOSTED HTTP AUDIT ERROR:", redact(error), file=sys.stderr)
        sys.exit(1)
