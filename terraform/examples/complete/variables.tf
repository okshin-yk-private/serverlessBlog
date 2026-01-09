# Variables for Complete Deployment Example

#------------------------------------------------------------------------------
# Required Variables
#------------------------------------------------------------------------------

variable "project_name" {
  type        = string
  description = "Project name (used for resource naming)"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "ap-northeast-1"
}

variable "alarm_email" {
  type        = string
  description = "Email address for alarm notifications"
  sensitive   = true
}

#------------------------------------------------------------------------------
# Optional Variables - Defaults suitable for dev environment
#------------------------------------------------------------------------------

variable "enable_pitr" {
  type        = bool
  default     = true
  description = "Enable Point-in-Time Recovery for DynamoDB"
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
  description = "Minimum password length for Cognito"
}

variable "enable_access_logs" {
  type        = bool
  default     = false
  description = "Enable S3 access logging (recommended for prd)"
}

variable "cors_allow_origins" {
  type        = list(string)
  default     = ["*"]
  description = "CORS allowed origins"
}

variable "cloudfront_price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class"
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "Price class must be 'PriceClass_100', 'PriceClass_200', or 'PriceClass_All'"
  }
}

variable "enable_xray" {
  type        = bool
  default     = false
  description = "Enable X-Ray tracing for Lambda (recommended for prd)"
}

variable "enable_alarms" {
  type        = bool
  default     = false
  description = "Enable CloudWatch alarms (recommended for prd)"
}

variable "go_binary_path" {
  type        = string
  default     = "../../../../go-functions/bin"
  description = "Path to Go binaries"
}
