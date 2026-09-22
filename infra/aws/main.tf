locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = "Reliability Control Plane"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Repository  = "RCP"
  }
}

module "central_network" {
  source = "./modules/central_network"

  name               = local.name_prefix
  vpc_cidr           = var.central_vpc_cidr
  availability_zones = var.central_availability_zones
}

module "postgresql" {
  source = "./modules/postgresql"

  name                = local.name_prefix
  subnet_ids          = module.central_network.database_subnet_ids
  security_group_id   = module.central_network.database_security_group_id
  instance_class      = var.database_instance_class
  multi_az            = var.database_multi_az
  deletion_protection = var.database_deletion_protection
  skip_final_snapshot = var.database_skip_final_snapshot
}

module "identity" {
  source = "./modules/identity"

  name                = local.name_prefix
  domain_prefix       = var.cognito_domain_prefix
  callback_urls       = var.cognito_callback_urls
  logout_urls         = var.cognito_logout_urls
  deletion_protection = var.cognito_deletion_protection
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

module "control_plane_service" {
  source = "./modules/control_plane_service"

  name                            = local.name_prefix
  vpc_id                          = module.central_network.vpc_id
  public_subnet_ids               = module.central_network.public_subnet_ids
  application_subnet_ids          = module.central_network.application_subnet_ids
  load_balancer_security_group_id = module.central_network.load_balancer_security_group_id
  control_plane_security_group_id = module.central_network.control_plane_security_group_id
  certificate_arn                 = var.control_plane_certificate_arn
  image_tag                       = var.control_plane_image_tag
  desired_count                   = var.control_plane_desired_count
  database_address                = module.postgresql.endpoint
  database_port                   = module.postgresql.port
  database_name                   = module.postgresql.database_name
  database_master_secret_arn      = module.postgresql.master_secret_arn
  identity_issuer_uri             = module.identity.issuer_uri
  identity_client_id              = module.identity.dashboard_client_id
  central_region                  = var.central_region
  probe_job_queue_urls = {
    (var.central_region)         = module.central_probe_jobs.queue_url
    (var.secondary_probe_region) = module.secondary_probe_jobs.queue_url
  }
  probe_job_queue_arns = [
    module.central_probe_jobs.queue_arn,
    module.secondary_probe_jobs.queue_arn
  ]
  probe_result_queue_url = module.central_probe_results.queue_url
  probe_result_queue_arn = module.central_probe_results.queue_arn
}

module "dashboard_hosting" {
  source = "./modules/dashboard_hosting"

  name          = local.name_prefix
  force_destroy = var.dashboard_force_destroy
}
