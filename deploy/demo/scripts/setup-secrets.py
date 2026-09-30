#!/usr/bin/env python3
"""Create host-only secrets interactively. Does not contact AWS."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--credentials-json", type=Path, required=True,
                        help="Private AWS CLI create-access-key output; never commit it")
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent.parent / "secrets")
    args = parser.parse_args()
    key = json.loads(args.credentials_json.read_text())["AccessKey"]
    if not re.fullmatch(r"[A-Z0-9]+", key["AccessKeyId"]):
        parser.error("Invalid access-key ID")
    if not re.fullmatch(r"[A-Za-z0-9/+=]+", key["SecretAccessKey"]):
        parser.error("Invalid secret-key format")
    names = ["postgres_password", "aws_credentials", "demo_username", "demo_password"]
    args.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if any((args.directory / name).exists() for name in names):
        parser.error("Secrets already exist; this setup command does not rotate or overwrite them")
    username = input("Demo account email: ").strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", username):
        parser.error("Enter a valid demo email")
    password = getpass.getpass("Demo password (14+ chars, upper/lower/digit/symbol): ")
    if (len(password) < 14 or len(password) > 256 or re.search(r"\s", password) or
            not all(re.search(pattern, password) for pattern in [r"[A-Z]", r"[a-z]", r"[0-9]", r"[^A-Za-z0-9]"])):
        parser.error("Password does not meet the Cognito policy")
    if getpass.getpass("Repeat demo password: ") != password:
        parser.error("Passwords differ")
    values = {
        "postgres_password": secrets.token_urlsafe(36),
        "aws_credentials": f"[rcp-demo]\naws_access_key_id = {key['AccessKeyId']}\naws_secret_access_key = {key['SecretAccessKey']}\n",
        "demo_username": username + "\n",
        "demo_password": password + "\n",
    }
    for name, value in values.items():
        fd = os.open(args.directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(value)
    print("Created secrets. See the runbook for the server's file ownership and demo-user provisioning steps.")


if __name__ == "__main__":
    main()
