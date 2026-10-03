#!/usr/bin/env python3
"""Stream the latest completed backup over an authenticated SSH connection."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

NAME = re.compile(r"rcp-[0-9]{8}T[0-9]{6}Z\.dump")
CHUNK = 512 * 1024


def export(directory, output):
    candidates = sorted(p for p in directory.iterdir() if NAME.fullmatch(p.name)
                        and not p.is_symlink() and p.is_file())
    if not candidates:
        raise ValueError("No completed backup is available. Run the backup service first.")
    path = candidates[-1]
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size == 0:
            raise ValueError("The completed backup is not a nonempty regular file.")
        digest = hashlib.sha256()
        while block := source.read(CHUNK):
            digest.update(block)
        header = {"filename": path.name, "size": info.st_size, "sha256": digest.hexdigest()}
        output.write((json.dumps(header) + "\n").encode())
        source.seek(0)
        while block := source.read(CHUNK):
            output.write(block)
        output.flush()


if __name__ == "__main__":
    directory = Path(__file__).resolve().parent.parent / "backups"
    try:
        export(directory, sys.stdout.buffer)
    except (OSError, ValueError) as error:
        print(f"Backup export failed: {error}", file=sys.stderr)
        raise SystemExit(1)
