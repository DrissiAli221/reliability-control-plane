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

module "central_probe_worker" {
  source = "./modules/probe_worker"

  name                    = "${local.name_prefix}-probe-worker-${var.central_region}"
  probe_region            = var.central_region
  job_queue_arn           = module.central_probe_jobs.queue_arn
  result_queue_arn        = module.central_probe_results.queue_arn
  result_queue_url        = module.central_probe_results.queue_url
  result_queue_region     = var.central_region
  artifact_bucket         = var.probe_worker_artifact_bucket
  artifact_key            = var.probe_worker_artifact_key
  artifact_object_version = var.probe_worker_artifact_object_version
  timeout_seconds         = var.probe_worker_timeout_seconds
}

module "secondary_probe_worker" {
  source = "./modules/probe_worker"

  providers = {
    aws = aws.secondary_probe
  }

  name                    = "${local.name_prefix}-probe-worker-${var.secondary_probe_region}"
  probe_region            = var.secondary_probe_region
  job_queue_arn           = module.secondary_probe_jobs.queue_arn
  result_queue_arn        = module.central_probe_results.queue_arn
  result_queue_url        = module.central_probe_results.queue_url
  result_queue_region     = var.central_region
  artifact_bucket         = var.probe_worker_artifact_bucket
  artifact_key            = var.probe_worker_artifact_key
  artifact_object_version = var.probe_worker_artifact_object_version
  timeout_seconds         = var.probe_worker_timeout_seconds
}
