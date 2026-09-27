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
#trivy:ignore:AVD-AWS-0132 SSE-S3 is sufficient for personal project tfstate; KMS adds cost overhead
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

# Deny any request that does not use TLS (AWS FSBP S3.5 baseline).
resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# Note: DynamoDB lock table is NOT needed
# Terraform 1.10+ supports S3 native locking via use_lockfile = true
# The lock file is stored as: {key}.tflock in the same S3 bucket
