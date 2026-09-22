variable "name" {
  description = "Name prefix for the Cognito user pool and public dashboard client."
  type        = string
}

variable "domain_prefix" {
  description = "Globally unique prefix for the Cognito managed-login domain."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$", var.domain_prefix))
    error_message = "domain_prefix must be 3-63 lowercase letters, digits, or hyphens and cannot start or end with a hyphen."
  }
}

variable "callback_urls" {
  description = "Exact dashboard redirect URLs allowed after authorization-code login."
  type        = list(string)

  validation {
    condition     = length(var.callback_urls) > 0 && alltrue([for url in var.callback_urls : can(regex("^https://|^http://localhost(?::[0-9]+)?(?:/|$)", url))])
    error_message = "callback_urls must contain at least one HTTPS URL or an http://localhost development URL."
  }
}

variable "logout_urls" {
  description = "Exact dashboard URLs allowed after Cognito logout."
  type        = list(string)

  validation {
    condition     = length(var.logout_urls) > 0 && alltrue([for url in var.logout_urls : can(regex("^https://|^http://localhost(?::[0-9]+)?(?:/|$)", url))])
    error_message = "logout_urls must contain at least one HTTPS URL or an http://localhost development URL."
  }
}

variable "deletion_protection" {
  description = "Protect the user pool from accidental deletion once it contains real operator identities."
  type        = bool
}
