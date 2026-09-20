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

variable "queue_visibility_timeout_seconds" {
  description = "Time granted to a consumer before an unacknowledged message becomes visible again."
  type        = number
  default     = 180

  validation {
    condition     = var.queue_visibility_timeout_seconds >= 30 && var.queue_visibility_timeout_seconds <= 43200
    error_message = "queue_visibility_timeout_seconds must be between 30 and 43200."
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
