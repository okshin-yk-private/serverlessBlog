# CodeBuild Module Variables
# Requirements: 8.5, 9.5, 9.6 (Astro SSG Migration spec)

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "serverless-blog"
}

variable "environment" {
  type        = string
  description = "Environment identifier (dev, prd)"
  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "Environment must be 'dev' or 'prd'"
  }
}

variable "public_site_bucket_name" {
  type        = string
  description = "S3 bucket name for public site deployment"
}

variable "public_site_bucket_arn" {
  type        = string
  description = "S3 bucket ARN for public site deployment (used in IAM policy)"
}

variable "cloudfront_distribution_id" {
  type        = string
  description = "CloudFront distribution ID for cache invalidation"
}

variable "api_url" {
  type        = string
  description = "API URL for Astro build (PUBLIC_API_URL environment variable)"
}

variable "build_timeout" {
  type        = number
  description = "Build timeout in minutes"
  default     = 15
  validation {
    condition     = var.build_timeout >= 5 && var.build_timeout <= 60
    error_message = "Build timeout must be between 5 and 60 minutes"
  }
}

variable "compute_type" {
  type        = string
  description = "CodeBuild compute type"
  default     = "BUILD_GENERAL1_SMALL"
  validation {
    condition     = contains(["BUILD_GENERAL1_SMALL", "BUILD_GENERAL1_MEDIUM", "BUILD_GENERAL1_LARGE"], var.compute_type)
    error_message = "Compute type must be BUILD_GENERAL1_SMALL, BUILD_GENERAL1_MEDIUM, or BUILD_GENERAL1_LARGE"
  }
}

variable "github_repo" {
  type        = string
  description = "GitHub repository URL (optional - for GitHub source)"
  default     = ""
}

variable "github_branch" {
  type        = string
  description = "GitHub branch to build (optional - for GitHub source)"
  default     = "main"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags for resources"
}
