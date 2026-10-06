data "grafana_synthetic_monitoring_probes" "public" {}

locals {
  checks = {
    dashboard = { job = "rcp-dashboard", target = var.dashboard_url, body_pattern = [] }
    api       = { job = "rcp-api", target = "${var.api_origin}/healthz", body_pattern = ["^UP$"] }
  }
  # 2 checks x 2 locations x 31 days x 24 hours x 30 runs/hour = 89,280.
  monthly_api_executions_31_days = length(local.checks) * length(var.public_probe_names) * 31 * 24 * 30
}

resource "grafana_synthetic_monitoring_check" "endpoint" {
  for_each           = local.checks
  job                = each.value.job
  target             = each.value.target
  enabled            = var.monitoring_enabled
  frequency          = 120000
  timeout            = 10000
  basic_metrics_only = true
  probes             = [for name in var.public_probe_names : data.grafana_synthetic_monitoring_probes.public.probes[name]]
  labels             = { project = "rcp", environment = "demo" }
  settings {
    http {
      method                          = "GET"
      ip_version                      = "V4"
      no_follow_redirects             = true
      fail_if_not_ssl                 = true
      valid_status_codes              = [200]
      fail_if_body_not_matches_regexp = each.value.body_pattern
    }
  }
}

output "monthly_api_executions_31_days" {
  value       = local.monthly_api_executions_31_days
  description = "Estimate for these two checks only; the stack's other checks share the free allowance."
}
