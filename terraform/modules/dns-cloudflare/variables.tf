variable "zone_name" {
  type        = string
  description = "Cloudflare zone name (e.g., boneofmyfallacy.net)"
}

variable "cloudfront_domain_name" {
  type        = string
  default     = ""
  description = "CloudFront distribution domain name (e.g., d1234567890.cloudfront.net)"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"

  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'."
  }
}

variable "create_apex_record" {
  type        = bool
  default     = false
  description = "Whether to create apex domain record pointing to CloudFront"
}

variable "create_www_record" {
  type        = bool
  default     = false
  description = "Whether to create www subdomain record pointing to CloudFront"
}

variable "subdomain_to_delegate" {
  type        = string
  default     = ""
  description = "Subdomain to delegate to Route53 (e.g., 'dev'). Empty string means no delegation."
}

variable "enable_ns_delegation" {
  type        = bool
  default     = false
  description = "Enable NS delegation to Route53. Set to true when route53_ns_records are provided."
}

variable "route53_ns_records" {
  type        = list(string)
  default     = []
  description = "Route53 nameserver records for subdomain delegation"
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
