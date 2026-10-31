# Monitoring Module Variables
# Requirements: 1.5, 8.1

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "alarm_email" {
  type        = string
  description = "Email address for alarm notifications"
  sensitive   = true
}

variable "lambda_function_names" {
  type        = list(string)
  description = "List of Lambda function names to monitor"
}

variable "dynamodb_table_names" {
  type        = list(string)
  description = "List of DynamoDB table names to monitor"
}

variable "api_gateway_name" {
  type        = string
  description = "API Gateway name to monitor"
}

variable "api_gateway_stage" {
  type        = string
  description = "API Gateway stage to monitor"
}

variable "enable_alarms" {
  type        = bool
  default     = true
  description = "Enable CloudWatch alarms (recommended for prd)"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}

variable "codebuild_project_name" {
  type        = string
  default     = ""
  description = "Optional publishing CodeBuild project to monitor; empty disables its alarm"
}

variable "sitebuild_dlq_name" {
  type        = string
  default     = ""
  description = "Optional existing reconciliation DLQ name; empty disables its alarm"
}

variable "enable_publication_observability" {
  type        = bool
  default     = false
  description = "Extend the existing dashboard with bounded publication/API/backup views"
  validation {
    condition     = !var.enable_publication_observability || var.codebuild_project_name != ""
    error_message = "Publication observability requires an existing CodeBuild project."
  }
}
variable "publication_lambda_log_groups" {
  type        = list(string)
  default     = []
  description = "Exact existing coordinator caller log groups, never an account-wide SOURCE prefix"
  validation {
    condition     = alltrue([for name in var.publication_lambda_log_groups : can(regex("^/aws/lambda/[A-Za-z0-9_/-]+$", name))])
    error_message = "Use exact Lambda log group names without query syntax."
  }
}
