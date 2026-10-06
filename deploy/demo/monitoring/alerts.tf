resource "grafana_folder" "demo" {
  uid   = "rcp-demo-operations"
  title = "RCP demo operations"
}

resource "grafana_contact_point" "operator" {
  name = "RCP demo email"
  email {
    addresses               = [var.alert_email]
    single_email            = true
    disable_resolve_message = false
  }
}

resource "grafana_rule_group" "demo" {
  name             = "RCP demo"
  folder_uid       = grafana_folder.demo.uid
  interval_seconds = 60
  dynamic "rule" {
    for_each = jsondecode(file("${path.module}/alerts.json"))
    content {
      uid            = rule.value.uid
      name           = rule.value.name
      condition      = "B"
      for            = rule.value.for
      no_data_state  = rule.value.no_data_state
      exec_err_state = "Alerting"
      is_paused      = !var.monitoring_enabled
      labels         = { project = "rcp", environment = "demo" }
      annotations = {
        summary     = rule.value.summary
        description = rule.value.description
      }
      data {
        ref_id         = "A"
        datasource_uid = var.metrics_datasource_uid
        relative_time_range {
          from = 600
          to   = 0
        }
        model = jsonencode({
          refId      = "A", expr = rule.value.expr, instant = true, range = false,
          intervalMs = 60000, maxDataPoints = 600,
          datasource = { type = "prometheus", uid = var.metrics_datasource_uid }
        })
      }
      data {
        ref_id         = "B"
        datasource_uid = "-100"
        relative_time_range {
          from = 0
          to   = 0
        }
        model = jsonencode({
          refId      = "B", type = "threshold", expression = "A",
          datasource = { type = "__expr__", uid = "__expr__" },
          conditions = [{ evaluator = { type = "gt", params = [0] },
            operator = { type = "and" }, query = { params = ["A"] },
          reducer = { type = "last", params = [] }, type = "query" }]
        })
      }
      # Route only these rules. The stack's global notification tree stays intact.
      notification_settings {
        contact_point   = grafana_contact_point.operator.name
        group_wait      = "30s"
        group_interval  = "5m"
        repeat_interval = "4h"
      }
    }
  }
}

resource "grafana_dashboard" "demo" {
  folder      = grafana_folder.demo.uid
  config_json = templatefile("${path.module}/dashboard.json.tftpl", { metrics_datasource_uid = var.metrics_datasource_uid })
}

output "operations_dashboard" {
  value = "${var.stack_url}/d/rcp-demo-operations"
}
