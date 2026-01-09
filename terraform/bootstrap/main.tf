# Bootstrap - State Backend Initialization
# Requirements: 1.3 - S3 bucket for Terraform state with native locking
#
# This module creates the S3 bucket for Terraform state storage.
# DynamoDB is NOT required as we use S3 native locking (use_lockfile = true).
#
# Usage:
#   cd terraform/bootstrap
#   AWS_PROFILE=dev terraform init
#   AWS_PROFILE=dev terraform apply

data "aws_caller_identity" "current" {}

locals {
  state_bucket_name = "terraform-state-${data.aws_caller_identity.current.account_id}"
}

# S3 Bucket for Terraform State
resource "aws_s3_bucket" "terraform_state" {
  bucket = local.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

# Enable versioning for state file history
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption with SSE-S3
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Note: DynamoDB lock table is NOT needed
# Terraform 1.10+ supports S3 native locking via use_lockfile = true
# The lock file is stored as: {key}.tflock in the same S3 bucket
