# Terraform Backend Configuration for dev environment
# Requirements: 1.3 - S3 backend with native locking

# NOTE: Update bucket name after bootstrap execution
# The bucket name will be: terraform-state-{DEV_ACCOUNT_ID}

terraform {
  backend "s3" {
    # bucket       = "terraform-state-{DEV_ACCOUNT_ID}"  # Update after bootstrap
    key          = "serverless-blog/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3 native locking (Terraform 1.10+)
  }
}
