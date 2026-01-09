# Terraform Backend Configuration for prd environment
# Requirements: 1.3 - S3 backend with native locking

# NOTE: PRD uses a different AWS account
# Run bootstrap in the PRD account first, then update bucket name below

terraform {
  backend "s3" {
    # bucket       = "terraform-state-{PRD_ACCOUNT_ID}"  # Update after bootstrap in PRD account
    key          = "serverless-blog/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3 native locking (Terraform 1.10+)
  }
}
