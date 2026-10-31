# Content Backup Module - Variables

variable "project_name" {
  type        = string
  description = "Project name (used as prefix for resource names)"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "source_region" {
  type        = string
  description = "Region of the source tables and the export Lambda"
}

variable "backup_region" {
  type        = string
  default     = "ap-northeast-3"
  description = "Region of the backup bucket. Must differ from source_region."
  validation {
    condition     = var.backup_region != var.source_region
    error_message = "backup_region must differ from source_region, or the backup does not survive a regional outage."
  }
}

variable "posts_table_name" {
  type        = string
  description = "BlogPosts DynamoDB table name"
}

variable "posts_table_arn" {
  type        = string
  description = "BlogPosts DynamoDB table ARN"
}

variable "categories_table_name" {
  type        = string
  description = "Categories DynamoDB table name"
}

variable "categories_table_arn" {
  type        = string
  description = "Categories DynamoDB table ARN"
}

variable "go_binary_path" {
  type        = string
  default     = "../../go-functions/bin"
  description = "Path to Go binaries"
}

variable "object_lock_mode" {
  type        = string
  description = <<-EOT
    Default Object Lock retention mode. COMPLIANCE: no one, root included, can delete
    or shorten a locked version until it expires, and the bucket cannot be deleted
    until every version has expired. GOVERNANCE: principals with
    s3:BypassGovernanceRetention can delete early (use for dev).
  EOT
  validation {
    condition     = contains(["COMPLIANCE", "GOVERNANCE"], var.object_lock_mode)
    error_message = "object_lock_mode must be COMPLIANCE or GOVERNANCE"
  }
}

variable "retention_days" {
  type        = number
  description = "Default Object Lock retention, in days, for every snapshot object. Cannot be shortened for versions already written in COMPLIANCE mode."
  validation {
    condition     = var.retention_days >= 1 && var.retention_days <= 90
    error_message = "retention_days must be between 1 and 90. A longer COMPLIANCE retention cannot be undone."
  }
}

variable "force_destroy" {
  type        = bool
  default     = false
  description = "Allow terraform destroy to delete objects. Only bypasses GOVERNANCE locks; COMPLIANCE-locked versions still block bucket deletion."
}

variable "schedule_expression" {
  type        = string
  default     = "cron(0 3 * * ? *)"
  description = "EventBridge Scheduler expression for the daily export"
}

variable "schedule_timezone" {
  type        = string
  default     = "Asia/Tokyo"
  description = "Time zone for schedule_expression"
}

variable "enable_xray" {
  type        = bool
  default     = false
  description = "Enable X-Ray tracing on the export Lambda"
}

# A separate flag, because count cannot depend on a topic ARN that is unknown
# until the monitoring module is applied.
variable "enable_alarm" {
  type        = bool
  default     = false
  description = "Create the export failure alarm"
}

variable "alarm_topic_arn" {
  type        = string
  default     = ""
  description = "SNS topic ARN notified by the export failure alarm (required when enable_alarm is true)"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for all resources"
}
