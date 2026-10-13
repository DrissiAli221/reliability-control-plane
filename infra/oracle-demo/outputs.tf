output "public_ip" {
  value       = oci_core_instance.demo.public_ip
  description = "Set the DuckDNS IPv4 record to this address. It can change if the VM is replaced."
}

output "instance_ocid" {
  value = oci_core_instance.demo.id
}

output "boot_volume_ocid" {
  value       = oci_core_instance.demo.boot_volume_id
  description = "Record this for recovery; the boot volume is preserved on instance termination."
}

output "ssh_command" {
  value       = "ssh ubuntu@${oci_core_instance.demo.public_ip}"
  description = "Use -i with the matching private key if it is not in your SSH agent."
}

output "deployment_path" {
  value = "/opt/rcp"
}
