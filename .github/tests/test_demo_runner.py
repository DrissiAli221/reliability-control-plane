"""CI must reject missing coverage, failed tests and skipped integration checks."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/test-demo.py"
spec = importlib.util.spec_from_file_location("demo_runner", SCRIPT)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class DemoRunnerContract(unittest.TestCase):
    def run_suite(self, suite, *, missing=None, postgres="17.6"):
        output = io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.dict(runner.os.environ, {
                "CADDY_BINARY": "caddy", "ALLOY_BINARY": "alloy", "PROMTOOL_BINARY": "promtool"
            }))
            stack.enter_context(patch.object(runner.shutil, "which", side_effect=
                lambda tool: None if tool == missing else "/fake/" + tool))
            stack.enter_context(patch.object(runner.subprocess, "run"))
            stack.enter_context(patch.object(runner.subprocess, "check_output", return_value=
                "pg_ctl (PostgreSQL) " + postgres + "\n"))
            stack.enter_context(patch.object(unittest.defaultTestLoader, "discover", return_value=suite))
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(contextlib.redirect_stderr(output))
            status = runner.main()
        return status, output.getvalue()

    def test_successful_nonempty_suite_passes(self):
        suite = unittest.TestSuite([unittest.FunctionTestCase(lambda: None)])
        self.assertEqual(self.run_suite(suite)[0], 0)

    def test_empty_suite_fails(self):
        status, output = self.run_suite(unittest.TestSuite())
        self.assertEqual(status, 1)
        self.assertIn("No deployment tests discovered", output)

    def test_assertion_failure_fails(self):
        def failing():
            raise AssertionError("synthetic failure")
        self.assertEqual(self.run_suite(unittest.TestSuite([unittest.FunctionTestCase(failing)]))[0], 1)

    def test_test_error_fails(self):
        def error():
            raise RuntimeError("synthetic error")
        self.assertEqual(self.run_suite(unittest.TestSuite([unittest.FunctionTestCase(error)]))[0], 1)

    def test_skipped_test_fails(self):
        def skipped():
            raise unittest.SkipTest("synthetic missing integration tool")
        self.assertEqual(self.run_suite(unittest.TestSuite([unittest.FunctionTestCase(skipped)]))[0], 1)

    def test_missing_native_tool_fails(self):
        suite = unittest.TestSuite([unittest.FunctionTestCase(lambda: None)])
        status, output = self.run_suite(suite, missing="caddy")
        self.assertEqual(status, 1)
        self.assertIn("Missing required test tools: caddy", output)

    def test_wrong_postgres_major_fails(self):
        suite = unittest.TestSuite([unittest.FunctionTestCase(lambda: None)])
        status, output = self.run_suite(suite, postgres="16.6")
        self.assertEqual(status, 1)
        self.assertIn("require PostgreSQL 17", output)


if __name__ == "__main__":
    unittest.main()
