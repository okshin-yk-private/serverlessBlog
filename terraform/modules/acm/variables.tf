variable "domain_name" {
  type        = string
  description = "Primary domain name for the certificate (e.g., example.com or dev.example.com)"
}

variable "subject_alternative_names" {
  type        = list(string)
  default     = []
  description = "Additional domain names (SANs) for the certificate. Defaults to wildcard of primary domain."
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"

  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'."
  }
}

variable "project_name" {
  type        = string
  default     = "serverless-blog"
  description = "Project name for resource naming and tagging"
}

variable "wait_for_validation" {
  type        = bool
  default     = false
  description = "Whether to wait for certificate validation to complete. Set to true only after DNS validation records are created."
}

variable "validation_record_fqdns" {
  type        = list(string)
  default     = []
  description = "List of FQDNs for DNS validation records. Required when wait_for_validation is true."
}

variable "validation_timeout" {
  type        = string
  default     = "45m"
  description = "Timeout for certificate validation (e.g., '30m', '1h')"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
