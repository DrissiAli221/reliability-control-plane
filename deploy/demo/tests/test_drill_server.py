"""Actual HTTP responses, expiry and region-header rollout safety."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.request
import urllib.error

DEMO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('drill_server', DEMO / 'scripts/drill-server.py')
responder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(responder)


class DrillServer(unittest.TestCase):
    def test_modes_region_rollout_and_expiry(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            state = {'start': 1000, 'end': 100_000, 'delayMs': 3000, 'failedRegion': 'eu-west-1'}
            def result(mode, region=None, now=2000):
                (directory / 'state.json').write_text(json.dumps(state | {'mode': mode}))
                return responder.response(directory, region, now)
            for mode in ['outage', 'blip']:
                self.assertEqual(result(mode)[0], 404)
                self.assertEqual(result(mode, now=100_000)[0], 200)
            self.assertEqual(result('slow')[::2], (200, 3))
            self.assertEqual(result('slow', now=99_000)[::2], (200, 1))
            self.assertEqual(result('regional', 'eu-west-1')[0], 503)
            for region in [None, '', 'us-east-1', 'unknown', 'eu-west-1,us-east-1']:
                self.assertEqual(result('regional', region)[0], 200)
            self.assertEqual(result('regional', 'eu-west-1', now=100_000)[0], 200)
            for invalid in ['{', '[]', '{}', '{"mode":"outage","start":0,"end":999999999}']:
                (directory / 'state.json').write_text(invalid)
                self.assertEqual(responder.response(directory, 'eu-west-1', 2000)[0], 200)

    def test_real_http_delay_and_head_and_other_routes(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            server = responder.Server(('127.0.0.1', 0), directory)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                now = int(time.time() * 1000)
                (directory / 'state.json').write_text(json.dumps({'mode': 'slow', 'start': now, 'end': now + 60_000, 'delayMs': 2000}))
                before = time.monotonic()
                with urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}/drill/status.html', timeout=5) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                    self.assertIn(b'healthy', response.read())
                self.assertTrue(1.9 < time.monotonic() - before < 5)
                (directory / 'state.json').write_text('{"mode":"healthy"}')
                (directory / 'status.html').write_text('healthy')
                request = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/drill/status.html', method='HEAD')
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.read(), b'')
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(f'http://127.0.0.1:{server.server_port}/other')
                self.assertEqual(error.exception.code, 404)
                error.exception.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
