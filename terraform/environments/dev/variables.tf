# Variables for dev environment
# Requirements: 1.5

variable "environment" {
  type        = string
  description = "Environment identifier"
  default     = "dev"
  validation {
    condition     = var.environment == "dev"
    error_message = "This configuration is for dev environment only"
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
  default     = ""
}

# Basic Authentication for dev environment protection
# These values should match CDK configuration
variable "basic_auth_username" {
  type        = string
  description = "Basic Auth username for dev environment"
  sensitive   = true
  default     = ""
}

variable "basic_auth_password" {
  type        = string
  description = "Basic Auth password for dev environment"
  sensitive   = true
  default     = ""
}

# Custom Domain Configuration
variable "enable_custom_domain" {
  type        = bool
  description = "Enable custom domain configuration (requires Cloudflare API token)"
  default     = false
}

variable "domain_name" {
  type        = string
  description = "Custom domain name for dev environment (e.g., dev.boneofmyfallacy.net)"
  default     = "dev.boneofmyfallacy.net"
}

variable "parent_domain" {
  type        = string
  description = "Parent domain managed by Cloudflare (e.g., boneofmyfallacy.net)"
  default     = "boneofmyfallacy.net"
}

variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token for DNS management"
  sensitive   = true
  default     = ""
}
