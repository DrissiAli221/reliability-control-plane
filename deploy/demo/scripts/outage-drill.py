#!/usr/bin/env python3
"""Run a scheduled demo fault, with atomic state, duplicate protection and restoration."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import tempfile
import time
from drill_schedule import active_plan

PAGE = b"<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Scheduled outage drill</title><h1>Scheduled outage drill</h1><p>The drill endpoint is healthy.</p></html>\n"
DIRECTORY = Path(__file__).resolve().parent.parent / "drill"


def atomic_write(directory, name, content):
    fd, temporary = tempfile.mkstemp(prefix=".status-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(temporary, directory / name)
    finally:
        Path(temporary).unlink(missing_ok=True)


def restore(directory):
    atomic_write(directory, "status.html", PAGE)
    atomic_write(directory, "state.json", b'{"mode":"healthy"}\n')


def run(directory, action, seconds=600, sleep=time.sleep, now=time.time):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | (fcntl.LOCK_NB if action != "restore" else 0))
        except BlockingIOError:
            # A duplicate timer/manual start must not extend the current outage.
            return
        window = active_plan(int(now() * 1000))
        if action == "restore":
            # A reboot or manual stop within a window must not replay the interrupted fault.
            if window:
                atomic_write(directory, ".completed", str(window["cycleStart"]).encode())
            restore(directory)
            return
        if action == "scheduled":
            if not window:
                return
            completed = directory / ".completed"
            if completed.exists() and completed.read_text() == str(window["cycleStart"]):
                return
            # Record before starting: ExecStopPost/boot restore ends the fault permanently for this cycle.
            atomic_write(directory, ".completed", str(window["cycleStart"]).encode())
            seconds = max(0, (window["end"] - int(now() * 1000)) / 1000)
        else:
            start = int(now() * 1000)
            window = {"mode": "outage", "start": start, "end": start + int(seconds * 1000)}
        try:
            atomic_write(directory, "state.json", json.dumps(window).encode())
            if window["mode"] in ("outage", "blip"):
                (directory / "status.html").unlink(missing_ok=True)
            sleep(seconds)
        finally:
            restore(directory)


def interrupted(signum, frame):
    raise SystemExit(128 + signum)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["restore", "outage", "scheduled"])
    parser.add_argument("--directory", type=Path, default=DIRECTORY)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    run(args.directory, args.action)


if __name__ == "__main__":
    main()
