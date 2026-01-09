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
