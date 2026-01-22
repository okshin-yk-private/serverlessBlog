variable "zone_name" {
  type        = string
  description = "Route53 hosted zone name (e.g., dev.boneofmyfallacy.net)"
}

variable "cloudfront_domain_name" {
  type        = string
  default     = ""
  description = "CloudFront distribution domain name (e.g., d1234567890.cloudfront.net)"
}

variable "cloudfront_hosted_zone_id" {
  type        = string
  default     = "Z2FDTNDATAQYW2"
  description = "CloudFront hosted zone ID (always Z2FDTNDATAQYW2 for CloudFront)"
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

variable "create_ipv6_records" {
  type        = bool
  default     = true
  description = "Whether to create AAAA (IPv6) alias records"
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
