# Terraform Backend Configuration for dev environment
# Requirements: 1.3 - S3 backend with native locking

terraform {
  backend "s3" {
    bucket       = "terraform-state-881302602065"
    key          = "serverless-blog/dev/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # S3 native locking (Terraform 1.10+)
  }
}
