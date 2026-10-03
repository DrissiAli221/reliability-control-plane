"""Exercise deployment guardrails by mutating a real offline Terraform plan."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check_plan import check


class PlanGuardrails(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = json.loads(Path(os.environ["RCP_ORACLE_TEST_PLAN"]).read_text())

    def setUp(self):
        self.plan = copy.deepcopy(self.baseline)

    def values(self, resource_type):
        return next(r["values"] for r in self.plan["planned_values"]["root_module"]["resources"]
                    if r["type"] == resource_type)

    def reject(self):
        with self.assertRaises(ValueError):
            check(self.plan, offline=True)

    def test_default_plan(self):
        check(self.plan, offline=True)

    def test_offline_plan_not_accepted_for_deployment(self):
        with self.assertRaises(ValueError):
            check(self.plan)

    def test_world_open_ssh(self):
        rules = self.values("oci_core_security_list")["ingress_security_rules"]
        next(r for r in rules if r["protocol"] == "6" and r["tcp_options"][0]["min"] == 22)["source"] = "0.0.0.0/0"
        self.reject()

    def test_public_database_port(self):
        rules = self.values("oci_core_security_list")["ingress_security_rules"]
        rule = next(r for r in rules if r["protocol"] == "6" and r["tcp_options"][0]["min"] == 80)
        rule["tcp_options"] = [{"min": 5432, "max": 5432}]
        self.reject()

    def test_unconfigured_ipv6_firewall(self):
        self.values("oci_core_vcn")["is_ipv6enabled"] = True
        self.reject()

    def test_excess_cpu_and_memory(self):
        shape = self.values("oci_core_instance")["shape_config"][0]
        shape.update(ocpus=4, memory_in_gbs=24)
        self.reject()

    def test_extra_paid_resource(self):
        self.plan["planned_values"]["root_module"]["resources"].append(
            {"mode": "managed", "type": "oci_core_nat_gateway", "values": {}})
        self.reject()

    def test_extra_resources_in_child_module(self):
        self.plan["planned_values"]["root_module"]["child_modules"] = [
            {"address": "module.extra", "resources": []}]
        self.reject()

    def test_excess_disk(self):
        self.values("oci_core_instance")["source_details"][0]["boot_volume_size_in_gbs"] = 250
        self.reject()

    def test_volume_not_preserved(self):
        self.values("oci_core_instance")["preserve_boot_volume"] = False
        self.reject()

    def test_secret_in_metadata(self):
        self.values("oci_core_instance")["metadata"]["password"] = "must-not-be-here"
        self.reject()

    def test_instance_replacement(self):
        next(c for c in self.plan["resource_changes"] if c["type"] == "oci_core_instance")["change"]["actions"] = ["delete", "create"]
        self.reject()


if __name__ == "__main__":
    unittest.main()
