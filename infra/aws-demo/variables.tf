variable "name" {
  description = "Unique demo resource prefix, separate from production."
  type        = string
  default     = "rcp-demo"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.name))
    error_message = "Use 3-31 lowercase letters, digits, or hyphens, starting with a letter."
  }
}

variable "account_id" {
  description = "AWS account ID owning the demo; avoids an STS lookup during offline planning."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "Supply a 12-digit account ID."
  }
}

variable "budget_email" {
  description = "Email receiving account-wide USD budget alerts. Kept in an untracked tfvars file."
  type        = string
  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+\\.[^@ ]+$", var.budget_email))
    error_message = "Supply a notification email address."
  }
}

variable "monthly_budget_usd" {
  description = "Account-wide alert threshold; this is not a hard spending cap."
  type        = number
  default     = 10
  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "Budget must be positive."
  }
}

variable "api_origin" {
  description = "Public HTTPS Caddy origin, without a trailing slash."
  type        = string
  validation {
    condition     = can(regex("^https://[a-zA-Z0-9.-]+(:[0-9]+)?$", var.api_origin))
    error_message = "Supply an HTTPS origin without a path or trailing slash."
  }
}

variable "lambda_artifact_path" {
  description = "Local shaded Java 21 JAR, uploaded to a private bucket in each probe region."
  type        = string
  default     = "../../rcp-probe-lambda/target/rcp-probe-lambda.jar"
}

variable "offline_mode" {
  description = "Validation only: disable AWS identity lookups and omit the real artifact upload source. Never deploy a plan made in this mode."
  type        = bool
  default     = false
}

variable "reserve_probe_concurrency" {
  description = "Opt in only after verifying regional account capacity can reserve 10 slots while leaving AWS's 100 unreserved slots. SQS maximum concurrency always caps each worker at 10. Also reserves 5 slots for the sign-in adapter when it is enabled."
  type        = bool
  default     = false
}

variable "social_providers" {
  description = "Social sign-in providers to enable on the Cognito pool. Each needs its client ID and secret below."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for p in var.social_providers : contains(["Google", "GitHub"], p)])
    error_message = "Supported social providers are \"Google\" and \"GitHub\"."
  }
}

# Secrets arrive only through an untracked tfvars file or TF_VAR_* environment variables.
# They are null by default so the current deployment and offline validation need none.
variable "google_client_id" {
  description = "Google OAuth client ID (Web application). Required when social_providers includes Google."
  type        = string
  default     = null
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret. Required when social_providers includes Google."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_client_id" {
  description = "GitHub OAuth App client ID. Required when social_providers includes GitHub."
  type        = string
  default     = null
  sensitive   = true
}

variable "github_client_secret" {
  description = "GitHub OAuth App client secret. Required when social_providers includes GitHub."
  type        = string
  default     = null
  sensitive   = true
}
