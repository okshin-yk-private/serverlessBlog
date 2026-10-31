# Content Backup Module - Terraform and Provider Versions

terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # 6.0 adds the per-resource `region` argument used for the backup bucket.
      version = ">= 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.0"
    }
  }
}
