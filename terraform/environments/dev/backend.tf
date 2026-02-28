# Terraform Backend Configuration for dev environment
# Requirements: 1.3 - S3 backend with native locking

# Partial backend configuration
# bucket is passed dynamically via: terraform init -backend-config="bucket=terraform-state-$(ACCOUNT_ID)"
terraform {
  backend "s3" {
    key          = "serverless-blog/dev/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3 native locking (Terraform 1.10+)
  }
}
