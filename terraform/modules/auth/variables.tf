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
