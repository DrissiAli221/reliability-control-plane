locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = "Reliability Control Plane"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Repository  = "RCP"
  }
}

module "central_probe_jobs" {
  source = "./modules/standard_queue"

  name                       = "${local.name_prefix}-probe-jobs-${var.central_region}"
  purpose                    = "regional-probe-jobs"
  visibility_timeout_seconds = var.queue_visibility_timeout_seconds
  max_receive_count          = var.queue_max_receive_count
}

module "secondary_probe_jobs" {
  source = "./modules/standard_queue"

  providers = {
    aws = aws.secondary_probe
  }

  name                       = "${local.name_prefix}-probe-jobs-${var.secondary_probe_region}"
  purpose                    = "regional-probe-jobs"
  visibility_timeout_seconds = var.queue_visibility_timeout_seconds
  max_receive_count          = var.queue_max_receive_count
}

module "central_probe_results" {
  source = "./modules/standard_queue"

  name                       = "${local.name_prefix}-probe-results-${var.central_region}"
  purpose                    = "central-probe-results"
  visibility_timeout_seconds = var.queue_visibility_timeout_seconds
  max_receive_count          = var.queue_max_receive_count
}
