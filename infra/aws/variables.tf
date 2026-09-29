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
  description = "AWS region that owns the control plane, result queue, and source-of-truth database. It also hosts a probe queue, so it must be one of the control plane's scheduled probe regions (eu-west-1, us-east-1); the application refuses to start otherwise."
  type        = string
  default     = "eu-west-1"
}

variable "secondary_probe_region" {
  description = "Second real probe region. Terraform provider instances are static, so another region requires another explicit provider/module instance. Together with central_region it must equal the control plane's scheduled probe regions (eu-west-1, us-east-1)."
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

variable "cognito_domain_prefix" {
  description = "Globally unique managed-login domain prefix. Replace the example before any apply."
  type        = string
}

variable "cognito_callback_urls" {
  description = "Exact dashboard OAuth callback URLs; localhost is allowed only for development."
  type        = list(string)
}

variable "cognito_logout_urls" {
  description = "Exact dashboard post-logout URLs; localhost is allowed only for development."
  type        = list(string)
}

variable "cognito_deletion_protection" {
  description = "Enable before the user pool contains real operator identities."
  type        = bool
  default     = false
}

variable "control_plane_certificate_arn" {
  description = "ACM certificate ARN for the public HTTPS ALB. The example is plan-only."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:acm:[a-z0-9-]+:[0-9]{12}:certificate/", var.control_plane_certificate_arn))
    error_message = "control_plane_certificate_arn must be an ACM certificate ARN."
  }
}

variable "control_plane_image_tag" {
  description = "Immutable ECR tag for the reviewed Java 21 control-plane image."
  type        = string
}

variable "control_plane_desired_count" {
  description = "Fargate task count. Use zero only for the first ECR bootstrap, one for cheap non-HA development, and two or more after resilience testing."
  type        = number
  default     = 0
}

variable "dashboard_force_destroy" {
  description = "Allow a development dashboard bucket to be destroyed while it contains objects. Keep false for durable environments."
  type        = bool
  default     = false
}

variable "dashboard_allowed_origins" {
  description = "Exact dashboard origins allowed by Spring CORS; use HTTPS origins without paths in AWS."
  type        = list(string)

  validation {
    condition = length(var.dashboard_allowed_origins) > 0 && alltrue([
      for origin in var.dashboard_allowed_origins : can(regex("^https?://[A-Za-z0-9.-]+(?::[0-9]+)?$", origin))
    ])
    error_message = "dashboard_allowed_origins must contain origins such as https://dashboard.example.com, without paths or wildcards."
  }
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
