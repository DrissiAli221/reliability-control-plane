terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 9.8.0"
    }
  }
}

provider "oci" {
  auth                = var.offline_mode ? "APIKey" : "SecurityToken"
  config_file_profile = var.offline_mode ? "" : var.config_file_profile
  region              = var.region
  tenancy_ocid        = var.tenancy_ocid

  # Offline validation uses an ephemeral local key, never an operator credential.
  user_ocid        = var.offline_mode ? "ocid1.user.oc1..offline" : null
  fingerprint      = var.offline_mode ? "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00" : null
  private_key_path = var.offline_mode ? var.offline_private_key_path : null
}
