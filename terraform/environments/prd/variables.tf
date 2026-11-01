# Variables for prd environment
# Requirements: 1.5

variable "environment" {
  type        = string
  description = "Environment identifier"
  default     = "prd"
  validation {
    condition     = var.environment == "prd"
    error_message = "This configuration is for prd environment only"
  }
}

variable "project_name" {
  type        = string
  description = "Project name"
  default     = "serverless-blog"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "ap-northeast-1"
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "AWS region must be in valid format (e.g., ap-northeast-1)"
  }
}

variable "alarm_email" {
  type        = string
  description = "Email address for alarm notifications"
  sensitive   = true
}

# Custom Domain Configuration
variable "enable_custom_domain" {
  type        = bool
  description = "Enable custom domain configuration (requires Cloudflare API token)"
  default     = false
}

variable "domain_name" {
  type        = string
  description = "Custom domain name for production (e.g., boneofmyfallacy.net)"
  default     = "boneofmyfallacy.net"
}

variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token for DNS management"
  sensitive   = true
  default     = ""
}

variable "enable_passkeys" {
  type        = bool
  default     = true
  description = "Enable passkey sign-in after the WebAuthn MFA bootstrap; false only for initial tier preparation."
}

variable "backup_freshness_alarm_actions_enabled" {
  type        = bool
  default     = false
  description = "After first backup success metric is verified, separately approve enabling freshness notifications. See docs/reliability-operations.md."
}

variable "enforce_strict_csp_public" {
  type        = bool
  default     = false
  description = "Explicit promotion of public CSP after DEV acceptance; default remains Report-Only"
}
variable "enforce_strict_csp_admin" {
  type        = bool
  default     = false
  description = "Explicit promotion of admin CSP after DEV Cognito/upload acceptance; default remains Report-Only"
}
