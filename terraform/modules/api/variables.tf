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

# ======================
# Lambda Function ARNs
# ======================

variable "lambda_create_post_arn" {
  type        = string
  description = "Create Post Lambda function ARN"
}

variable "lambda_create_post_invoke_arn" {
  type        = string
  description = "Create Post Lambda function invoke ARN"
}

variable "lambda_list_posts_arn" {
  type        = string
  description = "List Posts Lambda function ARN"
}

variable "lambda_list_posts_invoke_arn" {
  type        = string
  description = "List Posts Lambda function invoke ARN"
}

variable "lambda_get_post_arn" {
  type        = string
  description = "Get Post Lambda function ARN"
}

variable "lambda_get_post_invoke_arn" {
  type        = string
  description = "Get Post Lambda function invoke ARN"
}

variable "lambda_get_public_post_arn" {
  type        = string
  description = "Get Public Post Lambda function ARN"
}

variable "lambda_get_public_post_invoke_arn" {
  type        = string
  description = "Get Public Post Lambda function invoke ARN"
}

variable "lambda_update_post_arn" {
  type        = string
  description = "Update Post Lambda function ARN"
}

variable "lambda_update_post_invoke_arn" {
  type        = string
  description = "Update Post Lambda function invoke ARN"
}

variable "lambda_delete_post_arn" {
  type        = string
  description = "Delete Post Lambda function ARN"
}

variable "lambda_delete_post_invoke_arn" {
  type        = string
  description = "Delete Post Lambda function invoke ARN"
}

variable "lambda_login_arn" {
  type        = string
  description = "Login Lambda function ARN"
}

variable "lambda_login_invoke_arn" {
  type        = string
  description = "Login Lambda function invoke ARN"
}

variable "lambda_logout_arn" {
  type        = string
  description = "Logout Lambda function ARN"
}

variable "lambda_logout_invoke_arn" {
  type        = string
  description = "Logout Lambda function invoke ARN"
}

variable "lambda_refresh_arn" {
  type        = string
  description = "Refresh Lambda function ARN"
}

variable "lambda_refresh_invoke_arn" {
  type        = string
  description = "Refresh Lambda function invoke ARN"
}

variable "lambda_get_upload_url_arn" {
  type        = string
  description = "Get Upload URL Lambda function ARN"
}

variable "lambda_get_upload_url_invoke_arn" {
  type        = string
  description = "Get Upload URL Lambda function invoke ARN"
}

variable "lambda_delete_image_arn" {
  type        = string
  description = "Delete Image Lambda function ARN"
}

variable "lambda_delete_image_invoke_arn" {
  type        = string
  description = "Delete Image Lambda function invoke ARN"
}
