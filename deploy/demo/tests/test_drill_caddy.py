"""Run the real Caddy configuration locally without Docker, TLS or AWS."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
import json
import importlib.util
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
spec = importlib.util.spec_from_file_location("drill_server", DEMO / "scripts/drill-server.py")
responder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(responder)
CADDY = os.environ.get("CADDY_BINARY") or shutil.which("caddy")


class Backend(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(401)
        self.end_headers()
        self.wfile.write(b"backend authentication required")

    do_POST = do_GET

    def log_message(self, *args):
        pass


@unittest.skipUnless(CADDY, "Set CADDY_BINARY to run Caddy routing integration")
class CaddyRouting(unittest.TestCase):
    def test_faults_preserve_proxy_and_private_management(self):
        backend = ThreadingHTTPServer(("127.0.0.1", 0), Backend)
        thread = threading.Thread(target=backend.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="rcp-drill-caddy-") as temp:
                directory = Path(temp)
                drill_dir = directory / "drill"
                drill_server = responder.Server(("127.0.0.1", 0), drill_dir)
                drill_thread = threading.Thread(target=drill_server.serve_forever, daemon=True)
                drill_thread.start()
                self.addCleanup(drill_server.server_close)
                self.addCleanup(drill_server.shutdown)
                script = ["python3", str(DEMO / "scripts/outage-drill.py"), "restore", "--directory", str(drill_dir)]
                subprocess.run(script, check=True)
                with socket.socket() as listener:
                    listener.bind(("127.0.0.1", 0))
                    port = listener.getsockname()[1]
                config = directory / "Caddyfile"
                config.write_text((DEMO / "Caddyfile").read_text()
                                  .replace("drill:8080", f"127.0.0.1:{drill_server.server_port}")
                                  .replace("control-plane:8080", f"127.0.0.1:{backend.server_port}"))
                env = os.environ | {"RCP_API_DOMAIN": f"http://127.0.0.1:{port}",
                                    "ACME_EMAIL": "operator@example.invalid",
                                    "XDG_DATA_HOME": str(directory / "data"),
                                    "XDG_CONFIG_HOME": str(directory / "config")}
                subprocess.run([CADDY, "validate", "--config", str(config), "--adapter", "caddyfile"],
                               env=env, capture_output=True, check=True)
                with (directory / "log").open("w") as log:
                    process = subprocess.Popen([CADDY, "run", "--config", str(config)], env=env,
                                               stdout=log, stderr=log)
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
                        def request(path, method="GET", headers=None):
                            req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, method=method, headers=headers or {})
                            try:
                                response = urllib.request.urlopen(req, timeout=5)
                            except urllib.error.HTTPError as error:
                                response = error
                            with response:
                                return response.status, response.headers, response.read()
                        for present in [True, False, True]:
                            if present:
                                subprocess.run(script, check=True)
                            else:
                                (drill_dir / "status.html").unlink()
                            status, headers, body = request("/drill/status.html")
                            self.assertEqual(status, 200 if present else 404)
                            self.assertEqual(headers.get("Cache-Control"), "no-store")
                            self.assertEqual(request("/api/monitors")[0], 401)
                            self.assertEqual(request("/actuator")[0], 404)
                            self.assertEqual(request("/actuator/health/readiness")[0], 404)
                        for mode in ["outage", "regional", "slow", "blip"]:
                            now = int(time.time() * 1000)
                            state = {"mode": mode, "start": now, "end": now + 60_000,
                                     "failedRegion": "eu-west-1", "delayMs": 2000}
                            (drill_dir / "state.json").write_text(json.dumps(state))
                            expected = 404 if mode in ["outage", "blip"] else 200
                            self.assertEqual(request("/drill/status.html")[0], expected)
                            if mode == "regional":
                                self.assertEqual(request("/drill/status.html", headers={"X-RCP-Probe-Region": "eu-west-1"})[0], 503)
                                self.assertEqual(request("/drill/status.html", headers={"X-RCP-Probe-Region": "us-east-1"})[0], 200)
                            self.assertEqual(request("/api/monitors")[0], 401)
                            self.assertEqual(request("/actuator/prometheus")[0], 404)
                        subprocess.run(script, check=True)
                        self.assertEqual(request("/drill/status.html", "HEAD")[0], 200)
                        self.assertEqual(request("/drill/status.html", "POST")[0], 401)
                        self.assertEqual(request("/drill/other.html")[0], 401)
                    finally:
                        process.terminate()
                        process.wait(timeout=5)
        finally:
            backend.shutdown()
            backend.server_close()
            thread.join(timeout=5)


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required")
class DrillCompose(unittest.TestCase):

    def test_compose_is_private_bounded_and_does_not_mount_credentials(self):
        environment = os.environ | {'RCP_API_DOMAIN': 'api.example.invalid', 'ACME_EMAIL': 'operator@example.invalid'}
        result = subprocess.run(['docker', 'compose', '--env-file', os.devnull, '-f', str(DEMO / 'compose.yaml'),
                                 'config', '--format', 'json'], env=environment, capture_output=True, text=True, check=True)
        config = json.loads(result.stdout)
        drill = config['services']['drill']
        self.assertEqual(drill['user'], '65534:65534')
        self.assertTrue(drill['read_only'])
        self.assertIn('ALL', drill['cap_drop'])
        self.assertFalse(drill.get('ports'))
        self.assertFalse(drill.get('secrets'))
        self.assertLessEqual(int(drill['mem_limit']), 64 * 1024 * 1024)
        self.assertEqual(drill['pids_limit'], 32)
        self.assertEqual(set(drill['networks']), {'drill'})
        self.assertTrue(config['networks']['drill']['internal'])
        self.assertTrue(all(volume['read_only'] for volume in drill['volumes']))
        self.assertEqual({volume['target'] for volume in drill['volumes']}, {'/opt/drill', '/srv/drill'})
        self.assertIn('drill', config['services']['caddy']['networks'])


if __name__ == "__main__":
    unittest.main()
