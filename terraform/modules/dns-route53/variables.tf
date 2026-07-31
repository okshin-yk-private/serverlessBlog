variable "zone_name" {
  type        = string
  description = "Route53 hosted zone name (e.g., dev.boneofmyfallacy.net)"
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

variable "acm_domain_validation_options" {
  type = list(object({
    domain_name           = string
    resource_record_name  = string
    resource_record_type  = string
    resource_record_value = string
  }))
  default     = []
  description = "ACM certificate DNS validation options. Comes from aws_acm_certificate.domain_validation_options"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
