"""Existing config updates preserve private data and refuse unsafe/quota changes."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

DEMO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('configure_variety', DEMO / 'scripts/configure-variety.py')
variety = importlib.util.module_from_spec(spec)
spec.loader.exec_module(variety)


class ConfigureVariety(unittest.TestCase):
    def test_private_idempotent_update_preserves_identity_and_existing_monitors(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'application.json'
            config = {'rcp': {'monitors': {'max-per-owner': 3, 'max-total': 8, 'min-interval-seconds': 60, 'max-timeout-ms': 5000},
                      'demo': {'monitors': 'Example Domain|https://example.com, Wikipedia|https://www.wikipedia.org, Scheduled outage drill|https://api.example.invalid/drill/status.html'},
                      'identity': {'client-id': 'preserve'}, 'private': {'password': 'fake-password'}}}
            path.write_text(json.dumps(config)); path.chmod(0o600)
            variety.update(path)
            variety.update(path)
            actual = json.loads(path.read_text())
            self.assertEqual(actual['rcp']['identity'], config['rcp']['identity'])
            self.assertEqual(actual['rcp']['private'], config['rcp']['private'])
            self.assertEqual(actual['rcp']['monitors']['max-per-owner'], 5)
            self.assertEqual(actual['rcp']['monitors']['max-total'], 8)
            self.assertEqual(len(actual['rcp']['demo']['monitors'].split(',')), 5)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(Path(temp).iterdir()), [path])

    def test_rejects_insecure_file_and_drift_without_overwriting(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'config'
            path.write_text('{}'); path.chmod(0o644)
            with self.assertRaises(ValueError): variety.update(path)
            path.chmod(0o600)
            with self.assertRaises(KeyError): variety.update(path)
            self.assertEqual(path.read_text(), '{}')
            link = Path(temp) / 'link'; link.symlink_to(path)
            with self.assertRaises(ValueError): variety.update(link)

    def test_rejects_unapproved_limits_and_too_many_targets_atomically(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'application.json'
            base = {'rcp': {'monitors': {'max-per-owner': 3, 'max-total': 8, 'min-interval-seconds': 60, 'max-timeout-ms': 5000},
                            'demo': {'monitors': 'Example Domain|https://example.com'}}}
            for change in [{'max-total': 9}, {'max-per-owner': 6}, {'min-interval-seconds': 30}, {'max-timeout-ms': 10000}]:
                config = json.loads(json.dumps(base))
                config['rcp']['monitors'].update(change)
                before = json.dumps(config)
                path.write_text(before); path.chmod(0o600)
                with self.assertRaises(ValueError): variety.update(path)
                self.assertEqual(path.read_text(), before)
            config = json.loads(json.dumps(base))
            config['rcp']['demo']['monitors'] = ', '.join(f'Target {i}|https://example.com/{i}' for i in range(4))
            before = json.dumps(config)
            path.write_text(before)
            with self.assertRaises(ValueError): variety.update(path)
            self.assertEqual(path.read_text(), before)
