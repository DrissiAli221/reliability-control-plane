#!/usr/bin/env python3
"""Render deployment configuration from `terraform output -json`, without secrets."""
import argparse
import json
import os
from pathlib import Path
import re


def render(outputs, api_domain, acme_email):
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", api_domain) or "." not in api_domain:
        raise ValueError("API domain must be a DNS hostname, without scheme or path")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", acme_email):
        raise ValueError("ACME email must be an email address")
    dashboard = outputs["dashboard"]["value"]
    identity = outputs["identity"]["value"]
    if dashboard["build_environment"]["VITE_API_BASE_URL"] != f"https://{api_domain}":
        raise ValueError("API domain differs from the Terraform api_origin")
    config = json.loads(outputs["server_application_json"]["value"])
    rcp = config["rcp"]
    queues = rcp["runtime"]["probe-job-queue-urls"]
    if set(queues) != {"eu-west-1", "us-east-1"}:
        raise ValueError("Scheduler requires exactly eu-west-1 and us-east-1 queues")
    for region, url in queues.items():
        if not url.startswith(f"https://sqs.{region}.amazonaws.com/"):
            raise ValueError(f"Invalid job queue URL for {region}")
    if rcp["runtime"]["probe-result-queue-region"] != "us-east-1":
        raise ValueError("Demo results must be centralized in us-east-1")
    if not rcp["runtime"]["probe-result-queue-url"].startswith("https://sqs.us-east-1.amazonaws.com/"):
        raise ValueError("Invalid result queue URL")
    if rcp["identity"]["issuer-uri"] != identity["issuer_uri"]:
        raise ValueError("Identity issuer differs between outputs")
    if rcp["identity"]["client-id"] != identity["client_id"]:
        raise ValueError("Identity client differs between outputs")
    if rcp["identity"]["read-only-group"] != "demo":
        raise ValueError("Read-only group must be demo")
    if rcp["identity"]["allowed-origins"] != dashboard["origin"]:
        raise ValueError("CORS origin differs from the dashboard")
    if rcp["monitors"] != {"max-per-owner": 3, "min-interval-seconds": 60, "max-total": 25, "max-timeout-ms": 5000}:
        raise ValueError("Unexpected demo quotas")
    demo = rcp["demo"]
    if "seed-example-monitor" in demo:
        raise ValueError("The old seed-example-monitor flag is unsupported; regenerate outputs")
    if demo.get("monitors") != "Example Domain|https://example.com, Wikipedia|https://www.wikipedia.org":
        raise ValueError("Unexpected shared demo seed targets")
    if demo.get("example-monitor-url") != "https://example.com":
        raise ValueError("Unexpected onboarding example URL")
    if rcp["runtime"]["result-wait-time-seconds"] != 20:
        raise ValueError("Use 20-second result long polling")
    env = f"RCP_API_DOMAIN={api_domain}\nACME_EMAIL={acme_email}\nRCP_CONTROL_PLANE_IMAGE=rcp-control-plane:demo\n"
    build_env = "".join(f"{key}={value}\n" for key, value in dashboard["build_environment"].items())
    return config, env, build_env


def write_new(path, content):
    # Refuse accidental replacement of existing deployment configuration.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("outputs", type=Path)
    parser.add_argument("--api-domain", required=True)
    parser.add_argument("--acme-email", required=True)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    config, env, build_env = render(json.loads(args.outputs.read_text()), args.api_domain, args.acme_email)
    args.directory.mkdir(parents=True, exist_ok=True)
    secret_dir = args.directory / "secrets"
    secret_dir.mkdir(mode=0o700, exist_ok=True)
    paths = [secret_dir / "application.json", args.directory / ".env", args.directory / "dashboard.env"]
    if any(path.exists() for path in paths):
        parser.error("Configuration already exists; review and remove the generated files before regenerating")
    write_new(paths[0], json.dumps(config, indent=2) + "\n")
    write_new(paths[1], env)
    write_new(paths[2], build_env)
    print("Wrote application.json, .env, and dashboard.env. Credentials remain to be configured.")


if __name__ == "__main__":
    main()
