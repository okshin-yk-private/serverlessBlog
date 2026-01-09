# API Module Variables
# Requirements: 1.5, 5.1

variable "api_name" {
  type        = string
  description = "REST API name"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "stage_name" {
  type        = string
  description = "API stage name"
}

variable "cognito_user_pool_arn" {
  type        = string
  description = "Cognito User Pool ARN for Authorizer"
}

variable "cors_allow_origins" {
  type        = list(string)
  default     = ["*"]
  description = "CORS allowed origins"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
