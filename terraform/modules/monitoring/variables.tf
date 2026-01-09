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
