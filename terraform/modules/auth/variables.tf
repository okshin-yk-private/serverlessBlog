# Auth Module Variables
# Requirements: 1.5, 4.1

variable "user_pool_name" {
  type        = string
  description = "Cognito User Pool name"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "mfa_configuration" {
  type        = string
  default     = "OPTIONAL"
  description = "MFA configuration (OFF, OPTIONAL, ON)"
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "MFA configuration must be 'OFF', 'OPTIONAL', or 'ON'"
  }
}

variable "password_minimum_length" {
  type        = number
  default     = 12
  description = "Minimum password length"
  validation {
    condition     = var.password_minimum_length >= 8 && var.password_minimum_length <= 99
    error_message = "Password minimum length must be between 8 and 99"
  }
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}

variable "create_e2e_test_user" {
  type        = bool
  default     = false
  description = "Create a Cognito user for post-deploy E2E tests (non-production only)"
}

variable "e2e_test_user_email" {
  type        = string
  default     = "e2e-admin@example.com"
  description = "Email (= username) of the E2E test user. example.com is reserved and cannot receive mail, which is intended: no message is ever delivered to it."
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.e2e_test_user_email))
    error_message = "e2e_test_user_email must be a valid email address."
  }
}
