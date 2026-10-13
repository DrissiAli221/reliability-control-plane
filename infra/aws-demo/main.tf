locals {
  # The scheduler currently requires exactly these two regions.
  job_queue_urls = {
    eu-west-1 = module.europe_jobs.queue_url
    us-east-1 = module.us_jobs.queue_url
  }
  issuer_uri       = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.demo.id}"
  dashboard_origin = "https://${aws_cloudfront_distribution.dashboard.domain_name}"
}

module "us_jobs" {
  source                     = "./modules/queue"
  name                       = "${var.name}-jobs-us-east-1"
  purpose                    = "regional-probe-jobs"
  visibility_timeout_seconds = 180
  max_receive_count          = 5
}

module "europe_jobs" {
  source                     = "./modules/queue"
  providers                  = { aws = aws.europe }
  name                       = "${var.name}-jobs-eu-west-1"
  purpose                    = "regional-probe-jobs"
  visibility_timeout_seconds = 180
  max_receive_count          = 5
}

module "results" {
  source                     = "./modules/queue"
  name                       = "${var.name}-results-us-east-1"
  purpose                    = "central-probe-results"
  visibility_timeout_seconds = 60
  max_receive_count          = 5
}

module "us_probe" {
  source              = "./modules/probe"
  name                = "${var.name}-probe-us-east-1"
  region              = "us-east-1"
  job_queue_arn       = module.us_jobs.queue_arn
  result_queue_arn    = module.results.queue_arn
  result_queue_url    = module.results.queue_url
  artifact_path       = var.lambda_artifact_path
  offline_mode        = var.offline_mode
  reserve_concurrency = var.reserve_probe_concurrency
  # Only the demo drill (same host as the monitored /drill/status.html) is told the probe region.
  region_header_host = regex("^https://([^:/]+)", var.api_origin)[0]
}

module "europe_probe" {
  source              = "./modules/probe"
  providers           = { aws = aws.europe }
  name                = "${var.name}-probe-eu-west-1"
  region              = "eu-west-1"
  job_queue_arn       = module.europe_jobs.queue_arn
  result_queue_arn    = module.results.queue_arn
  result_queue_url    = module.results.queue_url
  artifact_path       = var.lambda_artifact_path
  offline_mode        = var.offline_mode
  reserve_concurrency = var.reserve_probe_concurrency
  # Only the demo drill (same host as the monitored /drill/status.html) is told the probe region.
  region_header_host = regex("^https://([^:/]+)", var.api_origin)[0]
}

# No access-key resource: secret material must never enter Terraform state.
resource "aws_iam_user" "server" {
  name = "${var.name}-server"
}

data "aws_iam_policy_document" "server" {
  statement {
    sid       = "PublishRegionalJobs"
    actions   = ["sqs:SendMessage"]
    resources = [module.us_jobs.queue_arn, module.europe_jobs.queue_arn]
  }
  statement {
    sid       = "ConsumeCentralResults"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = [module.results.queue_arn]
  }
  statement {
    sid       = "SignInSharedDemoUser"
    actions   = ["cognito-idp:AdminInitiateAuth"]
    resources = [aws_cognito_user_pool.demo.arn]
  }
}

resource "aws_iam_user_policy" "server" {
  name   = "${var.name}-runtime"
  user   = aws_iam_user.server.name
  policy = data.aws_iam_policy_document.server.json
}

resource "aws_budgets_budget" "demo" {
  account_id   = var.account_id
  name         = "${var.name}-account-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Deliberately account-wide, including usage hidden by promotional credits.
  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 10
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_email]
  }
}
