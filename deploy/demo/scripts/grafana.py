#!/usr/bin/env python3
"""Keep Grafana tokens in private files; configure the existing stack only when invoked."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request


def read_token(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError("Token file must be a regular private file (chmod 600)")
    token = path.read_text().strip()
    if not token or re.search(r"\s", token):
        raise ValueError("Token must be nonempty and contain no whitespace")
    return token


def write_token(path, token):
    if not isinstance(token, str) or not token or re.search(r"\s", token):
        raise ValueError("Token must be nonempty and contain no whitespace")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(token + "\n")


def request_json(url, token, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data=body, headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json"})
    # No redirects: do not forward a token to a different host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError("Grafana request failed with HTTP " + str(error.code)) from None
    except urllib.error.URLError:
        raise ValueError("Grafana request failed; check HTTPS connectivity") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    store = commands.add_parser("store-token", help="Prompt without echo; never overwrite an existing token")
    store.add_argument("path", type=Path)
    inspect = commands.add_parser("inspect", help="List existing Prometheus data source names and UIDs")
    inspect.add_argument("--stack-url", required=True)
    inspect.add_argument("--grafana-token-file", type=Path, required=True)
    install = commands.add_parser("bootstrap-sm", help="Register SM on an existing stack and save its API token")
    install.add_argument("--sm-api-url", required=True)
    install.add_argument("--publisher-token-file", type=Path, required=True)
    for name in ["stack-id", "metrics-instance-id", "logs-instance-id"]:
        install.add_argument("--" + name, type=int, required=True)
    install.add_argument("--output", type=Path, required=True)
    terraform = commands.add_parser("terraform", help="Pass private tokens to Terraform through environment variables")
    terraform.add_argument("--grafana-token-file", type=Path, required=True)
    terraform.add_argument("--sm-token-file", type=Path, required=True)
    terraform.add_argument("--binary", default="terraform")
    terraform.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if args.command == "store-token":
            if not sys.stdin.isatty():
                raise ValueError("Run store-token in your own interactive terminal")
            write_token(args.path, getpass.getpass("Grafana token (hidden): ").strip())
            print("Private token file created")
        elif args.command == "inspect":
            if not re.fullmatch(r"https://[a-z0-9-]+\.grafana\.net", args.stack_url):
                raise ValueError("Use the base HTTPS Grafana Cloud stack URL")
            datasources = request_json(args.stack_url + "/api/datasources", read_token(args.grafana_token_file))
            for datasource in datasources:
                if datasource.get("type") == "prometheus":
                    print(json.dumps({"name": datasource["name"], "uid": datasource["uid"]}))
        elif args.command == "bootstrap-sm":
            if not re.fullmatch(r"https://synthetic-monitoring-api[-a-z0-9]*\.grafana\.net", args.sm_api_url):
                raise ValueError("Use the HTTPS SM backend address from the stack's Config page")
            if args.output.exists() or args.output.is_symlink():
                raise ValueError("Output already exists; this command does not rotate tokens")
            if min(args.stack_id, args.metrics_instance_id, args.logs_instance_id) < 1:
                raise ValueError("Stack and hosted instance IDs must be positive")
            response = request_json(args.sm_api_url + "/api/v1/register/install", read_token(args.publisher_token_file), {
                "stackId": args.stack_id, "metricsInstanceId": args.metrics_instance_id,
                "logsInstanceId": args.logs_instance_id})
            write_token(args.output, response["accessToken"])
            print("Synthetic Monitoring API token saved privately")
        else:
            arguments = args.arguments[1:] if args.arguments[:1] == ["--"] else args.arguments
            if not arguments:
                raise ValueError("Pass Terraform arguments after --")
            environment = os.environ | {"GRAFANA_AUTH": read_token(args.grafana_token_file),
                                        "GRAFANA_SM_ACCESS_TOKEN": read_token(args.sm_token_file)}
            # Debug logging can expose provider requests or credentials.
            for name in ["TF_LOG", "TF_LOG_CORE", "TF_LOG_PROVIDER", "TF_LOG_PATH"]:
                environment.pop(name, None)
            return subprocess.call([args.binary, *arguments], env=environment)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    sys.exit(main())
