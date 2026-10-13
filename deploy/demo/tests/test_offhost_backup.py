"""Off-server backup transfers must fail safely and preserve existing data."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pull = load("pull-backup")
export = load("export-backup")
NAME = "rcp-20261003T040000Z.dump"
PAYLOAD = b"synthetic archive bytes"


def wire(payload=PAYLOAD, **overrides):
    header = {"filename": NAME, "size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
    header.update(overrides)
    return io.BytesIO(json.dumps(header).encode() + b"\n" + payload)


class OffhostBackup(unittest.TestCase):
    def test_export_and_download_round_trip_excludes_partials_and_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            server = root / "server"
            server.mkdir()
            (server / NAME).write_bytes(PAYLOAD)
            (server / ".partial-incomplete").write_bytes(b"partial")
            (server / "rcp-20990101T000000Z.dump").symlink_to(server / NAME)
            stream = io.BytesIO()
            export.export(server, stream)
            stream.seek(0)
            target = pull.receive(stream, root / "operator", 1024)
            self.assertEqual(target.read_bytes(), PAYLOAD)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_bad_transfer_preserves_existing_backup_and_removes_partial(self):
        for case in ("checksum", "truncated", "ssh"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as root:
                directory = Path(root)
                old = directory / "rcp-20261002T040000Z.dump"
                old.write_bytes(b"previous good backup")
                stream = wire(sha256="0" * 64) if case == "checksum" else wire()
                if case == "truncated":
                    stream = io.BytesIO(stream.getvalue()[:-2])
                def finish():
                    if case == "ssh":
                        raise ValueError("SSH export failed")
                with self.assertRaises(ValueError):
                    pull.receive(stream, directory, 1024, finish)
                self.assertEqual(list(directory.iterdir()), [old])

    def test_traversal_and_oversized_transfer_rejected(self):
        for overrides in ({"filename": "../stolen.dump"}, {"size": 2048}):
            with self.subTest(overrides=overrides), tempfile.TemporaryDirectory() as root:
                with self.assertRaises(ValueError):
                    pull.receive(wire(**overrides), Path(root), 1024)
                self.assertEqual(list(Path(root).iterdir()), [])

    def test_existing_backup_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            existing = directory / NAME
            existing.write_bytes(b"different original")
            with self.assertRaises(ValueError):
                pull.receive(wire(), directory, 1024)
            self.assertEqual(existing.read_bytes(), b"different original")
            self.assertEqual(list(directory.iterdir()), [existing])

    def test_repeated_verified_download_is_idempotent(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            first = pull.receive(wire(), directory, 1024)
            second = pull.receive(wire(), directory, 1024)
            self.assertEqual(first, second)
            self.assertEqual(list(directory.iterdir()), [first])


if __name__ == "__main__":
    unittest.main()
