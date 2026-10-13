#!/usr/bin/env python3
"""Operator-run AWS CLI provisioning. Reads a password file, never puts it in argv."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid


def provision(identity, secret_directory):
    if identity["region"] != "us-east-1" or identity["demo_group"] != "demo":
        raise ValueError("Unexpected demo identity configuration")
    subject_file = secret_directory / "demo_owner_subject"
    if subject_file.exists():
        raise ValueError("Demo owner subject already exists; do not overwrite an existing workspace identity")
    username = (secret_directory / "demo_username").read_text().strip()
    password = (secret_directory / "demo_password").read_text().rstrip("\r\n")
    if not username or not password:
        raise ValueError("Demo username and password files must not be empty")
    common = {"UserPoolId": identity["user_pool_id"], "Username": username}
    create_request = {**common, "MessageAction": "SUPPRESS", "UserAttributes": [
        {"Name": "email", "Value": username}, {"Name": "email_verified", "Value": "true"}]}
    with tempfile.TemporaryDirectory(prefix="rcp-demo-user-") as directory:
        request_file = Path(directory) / "request.json"
        fd = os.open(request_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        def call(operation, payload):
            request_file.write_text(json.dumps(payload))
            # No --debug, no password in argv, no credential/user metadata printed.
            return subprocess.run(["aws", "cognito-idp", operation, "--region", "us-east-1",
                                   "--cli-input-json", f"file://{request_file}", "--no-cli-pager", "--output", "json"],
                                  check=True, stdout=subprocess.PIPE, text=True).stdout
        created = json.loads(call("admin-create-user", create_request))
        attributes = {item["Name"]: item["Value"] for item in created["User"]["Attributes"]}
        # The JWT subject is the pool's UUID sub, not the email/username.
        subject = str(uuid.UUID(attributes["sub"]))
        call("admin-add-user-to-group", {**common, "GroupName": "demo"})
        # Membership is established before making the user sign-in capable.
        call("admin-set-user-password", {**common, "Password": password, "Permanent": True})
        fd = os.open(subject_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(subject + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("outputs", type=Path)
    parser.add_argument("--secrets-directory", type=Path, default=Path(__file__).resolve().parent.parent / "secrets")
    args = parser.parse_args()
    identity = json.loads(args.outputs.read_text())["identity"]["value"]
    provision(identity, args.secrets_directory)
    print("Created a confirmed demo-group user and saved its owner subject. Do not enable MFA on this account.")


if __name__ == "__main__":
    main()
