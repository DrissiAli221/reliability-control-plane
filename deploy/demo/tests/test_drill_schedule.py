"""Cross-language schedule vectors, bounds and recovery semantics."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

DEMO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DEMO / 'scripts'))
from drill_schedule import plan, active_plan, CYCLE_MS
spec = importlib.util.spec_from_file_location('outage_drill', DEMO / 'scripts/outage-drill.py')
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)


class Schedule(unittest.TestCase):
    def test_shared_vectors(self):
        vectors = json.loads((DEMO / 'fixtures/drill-schedule-v1.json').read_text())
        for expected in vectors:
            self.assertEqual(plan(expected['cycleStart']), expected)
        self.assertEqual({v['mode'] for v in vectors}, {'outage', 'slow', 'regional', 'blip'})
        self.assertTrue(any(v['skipped'] for v in vectors))

    def test_bounds_diversity_and_skip_rate(self):
        plans = [plan(i * CYCLE_MS) for i in range(10_000)]
        self.assertTrue(0.23 < sum(p['skipped'] for p in plans) / len(plans) < 0.27)
        for p in plans:
            duration = p['end'] - p['start']
            self.assertTrue(p['cycleStart'] < p['start'] < p['end'] < p['cycleStart'] + CYCLE_MS)
            self.assertTrue(2000 <= p['delayMs'] <= 3500)
            self.assertTrue(15_000 <= duration <= 40_000 if p['mode'] == 'blip' else 240_000 <= duration <= 1_200_000)
        with self.assertRaises(ValueError):
            plan(1)

    def test_timer_waits_for_window_and_never_replays_or_extends_it(self):
        p = next(plan(i * CYCLE_MS) for i in range(100) if not plan(i * CYCLE_MS)['skipped'])
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            drill.run(directory, 'restore', now=lambda: (p['start'] - 1000) / 1000)
            drill.run(directory, 'scheduled', now=lambda: (p['start'] - 1000) / 1000, sleep=lambda _: self.fail('Too early'))
            sleeps = []
            def during(seconds):
                sleeps.append(seconds)
                self.assertEqual(json.loads((directory / 'state.json').read_text()), p)
            # Late timer starts consume only the remaining window, never a fresh full duration.
            drill.run(directory, 'scheduled', now=lambda: (p['start'] + 3000) / 1000, sleep=during)
            self.assertEqual(sleeps, [(p['end'] - p['start'] - 3000) / 1000])
            self.assertEqual(json.loads((directory / 'state.json').read_text())['mode'], 'healthy')
            drill.run(directory, 'scheduled', now=lambda: (p['start'] + 4000) / 1000, sleep=lambda _: self.fail('Replayed'))
            self.assertIsNone(active_plan(p['end']))

    def test_boot_or_manual_restore_suppresses_interrupted_window(self):
        p = next(plan(i * CYCLE_MS) for i in range(100) if not plan(i * CYCLE_MS)['skipped'])
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            drill.run(directory, 'restore', now=lambda: p['start'] / 1000)
            drill.run(directory, 'scheduled', now=lambda: (p['start'] + 1000) / 1000, sleep=lambda _: self.fail('Replayed on reboot'))
            self.assertTrue((directory / 'status.html').exists())

    def test_skipped_cycle_never_starts(self):
        p = next(plan(i * CYCLE_MS) for i in range(100) if plan(i * CYCLE_MS)['skipped'])
        with tempfile.TemporaryDirectory() as temp:
            drill.run(Path(temp), 'scheduled', now=lambda: p['start'] / 1000, sleep=lambda _: self.fail('Skipped cycle'))
            self.assertFalse((Path(temp) / 'state.json').exists())
