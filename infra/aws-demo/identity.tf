resource "aws_cognito_user_pool" "demo" {
  name                     = "${var.name}-users"
  user_pool_tier           = "LITE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"
  deletion_protection      = "ACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = false
  }
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 3
  }
  software_token_mfa_configuration {
    enabled = true
  }
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
}

resource "aws_cognito_user_group" "demo" {
  user_pool_id = aws_cognito_user_pool.demo.id
  name         = "demo"
  description  = "Shared demo identity; application enforces read-only access."
}

resource "aws_cognito_user_pool_client" "dashboard" {
  name                                 = "${var.name}-dashboard"
  user_pool_id                         = aws_cognito_user_pool.demo.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = ["${local.dashboard_origin}/auth/callback"]
  logout_urls                          = [local.dashboard_origin]
  explicit_auth_flows                  = ["ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH"]
  access_token_validity                = 15
  id_token_validity                    = 15
  refresh_token_validity               = 1
  enable_token_revocation              = true
  prevent_user_existence_errors        = "ENABLED"

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
  # REFRESH_TOKEN_AUTH must be omitted when rotation is enabled.
  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 10
  }
}

resource "aws_cognito_user_pool_domain" "demo" {
  user_pool_id = aws_cognito_user_pool.demo.id
  domain       = "${var.name}-${var.account_id}"
}
