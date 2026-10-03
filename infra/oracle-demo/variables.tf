variable "name" {
  type        = string
  default     = "rcp-demo"
  description = "Prefix for this demo's resources."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name))
    error_message = "Use 3–31 lowercase letters, numbers, or hyphens, starting with a letter."
  }
}

variable "region" {
  type        = string
  description = "Oracle home region; verified against the tenancy during a real plan."
}

variable "tenancy_ocid" {
  type        = string
  description = "Expected tenancy OCID. Credentials stay in the local OCI CLI profile."
  validation {
    condition     = can(regex("^ocid1\\.tenancy\\.", var.tenancy_ocid))
    error_message = "Supply a tenancy OCID."
  }
}

variable "compartment_ocid" {
  type        = string
  description = "Existing compartment OCID; the tenancy OCID can be used for the root compartment."
  validation {
    condition     = can(regex("^ocid1\\.(compartment|tenancy)\\.", var.compartment_ocid))
    error_message = "Supply an existing compartment or tenancy OCID."
  }
}

variable "availability_domain" {
  type        = string
  description = "Exact availability-domain name returned by the OCI CLI."
}

variable "image_ocid" {
  type        = string
  description = "Pinned official Canonical Ubuntu 22.04/24.04 ARM64 platform image OCID."
  validation {
    condition     = can(regex("^ocid1\\.image\\.", var.image_ocid))
    error_message = "Supply an image OCID."
  }
}

variable "config_file_profile" {
  type        = string
  default     = "rcp-operator"
  description = "SecurityToken profile in ~/.oci/config. Refresh it before a real plan/apply."
}

variable "ssh_public_key" {
  type        = string
  description = "Existing OpenSSH public key. Private keys are never generated or stored in Terraform."
  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) [A-Za-z0-9+/=]+( [^\\r\\n]*)?$", trimspace(var.ssh_public_key)))
    error_message = "Supply one OpenSSH public key, not a private key or multiline text."
  }
}

variable "ssh_allowed_cidrs" {
  type        = set(string)
  description = "Operator IPv4 networks allowed to SSH, normally your public IPv4/32."
  validation {
    condition = length(var.ssh_allowed_cidrs) > 0 && alltrue([
      for cidr in var.ssh_allowed_cidrs :
      can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) >= 24, false)
    ])
    error_message = "Supply at least one IPv4 CIDR, /24 or narrower. Public SSH (0.0.0.0/0) is forbidden."
  }
}

variable "ocpus" {
  type        = number
  default     = 1
  description = "ARM cores allocated to the single VM; bounded by the current 2-OCPU free allowance."
  validation {
    condition     = contains([1, 2], var.ocpus)
    error_message = "Use 1 or 2 OCPUs."
  }
}

variable "memory_in_gbs" {
  type        = number
  default     = 6
  description = "VM RAM; account-wide Always Free allocation must also be checked."
  validation {
    condition     = var.memory_in_gbs >= 4 && var.memory_in_gbs <= 12 && floor(var.memory_in_gbs) == var.memory_in_gbs
    error_message = "Use a whole number of GB between 4 and 12."
  }
}

variable "boot_volume_size_in_gbs" {
  type        = number
  default     = 50
  description = "Balanced boot disk, including Docker data and PostgreSQL; free storage is shared account-wide."
  validation {
    condition     = var.boot_volume_size_in_gbs >= 50 && var.boot_volume_size_in_gbs <= 200 && floor(var.boot_volume_size_in_gbs) == var.boot_volume_size_in_gbs
    error_message = "Use a whole number of GB between 50 and 200."
  }
}

variable "offline_mode" {
  type        = bool
  default     = false
  description = "Validation only: skips cloud data sources and substitutes dummy authentication. Never apply."
}

variable "offline_private_key_path" {
  type        = string
  default     = null
  description = "Ephemeral dummy signing key created by validate.sh; unused for real deployment."
}
