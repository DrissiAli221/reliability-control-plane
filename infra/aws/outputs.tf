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
