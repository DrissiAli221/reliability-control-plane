import json
from pathlib import Path
import shutil
import subprocess
import unittest

REPO = Path(__file__).resolve().parents[3]


class SpaRouting(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for CloudFront function verification")
    def test_routes_rewrite_and_missing_assets_keep_errors(self):
        script = '''const fs = require('fs'), vm = require('vm');
const context = {}; vm.createContext(context);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), context);
const uris = ['/', '/auth/callback', '/monitors/123', '/public/status.with.dots', '/unknown-route', '/assets/missing.js', '/favicon.svg'];
console.log(JSON.stringify(uris.map(uri => context.handler({request: {uri, querystring: {code: {value: 'fake'}}}}))));'''
        result = subprocess.run(["node", "-e", script, str(REPO / "infra/aws-demo/spa.js")], capture_output=True, text=True, check=True)
        requests = json.loads(result.stdout)
        self.assertEqual([r["uri"] for r in requests], ["/index.html"] * 5 + ["/assets/missing.js", "/favicon.svg"])
        self.assertTrue(all(r["querystring"]["code"]["value"] == "fake" for r in requests))
