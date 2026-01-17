# Database Module Variables
# Requirements: 1.5, 2.1

variable "table_name" {
  type        = string
  description = "Name of the DynamoDB table"
  validation {
    condition     = length(var.table_name) >= 3 && length(var.table_name) <= 255
    error_message = "Table name must be between 3 and 255 characters"
  }
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "enable_pitr" {
  type        = bool
  default     = true
  description = "Enable Point-in-Time Recovery for DynamoDB table"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}

#------------------------------------------------------------------------------
# Categories Table Variables
# Requirements: Category Management Feature 1.1
#------------------------------------------------------------------------------

variable "categories_table_name" {
  type        = string
  description = "Name of the Categories DynamoDB table"
  validation {
    condition     = length(var.categories_table_name) >= 3 && length(var.categories_table_name) <= 255
    error_message = "Categories table name must be between 3 and 255 characters"
  }
}
