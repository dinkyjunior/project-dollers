#!/usr/bin/env python3
"""Boundedly supervise only an identified, already-running owned QA job.

This operational helper never edits application code, frozen assertions, or QA
results. The original durable wrapper resumes to reap the genuine child exit.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import time


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def process(pid):
    directory = Path(f"/proc/{pid}")
    try:
        fields = directory.joinpath("stat").read_text().rsplit(")", 1)[1].split()
        argv = [value.decode() for value in directory.joinpath("cmdline").read_bytes().split(b"\0") if value]
    except FileNotFoundError:
        return None
    return {"pid": pid, "state": fields[0], "ppid": int(fields[1]),
            "processGroup": int(fields[2]), "startTicks": fields[19], "argv": argv}


def alive(identity):
    current = process(identity["pid"])
    if current is None or current["state"] in ("Z", "X"):
        return False
    if current["startTicks"] != identity["startTicks"]:
        raise RuntimeError("PID identity changed; refusing to signal a replacement process")
    return True


def write(path, value):
    pending = path.with_suffix(path.suffix + ".next")
    pending.write_text(json.dumps(value, indent=2) + "\n")
    pending.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--parent", required=True, type=int)
    parser.add_argument("--child", required=True, type=int)
    parser.add_argument("--effective-timeout", required=True, type=int)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = Path(args.output).resolve()
    if not output.is_relative_to(root / "qa/team-details"):
        raise ValueError("Only owned team-details QA output is supported")
    logs = output.parent / (output.name + "-process")
    started_path = logs / "started.json"
    started = json.loads(started_path.read_text())
    child, parent = process(args.child), process(args.parent)
    if child is None or parent is None or child["state"] in ("Z", "X"):
        raise RuntimeError("The exact QA child and original watchdog must still be running")
    expected_child = started["command"]
    expected_parent = ["python3", "qa/team-details/run-durable.py", "--timeout",
                       str(started["timeoutSeconds"]), "--"] + expected_child
    if started["pid"] != args.child or child["ppid"] != args.parent or child["processGroup"] != args.child:
        raise RuntimeError("The recorded direct-child/process-group identity does not match")
    if child["argv"] != expected_child or parent["argv"] != expected_parent:
        raise RuntimeError("Refusing to supervise commands outside this exact owned QA run")
    if expected_child[:2] != ["node", "qa/team-details/run.cjs"] or expected_child[expected_child.index("--output") + 1] != args.output:
        raise RuntimeError("The exact runner/output argument does not match")
    report = json.loads((output / "results.json").read_text())
    source = report["source"]
    bindings = {**source["runtimeFiles"], **source["testFiles"]}
    changed = [name for name, expected in bindings.items() if sha(root / name) != expected]
    if changed:
        raise RuntimeError("Frozen source/assertion identities changed: " + ", ".join(changed))
    original_start = datetime.datetime.fromisoformat(started["startedAt"])
    original_elapsed = (datetime.datetime.now(datetime.timezone.utc) - original_start).total_seconds()
    if original_elapsed >= started["timeoutSeconds"]:
        raise RuntimeError("The original deadline is already reached; preserve its actual disposition")
    if args.effective_timeout <= started["timeoutSeconds"]:
        raise ValueError("The explicitly authorized effective deadline must exceed the original deadline")
    remaining = args.effective_timeout - original_elapsed
    deadline = time.monotonic() + remaining
    supervision = logs / "external-supervision"
    supervision.mkdir(exist_ok=False)
    receipt = {"status": "starting", "startedAt": utc(), "supervisorPid": os.getpid(),
               "originalStartedAt": started["startedAt"], "originalTimeoutSeconds": started["timeoutSeconds"],
               "effectiveTimeoutSeconds": args.effective_timeout,
               "effectiveDeadlineUtc": (original_start + datetime.timedelta(seconds=args.effective_timeout)).isoformat(),
               "authorization": "Root authorized an explicit external Unix operational deadline extension for these identified owned QA processes. Every browser action and assertion remains unchanged.",
               "originalStartedReceiptSha256": sha(started_path), "parentIdentity": parent, "childIdentity": child,
               "frozenRuntimeFiles": len(source["runtimeFiles"]), "frozenTestFiles": source["testFiles"],
               "runtimeAndTestsUnchangedBefore": True,
               "qualification": "This operational receipt is not a passing QA result. The original wrapper must reap the genuine child exit and independently validate the untouched completed results.json.",
               "operationalHelperSha256": sha(__file__)}
    write(supervision / "started.json", receipt)
    stopped = False

    def interrupted(signum, frame):
        raise RuntimeError(f"Operational supervisor interrupted by signal {signum}")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        if not alive(parent) or not alive(child):
            raise RuntimeError("The verified processes exited before operational supervision")
        os.kill(args.parent, signal.SIGSTOP)
        stopped = True
        stop_deadline = time.monotonic() + 2
        while process(args.parent)["state"] not in ("T", "t") and time.monotonic() < stop_deadline:
            time.sleep(0.01)
        receipt.update(status="supervising", parentStoppedAt=utc())
        write(supervision / "started.json", receipt)
        print(f"Owned watchdog {args.parent} stopped; child {args.child} continues unchanged; explicit effective deadline {receipt['effectiveDeadlineUtc']}", flush=True)
        while alive(child):
            current = process(args.parent)
            if current is None or current["startTicks"] != parent["startTicks"] or current["state"] not in ("T", "t"):
                raise RuntimeError("The original watchdog is not in the verified stopped state")
            if time.monotonic() >= deadline:
                receipt.update(status="effective-deadline-reached-incomplete", terminationAt=utc())
                os.killpg(child["processGroup"], signal.SIGTERM)
                grace = time.monotonic() + 20
                while alive(child) and time.monotonic() < grace:
                    time.sleep(0.5)
                if alive(child):
                    os.killpg(child["processGroup"], signal.SIGKILL)
                break
            latest = json.loads((output / "results.json").read_text())
            progress = [{"viewport": case.get("viewport"), "status": case.get("status"),
                         "phase": case.get("phase"), "checkpointAt": case.get("checkpointAt")}
                        for case in latest.get("results", [])]
            heartbeat = {"at": utc(), "status": "supervising", "childPid": args.child,
                         "elapsedFromOriginalStartSeconds": round(args.effective_timeout - (deadline - time.monotonic()), 2),
                         "effectiveTimeoutSeconds": args.effective_timeout, "actualScenarioProgress": progress}
            write(supervision / "heartbeat.json", heartbeat)
            print("Operational heartbeat " + json.dumps(heartbeat), flush=True)
            time.sleep(min(20, max(0.1, deadline - time.monotonic())))
        if receipt["status"] == "supervising":
            receipt.update(status="child-exited-awaiting-original-wrapper")
    except BaseException as error:
        receipt.update(status="operational-supervision-error-not-accepted", error=str(error))
    finally:
        if stopped and alive(parent):
            os.kill(args.parent, signal.SIGCONT)
            receipt["parentResumedAt"] = utc()
        receipt.update(completedAt=utc(), runtimeAndTestsUnchangedAfter=
                       all(sha(root / name) == expected for name, expected in bindings.items()))
        receipt["finalResultsSha256"] = sha(output / "results.json")
        write(supervision / "exit.json", receipt)
        print(json.dumps(receipt), flush=True)
    return 0 if receipt["status"] == "child-exited-awaiting-original-wrapper" else 1


if __name__ == "__main__":
    raise SystemExit(main())
