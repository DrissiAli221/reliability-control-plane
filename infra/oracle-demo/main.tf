locals {
  tags = { project = "rcp", environment = "demo" }
}

data "oci_identity_region_subscriptions" "tenancy" {
  count      = var.offline_mode ? 0 : 1
  tenancy_id = var.tenancy_ocid
}

data "oci_core_image" "ubuntu" {
  count    = var.offline_mode ? 0 : 1
  image_id = var.image_ocid
}

resource "oci_core_vcn" "demo" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.name}-vcn"
  cidr_blocks    = ["10.42.0.0/24"]
  is_ipv6enabled = false
  dns_label      = "rcpdemo"
  freeform_tags  = local.tags

  lifecycle {
    precondition {
      condition = var.offline_mode ? true : anytrue([
        for subscription in data.oci_identity_region_subscriptions.tenancy[0].region_subscriptions :
        subscription.is_home_region && subscription.region_name == var.region
      ])
      error_message = "Always Free compute must be deployed in the tenancy's home region."
    }
  }
}

resource "oci_core_internet_gateway" "demo" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.demo.id
  display_name   = "${var.name}-internet"
  enabled        = true
  freeform_tags  = local.tags
}

resource "oci_core_route_table" "demo" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.demo.id
  display_name   = "${var.name}-public"
  freeform_tags  = local.tags

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.demo.id
  }
}

resource "oci_core_security_list" "demo" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.demo.id
  display_name   = "${var.name}-firewall"
  freeform_tags  = local.tags

  # The server needs outbound HTTPS/DNS/NTP and access to AWS; no NAT gateway.
  egress_security_rules {
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
    protocol         = "all"
    stateless        = false
  }

  dynamic "ingress_security_rules" {
    for_each = var.ssh_allowed_cidrs
    content {
      source      = ingress_security_rules.value
      source_type = "CIDR_BLOCK"
      protocol    = "6"
      stateless   = false
      description = "Operator SSH"
      tcp_options {
        min = 22
        max = 22
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = toset([80, 443])
    content {
      source      = "0.0.0.0/0"
      source_type = "CIDR_BLOCK"
      protocol    = "6"
      stateless   = false
      description = "Caddy HTTP/HTTPS"
      tcp_options {
        min = ingress_security_rules.value
        max = ingress_security_rules.value
      }
    }
  }

  # Path MTU discovery; this does not open application ports.
  ingress_security_rules {
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    protocol    = "1"
    stateless   = false
    icmp_options {
      type = 3
      code = 4
    }
  }
}

resource "oci_core_subnet" "demo" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.demo.id
  cidr_block                 = "10.42.0.0/26"
  display_name               = "${var.name}-public"
  dns_label                  = "public"
  route_table_id             = oci_core_route_table.demo.id
  security_list_ids          = [oci_core_security_list.demo.id]
  prohibit_public_ip_on_vnic = false
  freeform_tags              = local.tags
}

resource "oci_core_instance" "demo" {
  compartment_id       = var.compartment_ocid
  availability_domain  = var.availability_domain
  display_name         = var.name
  shape                = "VM.Standard.A1.Flex"
  freeform_tags        = local.tags
  preserve_boot_volume = true

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  source_details {
    source_type             = "image"
    source_id               = var.image_ocid
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
    boot_volume_vpus_per_gb = 10
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.demo.id
    assign_public_ip = true
    assign_ipv6ip    = false
    hostname_label   = "rcpdemo"
  }

  metadata = {
    ssh_authorized_keys = trimspace(var.ssh_public_key)
    user_data           = base64encode("#cloud-config\n${jsonencode(local.cloud_config)}\n")
  }

  lifecycle {
    prevent_destroy = true
    # Cloud-init runs once. Changing a template must not imply it ran on a live VM.
    ignore_changes = [metadata["user_data"], source_details[0].source_id]

    precondition {
      condition = var.offline_mode ? true : (
        data.oci_core_image.ubuntu[0].operating_system == "Canonical Ubuntu" &&
        contains(["22.04", "24.04"], data.oci_core_image.ubuntu[0].operating_system_version) &&
        can(regex("(?i)(aarch64|arm64)", data.oci_core_image.ubuntu[0].display_name))
      )
      error_message = "Choose an official Canonical Ubuntu 22.04/24.04 ARM64 image."
    }
  }
}
