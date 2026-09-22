output "queue_topology" {
  description = "Queue URLs and ARNs grouped by their architectural responsibility. Values remain unknown until AWS creates the resources."
  value = {
    regional_probe_jobs = {
      (var.central_region) = {
        queue_url = module.central_probe_jobs.queue_url
        queue_arn = module.central_probe_jobs.queue_arn
        dlq_arn   = module.central_probe_jobs.dlq_arn
      }
      (var.secondary_probe_region) = {
        queue_url = module.secondary_probe_jobs.queue_url
        queue_arn = module.secondary_probe_jobs.queue_arn
        dlq_arn   = module.secondary_probe_jobs.dlq_arn
      }
    }
    central_probe_results = {
      region    = var.central_region
      queue_url = module.central_probe_results.queue_url
      queue_arn = module.central_probe_results.queue_arn
      dlq_arn   = module.central_probe_results.dlq_arn
    }
  }

  precondition {
    condition     = var.secondary_probe_region != var.central_region
    error_message = "secondary_probe_region must differ from central_region."
  }

  precondition {
    condition     = var.queue_visibility_timeout_seconds >= (var.probe_worker_timeout_seconds * 6) + 1
    error_message = "queue visibility must be at least six times the Lambda timeout plus the one-second batching window."
  }
}

output "probe_workers" {
  description = "Regional worker and execution-role ARNs. Workers have no RDS or control-plane network attachment."
  value = {
    (var.central_region) = {
      function_arn       = module.central_probe_worker.function_arn
      execution_role_arn = module.central_probe_worker.execution_role_arn
    }
    (var.secondary_probe_region) = {
      function_arn       = module.secondary_probe_worker.function_arn
      execution_role_arn = module.secondary_probe_worker.execution_role_arn
    }
  }
}

output "central_data_plane" {
  description = "Private central network and PostgreSQL endpoints for the future ECS service."
  value = {
    vpc_id                          = module.central_network.vpc_id
    public_subnet_ids               = module.central_network.public_subnet_ids
    application_subnet_ids          = module.central_network.application_subnet_ids
    database_subnet_ids             = module.central_network.database_subnet_ids
    load_balancer_security_group_id = module.central_network.load_balancer_security_group_id
    control_plane_security_group_id = module.central_network.control_plane_security_group_id
    database_endpoint               = module.postgresql.endpoint
    database_port                   = module.postgresql.port
    database_name                   = module.postgresql.database_name
    database_master_secret_arn      = module.postgresql.master_secret_arn
  }

  precondition {
    condition     = alltrue([for zone in var.central_availability_zones : startswith(zone, var.central_region)])
    error_message = "Every central availability zone must belong to central_region."
  }
}

output "identity" {
  description = "OIDC values consumed by the dashboard and Spring resource server."
  value = {
    user_pool_id         = module.identity.user_pool_id
    issuer_uri           = module.identity.issuer_uri
    dashboard_client_id  = module.identity.dashboard_client_id
    managed_login_domain = module.identity.managed_login_domain
  }

  precondition {
    condition = var.offline_mode || (
      !strcontains(var.cognito_domain_prefix, "replace-before-apply") &&
      alltrue([for url in concat(var.cognito_callback_urls, var.cognito_logout_urls) : startswith(url, "https://")])
    )
    error_message = "A real AWS plan requires a unique Cognito domain and HTTPS dashboard callback/logout URLs."
  }
}

output "control_plane_runtime" {
  description = "Central ECS/ALB runtime and immutable image destination."
  value = {
    cluster_arn            = module.control_plane_service.cluster_arn
    service_name           = module.control_plane_service.service_name
    load_balancer_dns_name = module.control_plane_service.load_balancer_dns_name
    ecr_repository_url     = module.control_plane_service.ecr_repository_url
    task_role_arn          = module.control_plane_service.task_role_arn
  }

  precondition {
    condition = var.offline_mode || (
      !strcontains(var.control_plane_certificate_arn, "000000000000") &&
      (var.control_plane_desired_count == 0 || var.control_plane_image_tag != "not-pushed")
    )
    error_message = "A real AWS plan requires a real ACM certificate ARN; starting tasks also requires an immutable image tag already pushed to ECR."
  }
}
