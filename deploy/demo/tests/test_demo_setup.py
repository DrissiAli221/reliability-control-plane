"""Deployment contract and backup failure tests; all inputs are synthetic."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

DEMO = Path(__file__).resolve().parent.parent
REPO = DEMO.parent.parent
spec = importlib.util.spec_from_file_location("demo_configure", DEMO / "scripts/configure.py")
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)


def outputs():
    issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_FAKE"
    origin = "https://dashboard.example.invalid"
    config = {"rcp": {
        "identity": {"issuer-uri": issuer, "client-id": "fake-client", "allowed-origins": origin, "read-only-group": "demo"},
        "runtime": {"enabled": True, "probe-job-queue-urls": {
            region: f"https://sqs.{region}.amazonaws.com/123456789012/jobs" for region in ["eu-west-1", "us-east-1"]},
            "probe-result-queue-region": "us-east-1", "probe-result-queue-url": "https://sqs.us-east-1.amazonaws.com/123456789012/results",
            "result-wait-time-seconds": 20, "result-visibility-timeout-seconds": 60},
        "monitors": {"max-per-owner": 5, "min-interval-seconds": 60, "max-total": 30, "max-timeout-ms": 5000},
        "demo": {"monitors": "Example Domain|https://example.com, Wikipedia|https://www.wikipedia.org, Scheduled outage drill|https://api.example.invalid/drill/status.html, GitHub Status|https://www.githubstatus.com/api/v2/status.json, Cloudflare Status|https://www.cloudflarestatus.com/api/v2/status.json", "example-monitor-url": "https://example.com"},
    }}
    return {
        "identity": {"value": {"issuer_uri": issuer, "client_id": "fake-client"}},
        "dashboard": {"value": {"origin": origin, "build_environment": {
            "VITE_API_BASE_URL": "https://api.example.invalid", "VITE_AUTH_MODE": "cognito",
            "VITE_COGNITO_AUTHORITY": issuer, "VITE_COGNITO_CLIENT_ID": "fake-client"}}},
        "server_application_json": {"value": json.dumps(config)},
    }


class ConfigurationContract(unittest.TestCase):
    def test_configuration_keeps_exact_queue_map_keys_and_does_not_embed_secrets(self):
        config, env, build = configure.render(outputs(), "api.example.invalid", "operator@example.invalid")
        self.assertEqual(set(config["rcp"]["runtime"]["probe-job-queue-urls"]), {"eu-west-1", "us-east-1"})
        self.assertNotIn("PASSWORD", env + build + json.dumps(config))
        self.assertNotIn("ACCESS_KEY", env + build + json.dumps(config))

    def test_rejects_contract_drift(self):
        mutations = [
            lambda c: c["rcp"]["demo"].update({"monitors": "Example Domain|https://example.com"}),
            lambda c: c["rcp"]["runtime"]["probe-job-queue-urls"].pop("eu-west-1"),
            lambda c: c["rcp"]["runtime"]["probe-job-queue-urls"].update({"eu-west-1": "https://sqs.us-east-1.amazonaws.com/123456789012/jobs"}),
            lambda c: c["rcp"]["monitors"].update({"min-interval-seconds": 30}),
            lambda c: c["rcp"]["monitors"].update({"max-timeout-ms": 10000}),
            lambda c: c["rcp"]["monitors"].update({"max-timeout-ms": 30000}),
            lambda c: c["rcp"]["demo"].update({"seed-example-monitor": True}),
            lambda c: c["rcp"]["identity"].update({"allowed-origins": "*"}),
            lambda c: c["rcp"]["identity"].update({"read-only-group": "operators"}),
            lambda c: c["rcp"]["runtime"].update({"result-wait-time-seconds": 0}),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = outputs()
                config = json.loads(data["server_application_json"]["value"])
                mutate(config)
                data["server_application_json"]["value"] = json.dumps(config)
                with self.assertRaises(ValueError):
                    configure.render(data, "api.example.invalid", "operator@example.invalid")

    def test_api_origin_must_match_terraform(self):
        with self.assertRaises(ValueError):
            configure.render(outputs(), "wrong.example.invalid", "operator@example.invalid")

    def test_domain_and_email_cannot_inject_environment_lines(self):
        for domain, email in [("api.example.invalid\nBAD=1", "a@b.invalid"), ("api.example.invalid", "a@b.invalid\nBAD=1")]:
            with self.assertRaises(ValueError):
                configure.render(outputs(), domain, email)

    def test_generated_files_are_private_and_existing_files_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            source = directory / "outputs.json"
            source.write_text(json.dumps(outputs()))
            destination = directory / "deployment"
            args = ["python3", str(DEMO / "scripts/configure.py"), str(source), "--api-domain", "api.example.invalid",
                    "--acme-email", "operator@example.invalid", "--directory", str(destination)]
            result = subprocess.run(args, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            generated = destination / "secrets/application.json"
            self.assertEqual(generated.stat().st_mode & 0o777, 0o600)
            self.assertEqual((destination / "secrets").stat().st_mode & 0o777, 0o700)
            generated.write_text("preserve-existing-content")
            result = subprocess.run(args, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(generated.read_text(), "preserve-existing-content")


class BackupFailures(unittest.TestCase):
    def test_failed_or_corrupt_dump_preserves_previous_backup_and_removes_partial(self):
        for failure in ["dump", "list"]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                directory = Path(directory)
                (directory / "scripts").mkdir()
                shutil.copy(DEMO / "scripts/backup.sh", directory / "scripts/backup.sh")
                backup_dir = directory / "backups"
                backup_dir.mkdir()
                previous = backup_dir / "rcp-20000101T000000Z.dump"
                previous.write_text("previous-working-backup")
                os.utime(previous, (1, 1))
                bin_dir = directory / "bin"
                bin_dir.mkdir()
                docker = bin_dir / "docker"
                docker.write_text('''#!/usr/bin/env bash
if [[ "$*" == *pg_dump* ]]; then
  echo partial-dump
  [[ "$FAILURE" != dump ]]
elif [[ "$*" == *pg_restore* ]]; then
  cat >/dev/null
  [[ "$FAILURE" != list ]]
else
  exit 99
fi
''')
                docker.chmod(0o755)
                env = os.environ | {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"], "FAILURE": failure}
                result = subprocess.run(["bash", str(directory / "scripts/backup.sh")], env=env, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(previous.read_text(), "previous-working-backup")
                self.assertEqual(list(backup_dir.iterdir()), [previous])

    def test_concurrent_backup_refuses_existing_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            (directory / "scripts").mkdir()
            shutil.copy(DEMO / "scripts/backup.sh", directory / "scripts/backup.sh")
            (directory / "backups/.backup-lock").mkdir(parents=True)
            result = subprocess.run(["bash", str(directory / "scripts/backup.sh")], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue((directory / "backups/.backup-lock").is_dir())


if __name__ == "__main__":
    unittest.main()
