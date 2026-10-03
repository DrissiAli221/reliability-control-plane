#!/usr/bin/env python3
"""Reject plans outside the single-server demo's resource and ingress limits."""
import argparse
import base64
import ipaddress
import json
import subprocess
from pathlib import Path

RESOURCE_TYPES = {
    "oci_core_vcn", "oci_core_internet_gateway", "oci_core_route_table",
    "oci_core_security_list", "oci_core_subnet", "oci_core_instance",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check(plan, *, offline=False):
    variables = {key: value["value"] for key, value in plan["variables"].items()}
    require(variables.get("offline_mode", False) == offline,
            "Offline plans require --offline and must never be applied.")
    root = plan["planned_values"]["root_module"]
    require(not root.get("child_modules"), "Additional modules require a separate resource review.")
    resources = [r for r in root["resources"]
                 if r["mode"] == "managed"]
    require(len(resources) == 6 and {r["type"] for r in resources} == RESOURCE_TYPES,
            "Expected exactly one VM and its five networking resources.")
    require(not any(c["change"]["actions"] in (["delete"], ["delete", "create"], ["create", "delete"])
                    for c in plan.get("resource_changes", [])),
            "Deletion or replacement requires a separate recovery review.")
    values = {r["type"]: r["values"] for r in resources}
    vm = values["oci_core_instance"]
    require(vm["shape"] == "VM.Standard.A1.Flex", "Only the ARM A1 Flex shape is allowed.")
    shape = vm["shape_config"][0]
    require(shape["ocpus"] in (1, 2) and 4 <= shape["memory_in_gbs"] <= 12,
            "CPU/RAM exceeds this demo's limits.")
    disk = vm["source_details"][0]
    require(disk["source_type"] == "image" and 50 <= float(disk["boot_volume_size_in_gbs"]) <= 200
            and float(disk["boot_volume_vpus_per_gb"]) == 10, "Use a 50–200 GB Balanced boot disk.")
    require(vm["preserve_boot_volume"] is True, "The boot volume must be preserved.")
    require(vm["create_vnic_details"][0]["assign_public_ip"] in (True, "true"), "A public IPv4 is required.")
    require(values["oci_core_vcn"]["is_ipv6enabled"] is False and
            vm["create_vnic_details"][0]["assign_ipv6ip"] in (False, "false"),
            "IPv6 needs a separate firewall review before enabling it.")
    require(set(vm["metadata"]) == {"ssh_authorized_keys", "user_data"},
            "Only a public SSH key and nonsecret bootstrap belong in metadata.")

    rules = values["oci_core_security_list"]["ingress_security_rules"]
    ssh_sources = set()
    web_ports = set()
    for rule in rules:
        require(rule["source_type"] == "CIDR_BLOCK" and rule["stateless"] is False,
                "Ingress must use stateful CIDR rules.")
        if rule["protocol"] == "6":
            ports = rule["tcp_options"][0]
            require(ports["min"] == ports["max"], "Broad port ranges are forbidden.")
            port = ports["min"]
            if port == 22:
                network = ipaddress.IPv4Network(rule["source"], strict=False)
                require(network.prefixlen >= 24, "SSH must be restricted to /24 or narrower.")
                ssh_sources.add(rule["source"])
            else:
                require(port in (80, 443) and rule["source"] == "0.0.0.0/0",
                        "Only HTTP/HTTPS may be exposed publicly.")
                web_ports.add(port)
        else:
            require(rule["protocol"] == "1" and rule["icmp_options"] == [{"type": 3, "code": 4}]
                    and rule["source"] == "0.0.0.0/0", "Only path-MTU ICMP is allowed.")
    require(ssh_sources == set(variables["ssh_allowed_cidrs"]) and web_ports == {80, 443},
            "Missing or unexpected ingress rules.")
    subnet_resource = next(r for r in resources if r["type"] == "oci_core_subnet")
    # Newly created IDs are unknown, so inspect the reference as well as known state.
    config_resources = plan["configuration"]["root_module"]["resources"]
    subnet_config = next(r for r in config_resources if r["address"] == subnet_resource["address"])
    refs = subnet_config["expressions"]["security_list_ids"]["references"]
    require("oci_core_security_list.demo.id" in refs and
            not any("default_security_list" in reference for reference in refs),
            "The subnet must use only the restricted demo security list.")

    user_data = base64.b64decode(vm["metadata"]["user_data"]).decode()
    require(user_data.startswith("#cloud-config\n"), "Missing cloud-init header.")
    cloud = json.loads(user_data.split("\n", 1)[1])
    require(cloud["ssh_pwauth"] is False and cloud["disable_root"] is True,
            "Password SSH and direct root login must be disabled.")
    files = {item["path"]: item for item in cloud["write_files"]}
    require(set(files) == {"/usr/local/sbin/rcp-bootstrap", "/usr/local/sbin/rcp-firewall",
                          "/etc/systemd/system/rcp-firewall.service"}, "Unexpected bootstrap files.")
    for path in ("/usr/local/sbin/rcp-bootstrap", "/usr/local/sbin/rcp-firewall"):
        require(files[path]["permissions"] == "0700", "Bootstrap scripts must be root-only.")
        subprocess.run(["bash", "-n"], input=files[path]["content"], text=True, check=True)
    require(cloud["runcmd"] == [["/usr/local/sbin/rcp-bootstrap"]], "Unexpected bootstrap command.")
    return user_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    try:
        check(json.loads(args.plan.read_text()), offline=args.offline)
    except (ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Plan rejected: {error}\n")
    print("Plan checks passed: one bounded ARM VM, restricted ingress, nonsecret bootstrap.")


if __name__ == "__main__":
    main()
