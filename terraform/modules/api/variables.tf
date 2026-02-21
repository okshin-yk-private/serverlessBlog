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

# ======================
# Categories Lambda Function ARNs
# ======================

variable "lambda_list_categories_arn" {
  type        = string
  description = "List Categories Lambda function ARN"
}

variable "lambda_list_categories_invoke_arn" {
  type        = string
  description = "List Categories Lambda function invoke ARN"
}

variable "lambda_create_category_arn" {
  type        = string
  description = "Create Category Lambda function ARN"
}

variable "lambda_create_category_invoke_arn" {
  type        = string
  description = "Create Category Lambda function invoke ARN"
}

variable "lambda_update_category_arn" {
  type        = string
  description = "Update Category Lambda function ARN"
}

variable "lambda_update_category_invoke_arn" {
  type        = string
  description = "Update Category Lambda function invoke ARN"
}

variable "lambda_update_categories_sort_order_arn" {
  type        = string
  description = "Update Categories Sort Order Lambda function ARN"
}

variable "lambda_update_categories_sort_order_invoke_arn" {
  type        = string
  description = "Update Categories Sort Order Lambda function invoke ARN"
}

variable "lambda_delete_category_arn" {
  type        = string
  description = "Delete Category Lambda function ARN"
}

variable "lambda_delete_category_invoke_arn" {
  type        = string
  description = "Delete Category Lambda function invoke ARN"
}

# ======================
# Mindmaps Lambda Function ARNs
# ======================

variable "lambda_create_mindmap_arn" {
  type        = string
  description = "Create Mindmap Lambda function ARN"
}

variable "lambda_create_mindmap_invoke_arn" {
  type        = string
  description = "Create Mindmap Lambda function invoke ARN"
}

variable "lambda_get_mindmap_arn" {
  type        = string
  description = "Get Mindmap Lambda function ARN"
}

variable "lambda_get_mindmap_invoke_arn" {
  type        = string
  description = "Get Mindmap Lambda function invoke ARN"
}

variable "lambda_list_mindmaps_arn" {
  type        = string
  description = "List Mindmaps Lambda function ARN"
}

variable "lambda_list_mindmaps_invoke_arn" {
  type        = string
  description = "List Mindmaps Lambda function invoke ARN"
}

variable "lambda_update_mindmap_arn" {
  type        = string
  description = "Update Mindmap Lambda function ARN"
}

variable "lambda_update_mindmap_invoke_arn" {
  type        = string
  description = "Update Mindmap Lambda function invoke ARN"
}

variable "lambda_delete_mindmap_arn" {
  type        = string
  description = "Delete Mindmap Lambda function ARN"
}

variable "lambda_delete_mindmap_invoke_arn" {
  type        = string
  description = "Delete Mindmap Lambda function invoke ARN"
}

variable "lambda_get_public_mindmap_arn" {
  type        = string
  description = "Get Public Mindmap Lambda function ARN"
}

variable "lambda_get_public_mindmap_invoke_arn" {
  type        = string
  description = "Get Public Mindmap Lambda function invoke ARN"
}

variable "lambda_list_public_mindmaps_arn" {
  type        = string
  description = "List Public Mindmaps Lambda function ARN"
}

variable "lambda_list_public_mindmaps_invoke_arn" {
  type        = string
  description = "List Public Mindmaps Lambda function invoke ARN"
}

# ======================
# CloudWatch Logs Encryption
# ======================

variable "log_encryption_key_arn" {
  description = "KMS key ARN for encrypting API Gateway access logs (optional, null to disable)"
  type        = string
  default     = null
}
