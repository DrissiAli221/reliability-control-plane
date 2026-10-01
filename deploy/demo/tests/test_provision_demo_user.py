"""The AWS CLI is mocked; these tests never create an account or user."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/provision-demo-user.py"
spec = importlib.util.spec_from_file_location("provision_demo_user", SCRIPT)
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)
IDENTITY = {"region": "us-east-1", "demo_group": "demo", "user_pool_id": "us-east-1_FAKE"}
SUBJECT = "11111111-2222-3333-4444-555555555555"
PASSWORD = "Fake-local-password-123!"


def secret_files(directory):
    directory = Path(directory)
    (directory / "demo_username").write_text("demo@example.invalid\n")
    (directory / "demo_password").write_text(PASSWORD + "\n")
    return directory


class ProvisionedSubject(unittest.TestCase):
    def test_captures_cognito_sub_without_extra_permissions_or_password_in_arguments(self):
        calls = []
        def cli(args, **kwargs):
            self.assertNotIn(PASSWORD, " ".join(args))
            filename = Path(args[args.index("--cli-input-json") + 1][5:])
            self.assertEqual(filename.stat().st_mode & 0o777, 0o600)
            calls.append((args[2], json.loads(filename.read_text())))
            response = {"User": {"Attributes": [{"Name": "sub", "Value": SUBJECT}]}} if args[2] == "admin-create-user" else {}
            return subprocess.CompletedProcess(args, 0, stdout=json.dumps(response))
        with tempfile.TemporaryDirectory() as directory, patch.object(provision.subprocess, "run", side_effect=cli):
            secrets = secret_files(directory)
            provision.provision(IDENTITY, secrets)
            owner = secrets / "demo_owner_subject"
            self.assertEqual(owner.read_text().strip(), SUBJECT)
            self.assertEqual(owner.stat().st_mode & 0o777, 0o600)
        self.assertEqual([operation for operation, _ in calls], ["admin-create-user", "admin-add-user-to-group", "admin-set-user-password"])
        self.assertEqual(calls[1][1]["GroupName"], "demo")
        self.assertTrue(calls[2][1]["Permanent"])

    def test_preserves_existing_workspace_identity_before_any_aws_call(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(provision.subprocess, "run") as cli:
            secrets = secret_files(directory)
            (secrets / "demo_owner_subject").write_text("existing-identity")
            with self.assertRaises(ValueError):
                provision.provision(IDENTITY, secrets)
            cli.assert_not_called()
            self.assertEqual((secrets / "demo_owner_subject").read_text(), "existing-identity")

    def test_refuses_non_uuid_subject_instead_of_seeding_for_an_email(self):
        response = {"User": {"Attributes": [{"Name": "sub", "Value": "demo@example.invalid"}]}}
        with tempfile.TemporaryDirectory() as directory, patch.object(provision.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout=json.dumps(response))) as cli:
            secrets = secret_files(directory)
            with self.assertRaises(ValueError):
                provision.provision(IDENTITY, secrets)
            self.assertEqual(cli.call_count, 1)
            self.assertFalse((secrets / "demo_owner_subject").exists())

    def test_failed_activation_does_not_publish_a_seed_identity(self):
        created = json.dumps({"User": {"Attributes": [{"Name": "sub", "Value": SUBJECT}]}})
        results = [subprocess.CompletedProcess([], 0, stdout=created), subprocess.CompletedProcess([], 0, stdout="{}"),
                   subprocess.CalledProcessError(1, ["aws", "cognito-idp", "admin-set-user-password"])]
        with tempfile.TemporaryDirectory() as directory, patch.object(provision.subprocess, "run", side_effect=results):
            secrets = secret_files(directory)
            with self.assertRaises(subprocess.CalledProcessError):
                provision.provision(IDENTITY, secrets)
            self.assertFalse((secrets / "demo_owner_subject").exists())


if __name__ == "__main__":
    unittest.main()
