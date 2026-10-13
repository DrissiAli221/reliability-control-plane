import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "cost-estimate.py"
spec = importlib.util.spec_from_file_location("cost_estimate", SCRIPT)
cost = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cost)


class CostEstimate(unittest.TestCase):
    def test_covers_the_global_cap_and_rejects_beyond_it(self):
        self.assertEqual(cost.MAX_MONITORS, 45)
        self.assertEqual(cost.estimate(45, 0.5)["monitors"], 45)
        with self.assertRaises(ValueError):
            cost.estimate(46, 0.5)

    def test_cost_grows_with_monitors_and_duration(self):
        self.assertGreater(cost.estimate(30, 5)["subtotal_usd"], cost.estimate(8, 5)["subtotal_usd"])
        self.assertGreater(cost.estimate(30, 5)["subtotal_usd"], cost.estimate(30, 0.5)["subtotal_usd"])

    def test_states_what_is_and_is_not_included(self):
        result = cost.estimate(30, 0.5)
        self.assertIn("Lambda requests", result["included"])
        self.assertIn("Lambda GB-seconds", result["included"])
        self.assertTrue(any("SQS" in item for item in result["included"]))
        missing = " ".join(result["not_modelled"])
        for name in ("CloudWatch Logs", "cross-region data transfer", "S3", "CloudFront", "Cognito"):
            self.assertIn(name, missing)
        self.assertIn("not a ceiling", result["note"])
        self.assertEqual(result["assumptions"]["average_billed_duration_ms"], 500)

    def run_cli(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)

    def test_duration_ms_flag_is_an_input_with_a_printed_default(self):
        default = json.loads(self.run_cli("--monitors", "30").stdout)
        self.assertEqual(default["assumptions"]["average_billed_duration_ms"], 500)
        slow = json.loads(self.run_cli("--monitors", "30", "--duration-ms", "5000", "--retry-percent", "10").stdout)
        self.assertEqual(slow["assumptions"]["average_billed_duration_ms"], 5000)
        self.assertEqual(slow["assumptions"]["retry_percent"], 10)
        self.assertGreater(slow["subtotal_usd"], default["subtotal_usd"])
        self.assertEqual(json.loads(self.run_cli("--monitors", "8", "--seconds", "5").stdout)["assumptions"]["average_billed_duration_ms"], 5000)

    def test_cli_refuses_more_than_the_cap(self):
        self.assertNotEqual(self.run_cli("--monitors", "46").returncode, 0)


if __name__ == "__main__":
    unittest.main()
