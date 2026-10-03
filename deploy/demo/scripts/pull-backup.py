#!/usr/bin/env python3
"""Download a verified backup onto the operator machine without cloud credentials."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

CHUNK = 512 * 1024
NAME = re.compile(r"rcp-[0-9]{8}T[0-9]{6}Z\.dump")


def receive(stream, directory, max_size, finish=lambda: None):
    line = stream.readline(4097)
    if len(line) > 4096 or not line.endswith(b"\n"):
        raise ValueError("Invalid backup header.")
    header = json.loads(line)
    if not isinstance(header, dict):
        raise ValueError("Invalid backup metadata.")
    name, size, expected = header.get("filename"), header.get("size"), header.get("sha256")
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise ValueError("Invalid backup filename.")
    if type(size) is not int or not 0 < size <= max_size:
        raise ValueError("Backup size is invalid or exceeds the configured limit.")
    if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("Invalid backup checksum.")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        raise ValueError("The destination directory must be private (chmod 700).")
    space = os.statvfs(directory)
    if size > space.f_bavail * space.f_frsize:
        raise ValueError("Insufficient free space for the backup.")
    fd, temporary = tempfile.mkstemp(prefix=".partial-", dir=directory)
    temporary = Path(temporary)
    target = directory / name
    try:
        digest = hashlib.sha256()
        remaining = size
        with os.fdopen(fd, "wb") as output:
            while remaining:
                block = stream.read(min(CHUNK, remaining))
                if not block:
                    raise ValueError("Backup transfer ended early.")
                output.write(block)
                digest.update(block)
                remaining -= len(block)
            output.flush()
            os.fsync(output.fileno())
        if stream.read(1) or digest.hexdigest() != expected:
            raise ValueError("Backup length/checksum verification failed.")
        finish()  # SSH must exit successfully before the archive is published.
        # Atomic no-clobber publication; a concurrent download cannot overwrite data.
        try:
            os.link(temporary, target)
        except FileExistsError:
            if target.is_symlink() or not target.is_file():
                raise ValueError("Existing destination is not a regular backup.")
            with target.open("rb") as existing:
                saved = hashlib.sha256()
                while block := existing.read(CHUNK):
                    saved.update(block)
            if saved.hexdigest() != expected:
                raise ValueError("An existing backup with this name has different contents.")
        return target
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, help="SSH hostname/IPv4, optionally ubuntu@host.")
    parser.add_argument("--identity", type=Path, help="Existing SSH private key; otherwise use your SSH agent.")
    parser.add_argument("--directory", type=Path, required=True, help="Private folder outside the repository.")
    parser.add_argument("--max-size-mb", type=int, default=1024)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*(?:@[A-Za-z0-9][A-Za-z0-9_.-]*)?", args.host):
        parser.error("Use a plain SSH hostname or user@hostname, without options or shell syntax.")
    if args.max_size_mb < 1:
        parser.error("--max-size-mb must be positive.")
    command = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2"]
    if args.identity:
        command.extend(["-i", str(args.identity.expanduser())])
    command.extend([args.host, "sudo -n python3 /opt/rcp/deploy/demo/scripts/export-backup.py"])
    process = subprocess.Popen(command, stdout=subprocess.PIPE)

    def finish():
        if process.wait() != 0:
            raise ValueError("Remote backup export failed.")

    try:
        destination = receive(process.stdout, args.directory.expanduser(), args.max_size_mb * 1024 * 1024, finish)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Backup download failed: {error}\n")
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
        process.wait()
    print(f"Verified off-server backup saved: {destination}")


if __name__ == "__main__":
    main()
