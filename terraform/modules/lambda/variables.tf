# Lambda Module Variables
# Requirements: 1.5, 6.1

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "table_name" {
  type        = string
  description = "DynamoDB table name"
}

variable "table_arn" {
  type        = string
  description = "DynamoDB table ARN"
}

variable "bucket_name" {
  type        = string
  description = "S3 bucket name for images"
}

variable "bucket_arn" {
  type        = string
  description = "S3 bucket ARN for images"
}

variable "user_pool_id" {
  type        = string
  description = "Cognito User Pool ID"
}

variable "user_pool_arn" {
  type        = string
  description = "Cognito User Pool ARN for IAM policy"
}

variable "user_pool_client_id" {
  type        = string
  description = "Cognito User Pool Client ID"
}

variable "cloudfront_domain" {
  type        = string
  description = "CloudFront domain name"
}

variable "enable_xray" {
  type        = bool
  default     = false
  description = "Enable X-Ray tracing (recommended for prd)"
}

variable "go_binary_path" {
  type        = string
  default     = "../../go-functions/bin"
  description = "Path to Go binaries"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
