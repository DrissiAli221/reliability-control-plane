variable "name" {
  type        = string
  description = "Name prefix for central control-plane runtime resources."
}

variable "vpc_id" {
  type        = string
  description = "Central VPC containing the ALB and Fargate tasks."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for the Internet-facing ALB."
}

variable "application_subnet_ids" {
  type        = list(string)
  description = "Private subnets for Fargate tasks."
}

variable "load_balancer_security_group_id" {
  type        = string
  description = "Security group allowing public HTTPS to the ALB."
}

variable "control_plane_security_group_id" {
  type        = string
  description = "Security group allowing ALB and PostgreSQL connectivity for tasks."
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate in the central region for the HTTPS listener."
}

variable "image_tag" {
  type        = string
  description = "Immutable ECR image tag produced from a reviewed control-plane build."
}

variable "desired_count" {
  type        = number
  description = "Number of Fargate tasks. Zero is allowed only to bootstrap ECR before the first image push."

  validation {
    condition     = var.desired_count >= 0 && var.desired_count <= 10
    error_message = "desired_count must be between 0 and 10."
  }
}

variable "database_address" {
  type        = string
  description = "Private RDS hostname."
}

variable "database_port" {
  type        = number
  description = "PostgreSQL port."
}

variable "database_name" {
  type        = string
  description = "PostgreSQL database name."
}

variable "database_master_secret_arn" {
  type        = string
  description = "RDS-managed Secrets Manager ARN containing username and password JSON keys."
}

variable "identity_issuer_uri" {
  type        = string
  description = "Cognito issuer accepted by the Spring resource server."
}

variable "identity_client_id" {
  type        = string
  description = "Cognito public dashboard client expected in access-token client_id."
}

variable "dashboard_allowed_origins" {
  type        = list(string)
  description = "Exact browser origins allowed to call the authenticated API."
}

variable "central_region" {
  type        = string
  description = "Region that owns the result queue and central control plane."
}

variable "probe_job_queue_urls" {
  type        = map(string)
  description = "Regional probe-job queue URLs keyed by AWS region."
}

variable "probe_job_queue_arns" {
  type        = set(string)
  description = "Regional probe-job queue ARNs the task may publish to."
}

variable "probe_result_queue_url" {
  type        = string
  description = "Central result queue URL consumed by the task."
}

variable "probe_result_queue_arn" {
  type        = string
  description = "Central result queue ARN the task may consume."
}
