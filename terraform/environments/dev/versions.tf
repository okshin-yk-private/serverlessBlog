# Terraform and Provider Version Constraints for dev environment
# Requirements: 1.2

terraform {
  required_version = "~> 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Primary AWS provider (ap-northeast-1)
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# AWS provider for ACM certificates (us-east-1 required for CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Cloudflare provider for DNS management
# Note: When enable_custom_domain is false, no Cloudflare resources are created (count=0),
# but the provider still validates the token format. Use a dummy 40-char placeholder
# when the feature is disabled to allow CI to run without Cloudflare credentials.
provider "cloudflare" {
  api_token = var.enable_custom_domain ? var.cloudflare_api_token : "placeholder-token-for-disabled-feature00"
}
