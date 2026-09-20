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
}
