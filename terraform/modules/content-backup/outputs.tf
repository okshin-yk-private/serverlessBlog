# Content Backup Module - Outputs

output "bucket_name" {
  value       = aws_s3_bucket.backup.id
  description = "Backup bucket name"
}

output "bucket_region" {
  value       = var.backup_region
  description = "Backup bucket region"
}

output "function_name" {
  value       = aws_lambda_function.export.function_name
  description = "Export Lambda function name"
}
