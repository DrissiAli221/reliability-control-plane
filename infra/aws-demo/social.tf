# Optional Google and GitHub sign-in for the Cognito pool in identity.tf.
# Everything here is off unless var.social_providers enables it, so the base deployment
# and the offline plan need no secrets. All resources are in us-east-1 (default provider).

locals {
  social_providers = sort(tolist(var.social_providers))
  google_enabled   = contains(var.social_providers, "Google")
  github_enabled   = contains(var.social_providers, "GitHub")
  cognito_domain   = "https://${aws_cognito_user_pool_domain.demo.domain}.auth.us-east-1.amazoncognito.com"
  # Function URLs end with a slash; the OIDC issuer must match the adapter's discovery
  # document exactly, and the adapter derives it as https://<host> with no slash.
  github_issuer = local.github_enabled ? trimsuffix(aws_lambda_function_url.github_oidc[0].function_url, "/") : ""
}

resource "aws_cognito_identity_provider" "google" {
  count         = local.google_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.demo.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }

  lifecycle {
    precondition {
      condition     = try(length(var.google_client_id) > 0, false) && try(length(var.google_client_secret) > 0, false)
      error_message = "Set google_client_id and google_client_secret to enable Google sign-in."
    }
  }
}

# GitHub OAuth is not OIDC, so Cognito talks to a small adapter Lambda behind a function URL.
resource "tls_private_key" "github_oidc" {
  count     = local.github_enabled ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 2048
}

data "archive_file" "github_oidc" {
  count       = local.github_enabled ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/github-oidc/index.mjs"
  output_path = "${path.module}/.build/github-oidc.zip"
}

resource "aws_cloudwatch_log_group" "github_oidc" {
  count             = local.github_enabled ? 1 : 0
  name              = "/aws/lambda/${var.name}-github-oidc"
  retention_in_days = 14
}

data "aws_iam_policy_document" "github_oidc" {
  count = local.github_enabled ? 1 : 0
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.github_oidc[0].arn}:*"]
  }
}

data "aws_iam_policy_document" "github_oidc_trust" {
  count = local.github_enabled ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "github_oidc" {
  count              = local.github_enabled ? 1 : 0
  name               = "${var.name}-github-oidc"
  assume_role_policy = data.aws_iam_policy_document.github_oidc_trust[0].json
}

resource "aws_iam_role_policy" "github_oidc" {
  count  = local.github_enabled ? 1 : 0
  name   = "${var.name}-github-oidc-runtime"
  role   = aws_iam_role.github_oidc[0].id
  policy = data.aws_iam_policy_document.github_oidc[0].json
}

resource "aws_lambda_function" "github_oidc" {
  count                          = local.github_enabled ? 1 : 0
  function_name                  = "${var.name}-github-oidc"
  role                           = aws_iam_role.github_oidc[0].arn
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  handler                        = "index.handler"
  memory_size                    = 256
  timeout                        = 10
  reserved_concurrent_executions = var.reserve_probe_concurrency ? 5 : -1
  filename                       = data.archive_file.github_oidc[0].output_path
  source_code_hash               = data.archive_file.github_oidc[0].output_base64sha256
  environment {
    variables = {
      # Sensitive: derived from the generated key, so Terraform redacts it in plans and outputs.
      SIGNING_KEY_PEM = tls_private_key.github_oidc[0].private_key_pem_pkcs8
    }
  }
  depends_on = [aws_cloudwatch_log_group.github_oidc, aws_iam_role_policy.github_oidc]
}

resource "aws_lambda_function_url" "github_oidc" {
  count              = local.github_enabled ? 1 : 0
  function_name      = aws_lambda_function.github_oidc[0].function_name
  authorization_type = "NONE"
}

# Since late 2025 a public function URL needs both permissions.
resource "aws_lambda_permission" "github_oidc_url" {
  count                  = local.github_enabled ? 1 : 0
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.github_oidc[0].function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "github_oidc_invoke" {
  count                    = local.github_enabled ? 1 : 0
  statement_id             = "AllowPublicInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.github_oidc[0].function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_cognito_identity_provider" "github" {
  count         = local.github_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.demo.id
  provider_name = "GitHub"
  provider_type = "OIDC"

  provider_details = {
    client_id                 = var.github_client_id
    client_secret             = var.github_client_secret
    authorize_scopes          = "openid read:user user:email"
    attributes_request_method = "GET"
    oidc_issuer               = local.github_issuer
    authorize_url             = "${local.github_issuer}/authorize"
    token_url                 = "${local.github_issuer}/token"
    attributes_url            = "${local.github_issuer}/userinfo"
    jwks_uri                  = "${local.github_issuer}/jwks"
  }
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }

  lifecycle {
    precondition {
      condition     = try(length(var.github_client_id) > 0, false) && try(length(var.github_client_secret) > 0, false)
      error_message = "Set github_client_id and github_client_secret to enable GitHub sign-in."
    }
  }
  # Cognito reads the adapter's discovery document while creating the provider.
  depends_on = [aws_lambda_permission.github_oidc_url, aws_lambda_permission.github_oidc_invoke]
}
