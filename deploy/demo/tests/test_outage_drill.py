"""Exercise outage transitions, interruption recovery and duplicate starts."""
import fcntl
import importlib.util
from pathlib import Path
import signal
import sys
import subprocess
import tempfile
import time
import unittest

DEMO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DEMO / "scripts"))
SCRIPT = DEMO / "scripts/outage-drill.py"
spec = importlib.util.spec_from_file_location("outage_drill", SCRIPT)
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)


class OutageDrill(unittest.TestCase):
    def test_healthy_outage_healthy_and_only_status_is_removed(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            unrelated = directory / "keep.txt"
            unrelated.write_text("preserve")
            drill.run(directory, "restore")
            drill.run(directory, "restore")
            self.assertEqual((directory / "status.html").read_bytes(), drill.PAGE)
            def during_outage(seconds):
                self.assertEqual(seconds, 600)
                self.assertFalse((directory / "status.html").exists())
                self.assertEqual(unrelated.read_text(), "preserve")
            drill.run(directory, "outage", sleep=during_outage)
            self.assertEqual((directory / "status.html").read_bytes(), drill.PAGE)
            self.assertEqual((directory / "status.html").stat().st_mode & 0o777, 0o644)
            self.assertFalse(list(directory.glob(".status-*")))

    def test_failure_restores_even_if_page_was_initially_absent(self):
        with tempfile.TemporaryDirectory() as temp:
            def fail(seconds):
                raise RuntimeError("interrupted")
            with self.assertRaises(RuntimeError):
                drill.run(Path(temp), "outage", sleep=fail)
            self.assertEqual((Path(temp) / "status.html").read_bytes(), drill.PAGE)

    def test_duplicate_start_does_not_restore_or_extend_running_outage(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with (directory / ".lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                drill.run(directory, "outage", sleep=lambda _: self.fail("Duplicate slept"))
                self.assertFalse((directory / "status.html").exists())

    def test_process_signals_and_boot_restore(self):
        for sig in [signal.SIGTERM, signal.SIGKILL]:
            with self.subTest(signal=sig), tempfile.TemporaryDirectory() as temp:
                directory = Path(temp)
                drill.run(directory, "restore")
                process = subprocess.Popen(["python3", str(SCRIPT), "outage", "--directory", temp])
                try:
                    deadline = time.monotonic() + 5
                    while (directory / "status.html").exists() and time.monotonic() < deadline:
                        time.sleep(0.01)
                    self.assertFalse((directory / "status.html").exists())
                    process.send_signal(sig)
                    process.wait(timeout=5)
                    if sig == signal.SIGTERM:
                        self.assertEqual((directory / "status.html").read_bytes(), drill.PAGE)
                    # Simulates ExecStopPost or recovery at the next boot after power loss.
                    subprocess.run(["python3", str(SCRIPT), "restore", "--directory", temp], check=True)
                    self.assertEqual((directory / "status.html").read_bytes(), drill.PAGE)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait()


if __name__ == "__main__":
    unittest.main()
