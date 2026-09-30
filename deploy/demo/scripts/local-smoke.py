#!/usr/bin/env python3
"""Isolated local deployment smoke test; no AWS calls or public certificates."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid


SOURCE = Path(__file__).resolve().parent.parent
REPO = SOURCE.parent.parent


def command(args, *, cwd=None, env=None, data=None, capture=True):
    result = subprocess.run(args, cwd=cwd, env=env, input=data, text=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    if result.returncode:
        raise RuntimeError(f"Command failed: {' '.join(args)}\n{result.stderr or ''}")
    return result.stdout or ""


def http_status(origin, path):
    try:
        with urllib.request.urlopen(origin + path, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="Rebuild even if the demo image exists")
    args = parser.parse_args()
    exists = subprocess.run(["docker", "image", "inspect", "rcp-control-plane:demo"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if args.build or not exists:
        command(["docker", "build", "-f", "rcp-control-plane/Dockerfile", "-t", "rcp-control-plane:demo", "."],
                cwd=REPO, capture=False)
    with tempfile.TemporaryDirectory(prefix="rcp-demo-smoke-") as directory:
        deploy = Path(directory)
        shutil.copy(SOURCE / "compose.yaml", deploy / "compose.yaml")
        shutil.copy(SOURCE / "Caddyfile", deploy / "Caddyfile")
        shutil.copytree(SOURCE / "scripts", deploy / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        secrets_dir = deploy / "secrets"
        secrets_dir.mkdir(mode=0o700)
        config = {"rcp": {
            "identity": {"issuer-uri": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LOCALONLY",
                         "client-id": "local-only-client", "allowed-origins": "https://dashboard.example.invalid"},
            # Deliberately disabled: dummy AWS credentials cannot reach AWS from this test.
            "runtime": {"enabled": False},
        }}
        values = {"postgres_password": "local-only-test-password",
                  "demo_username": "demo@example.invalid", "demo_password": "Local-only-Demo-Password-123!",
                  "aws_credentials": "[rcp-demo]\naws_access_key_id = offline\naws_secret_access_key = offline\n",
                  "application.json": json.dumps(config)}
        for name, value in values.items():
            path = secrets_dir / name
            path.write_text(value + "\n")
            path.chmod(0o444)  # File binds must be readable by image UID 10001.
        (deploy / ".env").write_text("RCP_API_DOMAIN=http://localhost:8080\nACME_EMAIL=operator@example.invalid\n")
        (deploy / "smoke.yaml").write_text('''services:
  caddy:
    ports: !override
      - "127.0.0.1::8080"
''')
        env = os.environ | {
            "COMPOSE_PROJECT_NAME": "rcp-demo-smoke-" + uuid.uuid4().hex[:10],
            "COMPOSE_FILE": str(deploy / "compose.yaml") + ":" + str(deploy / "smoke.yaml"),
            "RCP_API_DOMAIN": "http://localhost:8080", "ACME_EMAIL": "operator@example.invalid",
            "RCP_CONTROL_PLANE_IMAGE": "rcp-control-plane:demo",
        }
        def compose(*args, data=None):
            return command(["docker", "compose", *args], cwd=deploy, env=env, data=data)
        try:
            compose("config", "--quiet")
            command(["docker", "compose", "up", "-d", "--no-build", "--wait", "--wait-timeout", "180"],
                    cwd=deploy, env=env, capture=False)
            address = compose("port", "caddy", "8080").strip()
            # Caddy's local site expects Host: localhost; mapped port is ephemeral.
            origin = "http://localhost:" + address.rsplit(":", 1)[1]
            assert http_status(origin, "/api/monitors") == 401, "Anonymous API must reject access"
            assert http_status(origin, "/actuator/health/readiness") == 404, "Management endpoint exposed"
            request = urllib.request.Request(origin + "/api/monitors", method="OPTIONS", headers={
                "Origin": "https://dashboard.example.invalid", "Access-Control-Request-Method": "GET"})
            with urllib.request.urlopen(request, timeout=10) as response:
                assert response.headers["Access-Control-Allow-Origin"] == "https://dashboard.example.invalid"
            # A marker proves backup data, not just an empty schema, survives restoration.
            compose("exec", "-T", "postgres", "psql", "-U", "rcp", "-d", "rcp", "-v", "ON_ERROR_STOP=1",
                    data="CREATE TABLE demo_backup_marker (value text NOT NULL); INSERT INTO demo_backup_marker VALUES ('isolated-smoke-marker');\n")
            command(["bash", str(deploy / "scripts/backup.sh")], cwd=deploy, env=env, capture=False)
            archives = list((deploy / "backups").glob("rcp-*.dump"))
            assert len(archives) == 1 and archives[0].stat().st_mode & 0o777 == 0o600
            verification = deploy / "verify-marker.sql"
            verification.write_text("DO $$ BEGIN IF (SELECT value FROM demo_backup_marker) IS DISTINCT FROM 'isolated-smoke-marker' THEN RAISE EXCEPTION 'Backup marker missing'; END IF; END $$;\n")
            command(["bash", str(deploy / "scripts/restore-check.sh"), str(archives[0]), str(verification)], capture=False)
            print("Local smoke PASS: Flyway/health, Caddy routing, anonymous 401, private management, CORS, backup marker and isolated restore.")
        except BaseException:
            print(compose("logs", "--tail", "60"))
            raise
        finally:
            # Only this uniquely named temporary project's volumes are removed.
            compose("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    main()
