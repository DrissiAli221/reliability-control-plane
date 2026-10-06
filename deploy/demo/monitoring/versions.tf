terraform {
  required_version = ">= 1.7, < 2.0"
  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "4.47.0"
    }
  }
}

# Tokens are supplied through GRAFANA_AUTH and GRAFANA_SM_ACCESS_TOKEN by the
# local wrapper. No tokens, accounts or cloud stacks are managed in this state.
provider "grafana" {
  url    = var.stack_url
  sm_url = var.sm_api_url
}
