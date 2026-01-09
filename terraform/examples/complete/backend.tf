# Backend Configuration for Complete Example
#
# IMPORTANT: Update the bucket name with your actual state bucket name
# Run `cd terraform/bootstrap && terraform output state_bucket_name` to get it

terraform {
  backend "s3" {
    bucket       = "terraform-state-YOUR_ACCOUNT_ID" # Replace with your bucket name
    key          = "serverless-blog-example/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
