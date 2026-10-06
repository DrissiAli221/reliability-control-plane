# No credentials and no calls to Grafana. Only the provider's local schema runs.
mock_provider "grafana" {
  mock_data "grafana_synthetic_monitoring_probes" {
    defaults = { probes = { Frankfurt = 1, Ohio = 2 } }
  }
}

variables {
  stack_url              = "https://example.grafana.net"
  sm_api_url             = "https://synthetic-monitoring-api-eu-west.grafana.net"
  metrics_datasource_uid = "fake-prometheus"
}

run "safe_defaults" {
  command = plan
  assert {
    condition     = output.monthly_api_executions_31_days == 89280
    error_message = "The two checks must stay below 100k monthly API executions."
  }
  assert {
    condition     = alltrue([for check in grafana_synthetic_monitoring_check.endpoint : !check.enabled && check.frequency == 120000 && check.timeout == 10000 && length(check.probes) == 2])
    error_message = "Checks must start disabled and retain their cost guardrails."
  }
  assert {
    condition     = alltrue([for rule in grafana_rule_group.demo.rule : rule.is_paused && rule.notification_settings[0].contact_point == grafana_contact_point.operator.name])
    error_message = "Rules must start paused and route to the dedicated email contact."
  }
}

run "reject_extra_probe" {
  command = plan
  variables {
    public_probe_names = ["Frankfurt", "Ohio", "London"]
  }
  expect_failures = [var.public_probe_names]
}

run "enable_only_after_server_ready" {
  command = plan
  variables {
    monitoring_enabled = true
  }
  assert {
    condition     = alltrue([for check in grafana_synthetic_monitoring_check.endpoint : check.enabled]) && alltrue([for rule in grafana_rule_group.demo.rule : !rule.is_paused])
    error_message = "The explicit enable switch must activate both checks and rules."
  }
  assert {
    condition     = grafana_synthetic_monitoring_check.endpoint["api"].target == "https://rcp-ali.duckdns.org/healthz" && contains(one(one(grafana_synthetic_monitoring_check.endpoint["api"].settings).http).fail_if_body_not_matches_regexp, "^UP$")
    error_message = "The API check must target the minimal health route and require its exact success signal."
  }
}
