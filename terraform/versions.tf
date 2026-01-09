# Terraform and Provider Version Constraints
# Requirements: 1.2 - Terraform >= 1.14.0, AWS Provider >= 6.0

terraform {
  required_version = "~> 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
