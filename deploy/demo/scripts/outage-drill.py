#!/usr/bin/env python3
"""Remove only the drill page during an outage; atomically restore it afterward."""
import argparse
import fcntl
import os
from pathlib import Path
import signal
import tempfile
import time

PAGE = b"<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Scheduled outage drill</title><h1>Scheduled outage drill</h1><p>The drill endpoint is healthy.</p></html>\n"
DIRECTORY = Path(__file__).resolve().parent.parent / "drill"


def restore(directory):
    # Mount the directory, not the file: Caddy must see removals and replacements.
    fd, temporary = tempfile.mkstemp(prefix=".status-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(PAGE)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(temporary, directory / "status.html")
    finally:
        Path(temporary).unlink(missing_ok=True)


def run(directory, action, seconds=600, sleep=time.sleep):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | (fcntl.LOCK_NB if action == "outage" else 0))
        except BlockingIOError:
            # A duplicate timer/manual start must not extend the current outage.
            return
        if action == "restore":
            restore(directory)
            return
        try:
            (directory / "status.html").unlink(missing_ok=True)
            sleep(seconds)
        finally:
            restore(directory)


def interrupted(signum, frame):
    raise SystemExit(128 + signum)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["restore", "outage"])
    parser.add_argument("--directory", type=Path, default=DIRECTORY)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    run(args.directory, args.action)


if __name__ == "__main__":
    main()
