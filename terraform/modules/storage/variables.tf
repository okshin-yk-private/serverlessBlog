# Storage Module Variables
# Requirements: 1.5, 3.1

variable "project_name" {
  type        = string
  description = "Project name (used as bucket name prefix)"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "enable_access_logs" {
  type        = bool
  default     = false
  description = "Enable access logging (recommended for prd)"
}

variable "cloudfront_distribution_arn" {
  type        = string
  default     = ""
  description = "CloudFront distribution ARN for OAC policy"
}

variable "cloudfront_log_delivery_source_arns" {
  type        = list(string)
  default     = []
  description = <<-EOT
    ARNs of the CloudWatch Logs delivery sources (arn:aws:logs:<region>:<account-id>:delivery-source:<name>)
    allowed to write CloudFront standard logging v2 (CloudWatch vended logs) into this
    bucket's cloudfront/ prefix. Empty (default) adds no Allow statement, so no bucket
    policy access is granted. Only meaningful when enable_access_logs is true; the caller
    computes these ARNs from the delivery source name and account ID rather than reading
    them from the delivery source resource itself, to avoid a circular module dependency
    (this bucket policy must exist before, or independently of, the CDN module that owns
    the CloudFront distribution the delivery source is attached to).
  EOT
}

variable "cors_allow_origins" {
  type        = list(string)
  default     = ["*"]
  description = "CORS allowed origins for S3 image bucket"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
