#!/usr/bin/env python3
"""Isolated local deployment smoke test; no AWS calls or public certificates."""
import argparse
import base64
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


def request_json(origin, path, method="GET", body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else (b"" if method == "POST" else None)
    request = urllib.request.Request(origin + path, method=method, data=data, headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None


def verify_phase2(origin):
    status, session = request_json(origin, "/api/demo/session", "POST")
    assert status == 200, "Local demo session failed"
    assert "refreshToken" not in session, "Demo response must not expose refresh tokens"
    token = session["accessToken"]
    status, identity = request_json(origin, "/api/me", token=token)
    assert status == 200 and identity["readOnly"] is True
    assert identity["subject"] == "11111111-2222-3333-4444-555555555555", "Seeding must use the token's subject"
    assert identity["limits"] == {"maxPerOwner": 3, "maxTotal": 8, "minIntervalSeconds": 60, "maxTimeoutMs": 5000}
    status, monitors = request_json(origin, "/api/monitors", token=token)
    assert status == 200 and {m["name"] for m in monitors} == {"Example Domain", "Wikipedia", "Scheduled outage drill"}
    details = [request_json(origin, "/api/monitors/" + m["id"], token=token)[1] for m in monitors]
    assert all(m["checkIntervalSeconds"] == 60 and m["timeoutMs"] <= 5000 for m in details)
    create = {"name": "Forbidden write", "targetUrl": "https://example.com", "checkIntervalSeconds": 60, "timeoutMs": 5000}
    assert request_json(origin, "/api/monitors", "POST", create, token)[0] == 403
    assert request_json(origin, "/api/onboarding", "POST", token=token)[0] == 403
    status, developer = request_json(origin, "/local/token?subject=isolated-smoke-owner", "POST")
    assert status == 200
    developer_token = developer["accessToken"]
    assert request_json(origin, "/api/me", token=developer_token)[1]["readOnly"] is False
    assert request_json(origin, "/api/monitors", "POST", create | {"checkIntervalSeconds": 30}, developer_token)[0] == 400
    assert request_json(origin, "/api/monitors", "POST", create | {"timeoutMs": 5001}, developer_token)[0] == 400
    assert request_json(origin, "/api/onboarding", "POST", token=developer_token)[0] == 201
    assert request_json(origin, "/api/onboarding", "POST", token=developer_token)[0] == 204
    assert len(request_json(origin, "/api/monitors", token=developer_token)[1]) == 1
    print("Phase 2 contract PASS: seeded subject, read-only writes, 60-second/5-second limits, one-time onboarding.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="Rebuild even if the demo image exists")
    parser.add_argument("--image", default="rcp-control-plane:demo", help="Image tag to build/test")
    parser.add_argument("--source-directory", type=Path, default=REPO, help="Immutable application snapshot to build")
    parser.add_argument("--phase2", action="store_true", help="Verify demo access/limits with local JWTs and AWS polling disabled")
    args = parser.parse_args()
    exists = subprocess.run(["docker", "image", "inspect", args.image],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if args.build or not exists:
        command(["docker", "build", "-f", "rcp-control-plane/Dockerfile", "-t", args.image, "."],
                cwd=args.source_directory, capture=False)
    with tempfile.TemporaryDirectory(prefix="rcp-demo-smoke-") as directory:
        deploy = Path(directory)
        shutil.copy(SOURCE / "compose.yaml", deploy / "compose.yaml")
        shutil.copy(SOURCE / "Caddyfile", deploy / "Caddyfile")
        shutil.copytree(SOURCE / "scripts", deploy / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        command(["python3", str(deploy / "scripts/outage-drill.py"), "restore"])
        secrets_dir = deploy / "secrets"
        secrets_dir.mkdir(mode=0o700)
        config = {"rcp": {
            "identity": {"issuer-uri": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_LOCALONLY",
                         "client-id": "local-only-client", "allowed-origins": "https://dashboard.example.invalid"},
            # Deliberately disabled: dummy AWS credentials cannot reach AWS from this test.
            "runtime": {"enabled": False},
        }}
        if args.phase2:
            config["rcp"].update({
                "monitors": {"max-per-owner": 3, "max-total": 8, "min-interval-seconds": 60, "max-timeout-ms": 5000},
                "local-worker": {"enabled": False},
                "demo": {"monitors": "Example Domain|https://example.com, Wikipedia|https://www.wikipedia.org, Scheduled outage drill|https://rcp-ali.duckdns.org/drill/status.html",
                         "example-monitor-url": "https://example.com"},
            })
            config["rcp"]["identity"]["read-only-group"] = "demo"
        values = {"postgres_password": "local-only-test-password",
                  "demo_username": "demo@example.invalid", "demo_password": "Local-only-Demo-Password-123!",
                  "demo_owner_subject": "11111111-2222-3333-4444-555555555555",
                  "aws_credentials": "[rcp-demo]\naws_access_key_id = offline\naws_secret_access_key = offline\n",
                  "application.json": json.dumps(config)}
        for name, value in values.items():
            path = secrets_dir / name
            path.write_text(value + "\n")
            path.chmod(0o444)  # File binds must be readable by image UID 10001.
        (deploy / ".env").write_text("RCP_API_DOMAIN=http://localhost:8080\nACME_EMAIL=operator@example.invalid\n")
        phase_override = ""
        if args.phase2:
            local_key = base64.b64encode(os.urandom(32)).decode()
            phase_override = f"  control-plane:\n    environment:\n      SPRING_PROFILES_ACTIVE: local\n      RCP_LOCAL_JWT_SECRET: {local_key}\n"
        (deploy / "smoke.yaml").write_text("services:\n" + phase_override + '''
  caddy:
    ports: !override
      - "127.0.0.1::8080"
''')
        env = os.environ | {
            "COMPOSE_PROJECT_NAME": "rcp-demo-smoke-" + uuid.uuid4().hex[:10],
            "COMPOSE_FILE": str(deploy / "compose.yaml") + ":" + str(deploy / "smoke.yaml"),
            "RCP_API_DOMAIN": "http://localhost:8080", "ACME_EMAIL": "operator@example.invalid",
            "RCP_CONTROL_PLANE_IMAGE": args.image,
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
            assert http_status(origin, "/drill/status.html") == 200
            (deploy / "drill/status.html").unlink()
            assert http_status(origin, "/drill/status.html") == 404
            command(["python3", str(deploy / "scripts/outage-drill.py"), "restore"])
            assert http_status(origin, "/drill/status.html") == 200
            if args.phase2:
                verify_phase2(origin)
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
