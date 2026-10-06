"""Exercise public health routing against the shipped Caddyfile, without Docker."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

DEMO = Path(__file__).resolve().parent.parent
CADDY = os.environ.get("CADDY_BINARY") or shutil.which("caddy")


class Api(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(401)
        self.end_headers()
        self.wfile.write(b"Authentication required")
    do_POST = do_GET
    do_HEAD = do_GET
    def log_message(self, *args):
        pass


class Management(BaseHTTPRequestHandler):
    status = 200
    requests = []
    def do_GET(self):
        self.requests.append((self.path, dict(self.headers)))
        self.send_response(self.status)
        self.send_header("X-Private", "private-information")
        self.send_header("Set-Cookie", "private-cookie=secret")
        self.end_headers()
        self.wfile.write(b'{"status":"UP","components":{"db":{"details":"private-db-error"}}}')
    def log_message(self, *args):
        pass


@unittest.skipUnless(CADDY, "Set CADDY_BINARY to exercise the real Caddy health route")
class PublicReadiness(unittest.TestCase):
    def test_sanitizes_responses_and_connection_errors_without_exposing_management(self):
        api = ThreadingHTTPServer(("127.0.0.1", 0), Api)
        management = ThreadingHTTPServer(("127.0.0.1", 0), Management)
        Management.requests = []
        Management.status = 200
        threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in [api, management]]
        for thread in threads:
            thread.start()
        management_closed = False
        api_closed = False
        try:
            with tempfile.TemporaryDirectory(prefix="rcp-healthz-caddy-") as temporary:
                directory = Path(temporary)
                with socket.socket() as listener:
                    listener.bind(("127.0.0.1", 0))
                    port = listener.getsockname()[1]
                config = directory / "Caddyfile"
                config.write_text((DEMO / "Caddyfile").read_text()
                                  .replace("control-plane:8080", f"127.0.0.1:{api.server_port}")
                                  .replace("control-plane:9091", f"127.0.0.1:{management.server_port}"))
                environment = os.environ | {"RCP_API_DOMAIN": f"http://127.0.0.1:{port}",
                                            "ACME_EMAIL": "operator@example.invalid",
                                            "XDG_DATA_HOME": str(directory / "data"),
                                            "XDG_CONFIG_HOME": str(directory / "config")}
                subprocess.run([CADDY, "validate", "--config", str(config)], env=environment, capture_output=True, check=True)
                with (directory / "log").open("w") as log:
                    process = subprocess.Popen([CADDY, "run", "--config", str(config)], env=environment, stdout=log, stderr=log)
                    try:
                        deadline = time.monotonic() + 5
                        while True:
                            try:
                                with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                                    break
                            except OSError:
                                if process.poll() is not None or time.monotonic() >= deadline:
                                    self.fail((directory / "log").read_text())
                                time.sleep(0.02)
                        def request(path, method="GET"):
                            req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                headers={"Authorization": "Bearer private-client-token", "Cookie": "private-session"})
                            try:
                                response = urllib.request.urlopen(req, timeout=5)
                            except urllib.error.HTTPError as error:
                                response = error
                            with response:
                                return response.status, response.headers, response.read()
                        for upstream_status in [200, 503, 401, 500]:
                            Management.status = upstream_status
                            status, headers, body = request("/healthz?show=details")
                            self.assertEqual(status, 200 if upstream_status == 200 else 503)
                            self.assertEqual(body, b"UP" if upstream_status == 200 else b"DOWN")
                            self.assertEqual(headers.get("Cache-Control"), "no-store")
                            self.assertIsNone(headers.get("X-Private"))
                            self.assertIsNone(headers.get("Set-Cookie"))
                            path, incoming = Management.requests[-1]
                            self.assertEqual(path, "/actuator/health/readiness")
                            self.assertNotIn("Authorization", incoming)
                            self.assertNotIn("Cookie", incoming)
                        for path in ["/actuator", "/actuator/prometheus", "/actuator/health/readiness"]:
                            self.assertEqual(request(path)[0], 404)
                        self.assertEqual(request("/api/monitors")[0], 401)
                        self.assertEqual(request("/healthz", "POST")[0], 401)
                        self.assertEqual(request("/healthz", "HEAD")[0], 401)
                        management.shutdown()
                        management.server_close()
                        management_closed = True
                        status, _, body = request("/healthz")
                        self.assertEqual((status, body), (503, b"DOWN"))
                        api.shutdown()
                        api.server_close()
                        api_closed = True
                        self.assertEqual(request("/api/monitors")[0], 502)
                    finally:
                        process.terminate()
                        process.wait(timeout=5)
        finally:
            if not api_closed:
                api.shutdown()
                api.server_close()
            if not management_closed:
                management.shutdown()
                management.server_close()
            for thread in threads:
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
