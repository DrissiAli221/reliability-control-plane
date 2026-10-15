"""Run the deployment suite with all native integration checks required."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main():
    tools = ["docker", "initdb", "pg_ctl", "psql"]
    tools += [os.environ.get(variable) or default for variable, default in [
        ("CADDY_BINARY", "caddy"), ("ALLOY_BINARY", "alloy"), ("PROMTOOL_BINARY", "promtool")
    ]]
    missing = [tool for tool in tools if not shutil.which(tool)]
    if missing:
        print("Missing required test tools: " + ", ".join(missing), file=sys.stderr)
        return 1
    subprocess.run(["docker", "compose", "version"], check=True)
    version = subprocess.check_output(["pg_ctl", "--version"], text=True)
    if not version.startswith("pg_ctl (PostgreSQL) 17."):
        print("Deployment SQL tests require PostgreSQL 17", file=sys.stderr)
        return 1
    suite = unittest.defaultTestLoader.discover(str(ROOT / "deploy/demo/tests"))
    if suite.countTestCases() == 0:
        print("No deployment tests discovered", file=sys.stderr)
        return 1
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.skipped:
        print("Deployment CI must run every test; skipped tests are a failure", file=sys.stderr)
    return 0 if result.wasSuccessful() and not result.skipped else 1


if __name__ == "__main__":
    sys.exit(main())
