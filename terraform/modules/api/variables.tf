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

variable "lambda_build_status_post_arn" {
  type        = string
  description = "Build Status Post Lambda function ARN"
}

variable "lambda_build_status_post_invoke_arn" {
  type        = string
  description = "Build Status Post Lambda function invoke ARN"
}

variable "lambda_get_post_by_slug_arn" {
  type        = string
  description = "Get Post By Slug Lambda function ARN"
}

variable "lambda_get_post_by_slug_invoke_arn" {
  type        = string
  description = "Get Post By Slug Lambda function invoke ARN"
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
# API Gateway Throttling
# ======================

variable "throttling_rate_limit" {
  description = "API Gateway default throttling rate limit (requests per second)"
  type        = number
  default     = 100
}

variable "throttling_burst_limit" {
  description = "API Gateway default throttling burst limit"
  type        = number
  default     = 200
}

# Method-level throttling for admin write endpoints (POST/PUT/PATCH/DELETE under
# /admin/...). These share nothing with the public GET methods, which stay on the
# stage-wide "all" setting above so the Astro SSG build (which calls the public API
# at build time) is never throttled by admin write traffic or vice versa.
#
# Sizing: the admin editor autosaves with a 1.5s debounce (~0.7 rps per open editor),
# and multi-image upload issues several upload-url requests at once (a handful of
# requests in a burst, not sustained). 10 rps / burst 20 comfortably covers several
# concurrent editors and a multi-image upload while capping a single abusive source
# far below the stage-wide 100 rps / burst 200, so it can no longer exhaust the shared
# budget and 429 every other API (including the rest of admin).
variable "admin_write_throttling_rate_limit" {
  description = "Throttling rate limit (requests per second) for admin write methods (POST/PUT/PATCH/DELETE under /admin/...). Must be positive and must not exceed throttling_rate_limit."
  type        = number
  default     = 10

  validation {
    condition     = var.admin_write_throttling_rate_limit > 0
    error_message = "admin_write_throttling_rate_limit must be a positive number."
  }

  validation {
    condition     = var.admin_write_throttling_rate_limit <= var.throttling_rate_limit
    error_message = "admin_write_throttling_rate_limit must not exceed throttling_rate_limit (the stage-wide limit)."
  }
}

variable "admin_write_throttling_burst_limit" {
  description = "Throttling burst limit for admin write methods (POST/PUT/PATCH/DELETE under /admin/...). Must be positive and must not exceed throttling_burst_limit."
  type        = number
  default     = 20

  validation {
    condition     = var.admin_write_throttling_burst_limit > 0
    error_message = "admin_write_throttling_burst_limit must be a positive number."
  }

  validation {
    condition     = var.admin_write_throttling_burst_limit <= var.throttling_burst_limit
    error_message = "admin_write_throttling_burst_limit must not exceed throttling_burst_limit (the stage-wide limit)."
  }
}

# ======================
# CloudWatch Logs Encryption
# ======================

variable "log_encryption_key_arn" {
  description = "KMS key ARN for encrypting API Gateway access logs (optional, null to disable)"
  type        = string
  default     = null
}
