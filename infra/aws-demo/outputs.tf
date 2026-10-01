output "identity" {
  value = {
    region       = "us-east-1"
    user_pool_id = aws_cognito_user_pool.demo.id
    issuer_uri   = local.issuer_uri
    client_id    = aws_cognito_user_pool_client.dashboard.id
    login_domain = "https://${aws_cognito_user_pool_domain.demo.domain}.auth.us-east-1.amazoncognito.com"
    demo_group   = aws_cognito_user_group.demo.name
  }
}

output "queues" {
  value = {
    jobs          = local.job_queue_urls
    result_region = "us-east-1"
    result_url    = module.results.queue_url
    dead_letters = {
      eu_jobs = module.europe_jobs.dlq_url
      us_jobs = module.us_jobs.dlq_url
      results = module.results.dlq_url
    }
  }
}

output "dashboard" {
  value = {
    origin          = local.dashboard_origin
    bucket          = aws_s3_bucket.dashboard.id
    distribution_id = aws_cloudfront_distribution.dashboard.id
    build_environment = {
      VITE_AUTH_MODE         = "cognito"
      VITE_API_BASE_URL      = var.api_origin
      VITE_COGNITO_AUTHORITY = local.issuer_uri
      VITE_COGNITO_CLIENT_ID = aws_cognito_user_pool_client.dashboard.id
    }
  }
}

output "server_iam_user" {
  value = aws_iam_user.server.name
}

output "server_application_json" {
  description = "Nonsecret Spring configuration for the merged demo guardrails."
  value = jsonencode({
    rcp = {
      identity = {
        issuer-uri      = local.issuer_uri
        client-id       = aws_cognito_user_pool_client.dashboard.id
        allowed-origins = local.dashboard_origin
        read-only-group = "demo"
      }
      runtime = {
        enabled                           = true
        probe-job-queue-urls              = local.job_queue_urls
        probe-result-queue-region         = "us-east-1"
        probe-result-queue-url            = module.results.queue_url
        result-wait-time-seconds          = 20
        result-visibility-timeout-seconds = 60
      }
      monitors = {
        max-per-owner        = 3
        min-interval-seconds = 60
        max-total            = 8
        max-timeout-ms       = 5000
      }
      demo = {
        monitors            = "Example Domain|https://example.com, Wikipedia|https://www.wikipedia.org"
        example-monitor-url = "https://example.com"
      }
    }
  })
}
