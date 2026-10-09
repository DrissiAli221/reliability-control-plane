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

output "social_sign_in" {
  description = "Register redirect_uri with Google and GitHub; javascript_origin is Google's authorized JS origin."
  value = {
    providers         = local.social_providers
    redirect_uri      = "${local.cognito_domain}/oauth2/idpresponse"
    javascript_origin = local.dashboard_origin
    github_issuer     = local.github_issuer
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
      VITE_SOCIAL_PROVIDERS  = join(",", local.social_providers)
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
        max-per-owner        = 5
        min-interval-seconds = 60
        max-total            = 8
        max-timeout-ms       = 5000
      }
      demo = {
        monitors            = "Example Domain|https://example.com, Wikipedia|https://www.wikipedia.org, Scheduled outage drill|${var.api_origin}/drill/status.html, GitHub Status|https://www.githubstatus.com/api/v2/status.json, Cloudflare Status|https://www.cloudflarestatus.com/api/v2/status.json"
        example-monitor-url = "https://example.com"
      }
    }
  })
}
