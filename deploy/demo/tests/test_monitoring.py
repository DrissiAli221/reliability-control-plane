"""Credential isolation, native Alloy validation and actual PromQL rule evaluation."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

DEMO = Path(__file__).resolve().parent.parent
MONITORING = DEMO / "monitoring"
spec = importlib.util.spec_from_file_location("demo_grafana", DEMO / "scripts/grafana.py")
grafana = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grafana)
ALLOY = os.environ.get("ALLOY_BINARY") or shutil.which("alloy")
PROMTOOL = os.environ.get("PROMTOOL_BINARY") or shutil.which("promtool")
DOCKER = shutil.which("docker")


@unittest.skipUnless(DOCKER, "Docker Compose CLI is needed; a running daemon is not")
class ComposeContract(unittest.TestCase):
    def test_monitoring_stays_private_unprivileged_and_memory_bounded(self):
        environment = os.environ | {"RCP_API_DOMAIN": "api.example.invalid", "ACME_EMAIL": "operator@example.invalid",
                                    "GRAFANA_METRICS_URL": "https://example.invalid/api/prom/push", "GRAFANA_METRICS_USERNAME": "12345"}
        result = subprocess.run([DOCKER, "compose", "--env-file", os.devnull, "-f", str(DEMO / "compose.yaml"),
                                 "--profile", "monitoring", "config", "--format", "json"],
                                env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        config = json.loads(result.stdout)
        services = config["services"]
        self.assertEqual(services["control-plane"]["environment"]["MANAGEMENT_SERVER_PORT"], "9091")
        self.assertIn("127.0.0.1/9091", services["control-plane"]["healthcheck"]["test"][-1])
        for name, service in services.items():
            if name != "caddy":
                self.assertFalse(service.get("ports"), name)
        self.assertEqual({port["target"] for port in services["caddy"]["ports"]}, {80, 443})
        alloy = services["alloy"]
        self.assertEqual(alloy["user"], "473:473")
        self.assertLessEqual(int(alloy["mem_limit"]), 384 * 1024 * 1024)
        self.assertFalse(alloy.get("privileged", False))
        self.assertTrue(alloy["read_only"])
        self.assertIn("ALL", alloy["cap_drop"])
        self.assertEqual([secret["source"] for secret in alloy["secrets"]], ["grafana_metrics_token"])
        self.assertNotIn("TOKEN", json.dumps(alloy["environment"]))
        mounts = {mount["target"]: mount for mount in alloy["volumes"]}
        for target in ["/host/proc", "/host/sys", "/host/root"]:
            self.assertTrue(mounts[target]["read_only"])
        self.assertFalse(any("docker.sock" in mount["source"] for mount in alloy["volumes"]))


class PrivateTokens(unittest.TestCase):
    def test_private_creation_refuses_overwrite_and_insecure_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "token"
            grafana.write_token(path, "fake-test-token")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(grafana.read_token(path), "fake-test-token")
            with self.assertRaises(FileExistsError):
                grafana.write_token(path, "replacement")
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                grafana.read_token(path)
            for token in ["", "two lines\nsecret", "space separated"]:
                with self.assertRaises(ValueError):
                    grafana.write_token(Path(directory) / "invalid", token)

    def test_terraform_receives_secrets_only_in_environment_and_debug_logging_is_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            files = [Path(directory) / name for name in ["grafana", "sm"]]
            for file in files:
                grafana.write_token(file, "fake-" + file.name)
            argv = ["grafana.py", "terraform", "--grafana-token-file", str(files[0]),
                    "--sm-token-file", str(files[1]), "--", "plan", "-input=false"]
            with patch("sys.argv", argv), patch.dict(os.environ, {"TF_LOG": "TRACE"}), patch.object(subprocess, "call", return_value=0) as call:
                self.assertEqual(grafana.main(), 0)
            args, kwargs = call.call_args
            self.assertEqual(args[0], ["terraform", "plan", "-input=false"])
            self.assertEqual(kwargs["env"]["GRAFANA_AUTH"], "fake-grafana")
            self.assertEqual(kwargs["env"]["GRAFANA_SM_ACCESS_TOKEN"], "fake-sm")
            self.assertNotIn("TF_LOG", kwargs["env"])


@unittest.skipUnless(ALLOY, "Set ALLOY_BINARY for native config validation")
class AlloyConfiguration(unittest.TestCase):
    def test_real_config_validates_with_a_fake_file_secret(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            token = directory / "token"
            grafana.write_token(token, "offline-fake-token")
            config = directory / "config.alloy"
            config.write_text((MONITORING / "config.alloy").read_text().replace(
                "/run/secrets/grafana_metrics_token", str(token)))
            environment = os.environ | {"GRAFANA_METRICS_URL": "https://example.invalid/api/prom/push",
                                        "GRAFANA_METRICS_USERNAME": "12345"}
            result = subprocess.run([ALLOY, "validate", str(config)], env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


@unittest.skipUnless(PROMTOOL, "Set PROMTOOL_BINARY to evaluate alert rules")
class AlertEvaluation(unittest.TestCase):
    def test_pipeline_grace_period_disabled_monitors_resets_failures_and_missing_telemetry(self):
        alerts = json.loads((MONITORING / "alerts.json").read_text())
        # Grafana's B stage fires only above zero; Prometheus alerts otherwise
        # fire for any returned series, including a healthy boolean value of 0.
        rules = [{"alert": alert["uid"], "expr": "(" + alert["expr"] + ") > 0", "for": alert["for"]} for alert in alerts]
        suffix = '{job="rcp-app",project="rcp",environment="demo"}'
        baseline = {
            "rcp_probe_results_stored_total": "0+2x10",
            "rcp_system_monitors_enabled": "3+0x10",
            "up": "1+0x10",
            "process_start_time_seconds": "-1000+0x10",
            "rcp_system_metrics_last_success_epoch_seconds": "0+60x10",
        }
        tests = []
        def case(name, changes, pipeline=False, telemetry=False):
            values = baseline | changes
            series = [{"series": metric + suffix, "values": value} for metric, value in values.items() if value is not None]
            tests.append({"name": name, "interval": "1m", "input_series": series,
                "alert_rule_test": [
                    {"eval_time": "10m", "alertname": "rcp-pipeline-stuck", "exp_alerts": [{"exp_labels": {}, "exp_annotations": {}}] if pipeline else []},
                    {"eval_time": "10m", "alertname": "rcp-telemetry-missing", "exp_alerts": [{"exp_labels": {}, "exp_annotations": {}}] if telemetry else []}]})
        case("healthy pipeline", {})
        case("stalled counter", {"rcp_probe_results_stored_total": "0+0x10"}, pipeline=True)
        case("disabled monitors", {"rcp_probe_results_stored_total": "0+0x10", "rcp_system_monitors_enabled": "0+0x10"})
        case("new process", {"rcp_probe_results_stored_total": "0+0x10", "process_start_time_seconds": "420+0x10"})
        case("counter resets but ingestion continues", {"rcp_probe_results_stored_total": "20 22 24 26 28 30 0 2 4 6 8"})
        case("scrape fails", {"up": "0+0x10", "rcp_probe_results_stored_total": "0+0x10"}, telemetry=True)
        case("expected counter is missing", {"rcp_probe_results_stored_total": None}, telemetry=True)
        case("enabled monitor gauge is missing", {"rcp_system_monitors_enabled": None}, telemetry=True)
        case("process timestamp is missing", {"process_start_time_seconds": None}, telemetry=True)
        case("database snapshot stale", {"rcp_system_metrics_last_success_epoch_seconds": "0+0x10", "rcp_probe_results_stored_total": "0+0x10"}, telemetry=True)
        tests.append({"name": "VM and Alloy disappear", "interval": "1m", "input_series": [],
                      "alert_rule_test": [{"eval_time": "10m", "alertname": "rcp-telemetry-missing", "exp_alerts": [{"exp_labels": {}, "exp_annotations": {}}]}]})
        for job, name in [("rcp-dashboard", "rcp-dashboard-unavailable"), ("rcp-api", "rcp-api-unavailable")]:
            for values, firing in [("0+0x10", True), ("0+0x4 1+0x5", False)]:
                tests.append({"name": job + (" failure" if firing else " recovery"), "interval": "1m", "input_series": [
                    {"series": f'probe_success{{job="{job}",project="rcp",environment="demo",probe="Frankfurt"}}', "values": values},
                    {"series": f'probe_success{{job="{job}",project="rcp",environment="demo",probe="Ohio"}}', "values": "1+0x10"}],
                    "alert_rule_test": [{"eval_time": "10m", "alertname": name, "exp_alerts": [{"exp_labels": {}, "exp_annotations": {}}] if firing else []}]})
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            # JSON is valid YAML; no extra Python dependency is needed.
            rule_file = directory / "rules.json"
            rule_file.write_text(json.dumps({"groups": [{"name": "rcp", "rules": rules}]}))
            test_file = directory / "tests.json"
            test_file.write_text(json.dumps({"rule_files": [str(rule_file)], "evaluation_interval": "1m", "tests": tests}))
            result = subprocess.run([PROMTOOL, "test", "rules", str(test_file)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
