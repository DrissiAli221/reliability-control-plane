variable "project_name" {
  description = "Short lowercase name used in AWS resource names."
  type        = string
  default     = "rcp"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.project_name))
    error_message = "project_name must be 2-16 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "environment" {
  description = "Deployment environment encoded in names and tags."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "stage", "prod"], var.environment)
    error_message = "environment must be dev, stage, or prod."
  }
}

variable "central_region" {
  description = "AWS region that owns the control plane, result queue, and source-of-truth database."
  type        = string
  default     = "eu-west-1"
}

variable "secondary_probe_region" {
  description = "Second real probe region. Terraform provider instances are static, so another region requires another explicit provider/module instance."
  type        = string
  default     = "us-east-1"
}

variable "offline_mode" {
  description = "Skip AWS account and credential validation for local terraform validate/plan only. Never use this for apply."
  type        = bool
  default     = false
}

variable "central_vpc_cidr" {
  description = "Private IPv4 range for the central control-plane VPC."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.central_vpc_cidr))
    error_message = "central_vpc_cidr must be a valid IPv4 CIDR."
  }
}

variable "central_availability_zones" {
  description = "Two availability zones in central_region."
  type        = list(string)
  default     = ["eu-west-1a", "eu-west-1b"]
}

variable "database_instance_class" {
  description = "Small default for the reference environment; resize from measured load and connection evidence."
  type        = string
  default     = "db.t4g.micro"
}

variable "database_multi_az" {
  description = "Enable intra-region RDS standby failover. False keeps the undeployed reference plan cheaper."
  type        = bool
  default     = false
}

variable "database_deletion_protection" {
  description = "Enable before any environment contains durable data."
  type        = bool
  default     = false
}

variable "database_skip_final_snapshot" {
  description = "Development-only teardown behavior. Must be false for durable environments."
  type        = bool
  default     = true
}

variable "queue_visibility_timeout_seconds" {
  description = "Time granted to a consumer before an unacknowledged message becomes visible again."
  type        = number
  default     = 210

  validation {
    condition     = var.queue_visibility_timeout_seconds >= 30 && var.queue_visibility_timeout_seconds <= 43200
    error_message = "queue_visibility_timeout_seconds must be between 30 and 43200."
  }
}

variable "probe_worker_timeout_seconds" {
  description = "Hard timeout for each regional Lambda invocation."
  type        = number
  default     = 30

  validation {
    condition     = var.probe_worker_timeout_seconds >= 1 && var.probe_worker_timeout_seconds <= 900
    error_message = "probe_worker_timeout_seconds must be between 1 and 900."
  }
}

variable "queue_max_receive_count" {
  description = "Number of receives before SQS moves a poison message to its DLQ."
  type        = number
  default     = 5

  validation {
    condition     = var.queue_max_receive_count >= 1 && var.queue_max_receive_count <= 1000
    error_message = "queue_max_receive_count must be between 1 and 1000."
  }
}

variable "probe_worker_artifact_bucket" {
  description = "Existing S3 bucket containing the immutable regional probe-worker artifact. Terraform does not create or upload it."
  type        = string
}

variable "probe_worker_artifact_key" {
  description = "Versioned S3 key for the regional probe-worker artifact."
  type        = string
}

variable "probe_worker_artifact_object_version" {
  description = "Optional S3 object version. Set it for every authorized deployment so rollbacks are deterministic."
  type        = string
  default     = null
}
