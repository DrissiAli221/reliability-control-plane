#!/usr/bin/env python3
"""Operator-run AWS CLI provisioning. Reads a password file, never puts it in argv."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("outputs", type=Path)
    parser.add_argument("--secrets-directory", type=Path, default=Path(__file__).resolve().parent.parent / "secrets")
    args = parser.parse_args()
    identity = json.loads(args.outputs.read_text())["identity"]["value"]
    username = (args.secrets_directory / "demo_username").read_text().strip()
    password = (args.secrets_directory / "demo_password").read_text().rstrip("\r\n")
    if identity["region"] != "us-east-1" or identity["demo_group"] != "demo":
        parser.error("Unexpected demo identity configuration")
    common = {"UserPoolId": identity["user_pool_id"], "Username": username}
    requests = [
        ("admin-create-user", {**common, "MessageAction": "SUPPRESS", "UserAttributes": [
            {"Name": "email", "Value": username}, {"Name": "email_verified", "Value": "true"}]}),
        # Membership is added before making the account sign-in capable.
        ("admin-add-user-to-group", {**common, "GroupName": "demo"}),
        ("admin-set-user-password", {**common, "Password": password, "Permanent": True}),
    ]
    with tempfile.TemporaryDirectory(prefix="rcp-demo-user-") as directory:
        request_file = Path(directory) / "request.json"
        fd = os.open(request_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        for operation, payload in requests:
            request_file.write_text(json.dumps(payload))
            # No --debug and no token/credential output. Uses the operator's CLI identity.
            subprocess.run(["aws", "cognito-idp", operation, "--region", "us-east-1",
                            "--cli-input-json", f"file://{request_file}", "--no-cli-pager"],
                           check=True, stdout=subprocess.DEVNULL)
    print("Created a confirmed user in the demo group. Do not enable MFA on this shared account.")


if __name__ == "__main__":
    main()
