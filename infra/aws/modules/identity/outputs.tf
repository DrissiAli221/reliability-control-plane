output "user_pool_id" {
  description = "Cognito user pool that issues operator tokens."
  value       = aws_cognito_user_pool.this.id
}

output "issuer_uri" {
  description = "Exact iss claim the Spring resource server must accept."
  value       = "https://${aws_cognito_user_pool.this.endpoint}"
}

output "dashboard_client_id" {
  description = "Public SPA client identifier expected in Cognito access-token client_id claims."
  value       = aws_cognito_user_pool_client.dashboard.id
}

output "managed_login_domain" {
  description = "Cognito managed-login base URL used by the dashboard authorization-code flow with PKCE."
  value       = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

data "aws_region" "current" {}
