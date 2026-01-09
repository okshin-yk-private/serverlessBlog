# CDN Module Variables
# Requirements: 1.5, 7.1

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "image_bucket_name" {
  type        = string
  description = "Image bucket name"
}

variable "image_bucket_regional_domain_name" {
  type        = string
  description = "Image bucket regional domain name"
}

variable "public_site_bucket_name" {
  type        = string
  description = "Public site bucket name"
}

variable "public_site_bucket_regional_domain_name" {
  type        = string
  description = "Public site bucket regional domain name"
}

variable "admin_site_bucket_name" {
  type        = string
  description = "Admin site bucket name"
}

variable "admin_site_bucket_regional_domain_name" {
  type        = string
  description = "Admin site bucket regional domain name"
}

variable "rest_api_id" {
  type        = string
  description = "REST API ID for /api/* origin"
}

variable "api_stage_name" {
  type        = string
  description = "API Gateway stage name"
}

variable "aws_region" {
  type        = string
  description = "AWS region for API Gateway"
}

variable "price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class"
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Price class must be 'PriceClass_100', 'PriceClass_200', or 'PriceClass_All'"
  }
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
