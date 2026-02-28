# Terraform and Provider Version Constraints for bootstrap
# Requirements: 1.2, 1.3

terraform {
  required_version = "~> 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "serverless-blog"
      Purpose   = "Terraform State Management"
      ManagedBy = "Terraform"
    }
  }
}
