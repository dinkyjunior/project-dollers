#!/usr/bin/env python3
"""Keep independent browser QA logs, heartbeats and real exit receipts."""
import argparse
import datetime
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=1200)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if command[:2] != ["node", "qa/team-details/run.cjs"] or "--output" not in command:
        parser.error("Use -- node qa/team-details/run.cjs ... --output <fresh evidence directory>")
    output = Path(command[command.index("--output") + 1]).resolve()
    logs = output.parent / (output.name + "-process")
    logs.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    receipt = {"startedAt": utc(), "command": command, "output": str(output), "timeoutSeconds": args.timeout, "status": "running"}
    child = None
    with (logs / "stdout.log").open("w") as stdout:
        try:
            child = subprocess.Popen(command, stdout=stdout, stderr=subprocess.STDOUT, start_new_session=True)
            receipt["pid"] = child.pid
            (logs / "started.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print(f"Browser QA started, PID {child.pid}; durable receipts {logs}", flush=True)
            while child.poll() is None:
                elapsed = time.monotonic() - started
                if elapsed >= args.timeout:
                    os.killpg(child.pid, signal.SIGTERM)
                    try:
                        child.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait(timeout=20)
                    receipt.update(status="timed-out-incomplete", exitCode=124)
                    break
                try:
                    child.wait(timeout=min(20, args.timeout - elapsed))
                except subprocess.TimeoutExpired:
                    heartbeat = {"at": utc(), "pid": child.pid, "elapsedSeconds": round(time.monotonic() - started, 2), "status": "running"}
                    (logs / "heartbeat.json").write_text(json.dumps(heartbeat, indent=2) + "\n")
                    lines = (logs / "stdout.log").read_text().splitlines()
                    print(f"QA heartbeat {heartbeat['elapsedSeconds']}s: " + " | ".join(lines[-2:]), flush=True)
            if receipt["status"] == "running":
                receipt.update(status="passed-process" if child.returncode == 0 else "failed-process", exitCode=child.returncode)
        except BaseException as error:
            receipt.update(status="interrupted-incomplete", error=str(error), exitCode=1)
            if child is not None and child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=20)
        finally:
            receipt.update(completedAt=utc(), elapsedSeconds=round(time.monotonic() - started, 2))
            (logs / "exit.json").write_text(json.dumps(receipt, indent=2) + "\n")
            print(json.dumps(receipt), flush=True)
    return receipt["exitCode"]


if __name__ == "__main__":
    sys.exit(main())
