# Bootstrap Outputs
# Requirements: 1.3

output "state_bucket_name" {
  value       = aws_s3_bucket.terraform_state.bucket
  description = "State bucket name - use this in environments/*/backend.tf"
}

output "state_bucket_arn" {
  value       = aws_s3_bucket.terraform_state.arn
  description = "State bucket ARN"
}

output "account_id" {
  value       = data.aws_caller_identity.current.account_id
  description = "AWS Account ID"
}

output "backend_config" {
  value       = <<-EOT
    # Copy this to environments/{dev,prd}/backend.tf
    terraform {
      backend "s3" {
        bucket       = "${aws_s3_bucket.terraform_state.bucket}"
        key          = "serverless-blog/terraform.tfstate"
        region       = "${var.aws_region}"
        encrypt      = true
        use_lockfile = true
      }
    }
  EOT
  description = "Backend configuration to copy to environment backend.tf"
}
