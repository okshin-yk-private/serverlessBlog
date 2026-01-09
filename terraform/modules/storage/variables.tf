# Storage Module Variables
# Requirements: 1.5, 3.1

variable "project_name" {
  type        = string
  description = "Project name (used as bucket name prefix)"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "enable_access_logs" {
  type        = bool
  default     = false
  description = "Enable access logging (recommended for prd)"
}

variable "cloudfront_distribution_arn" {
  type        = string
  default     = ""
  description = "CloudFront distribution ARN for OAC policy"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
