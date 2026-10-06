variable "stack_url" {
  type        = string
  description = "Existing Grafana Cloud stack URL, without a trailing slash."
  validation {
    condition     = can(regex("^https://[a-z0-9-]+[.]grafana[.]net$", var.stack_url))
    error_message = "Use the base HTTPS Grafana Cloud stack URL."
  }
}

variable "sm_api_url" {
  type        = string
  description = "HTTPS backend address shown in Synthetic Monitoring > Config; do not guess from the city name."
  validation {
    condition     = can(regex("^https://synthetic-monitoring-api[-a-z0-9]*[.]grafana[.]net$", var.sm_api_url))
    error_message = "Use the stack's HTTPS Synthetic Monitoring backend address."
  }
}

variable "metrics_datasource_uid" {
  type        = string
  description = "UID of the existing Grafana Cloud Prometheus data source that receives Alloy and synthetic metrics."
  validation {
    condition     = can(regex("^[a-zA-Z0-9_-]+$", var.metrics_datasource_uid))
    error_message = "Enter the existing Prometheus data source UID."
  }
}

variable "public_probe_names" {
  type        = list(string)
  default     = ["Frankfurt", "Ohio"]
  description = "Exactly two distinct public probes. IDs are read from the stack, never guessed."
  validation {
    condition     = length(var.public_probe_names) == 2 && length(distinct(var.public_probe_names)) == 2
    error_message = "Choose exactly two distinct probe names to keep the execution estimate within the free allowance."
  }
}

variable "dashboard_url" {
  type    = string
  default = "https://d2l2dtbol2pu16.cloudfront.net"
  validation {
    condition     = can(regex("^https://[^/?#[:space:]]+$", var.dashboard_url))
    error_message = "Use the dashboard's HTTPS origin without a trailing slash."
  }
}

variable "api_origin" {
  type    = string
  default = "https://rcp-ali.duckdns.org"
  validation {
    condition     = can(regex("^https://[^/?#[:space:]]+$", var.api_origin))
    error_message = "Use the API's HTTPS origin without a trailing slash."
  }
}

variable "alert_email" {
  type    = string
  default = "drissiali2004@gmail.com"
  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$", var.alert_email))
    error_message = "Enter one valid notification email address."
  }
}

variable "monitoring_enabled" {
  type        = bool
  default     = false
  description = "Enable checks and alerts only after /healthz and Alloy have been deployed and verified."
}
