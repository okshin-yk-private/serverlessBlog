# Outputs for Complete Deployment Example

#------------------------------------------------------------------------------
# CloudFront Outputs
#------------------------------------------------------------------------------

output "cloudfront_domain_name" {
  value       = module.cdn.distribution_domain_name
  description = "CloudFront distribution domain name"
}

output "cloudfront_distribution_id" {
  value       = module.cdn.distribution_id
  description = "CloudFront distribution ID"
}

output "public_site_url" {
  value       = module.cdn.public_site_url
  description = "Public site URL"
}

output "admin_site_url" {
  value       = module.cdn.admin_site_url
  description = "Admin site URL"
}

output "images_base_url" {
  value       = module.cdn.images_base_url
  description = "Images base URL"
}

output "api_base_url" {
  value       = module.cdn.api_base_url
  description = "API base URL (via CloudFront)"
}

#------------------------------------------------------------------------------
# API Gateway Outputs
#------------------------------------------------------------------------------

output "api_endpoint" {
  value       = module.api.api_endpoint
  description = "API Gateway endpoint URL (direct)"
}

output "rest_api_id" {
  value       = module.api.rest_api_id
  description = "REST API ID"
}

#------------------------------------------------------------------------------
# Database Outputs
#------------------------------------------------------------------------------

output "dynamodb_table_name" {
  value       = module.database.table_name
  description = "DynamoDB table name"
}

output "dynamodb_table_arn" {
  value       = module.database.table_arn
  description = "DynamoDB table ARN"
}

#------------------------------------------------------------------------------
# Auth Outputs
#------------------------------------------------------------------------------

output "cognito_user_pool_id" {
  value       = module.auth.user_pool_id
  description = "Cognito User Pool ID"
  sensitive   = true
}

output "cognito_user_pool_client_id" {
  value       = module.auth.user_pool_client_id
  description = "Cognito User Pool Client ID"
  sensitive   = true
}

#------------------------------------------------------------------------------
# Storage Outputs
#------------------------------------------------------------------------------

output "image_bucket_name" {
  value       = module.storage.image_bucket_name
  description = "Image storage bucket name"
}

output "public_site_bucket_name" {
  value       = module.storage.public_site_bucket_name
  description = "Public site bucket name"
}

output "admin_site_bucket_name" {
  value       = module.storage.admin_site_bucket_name
  description = "Admin site bucket name"
}

#------------------------------------------------------------------------------
# Lambda Outputs
#------------------------------------------------------------------------------

output "lambda_function_names" {
  value       = module.lambda.function_names
  description = "List of Lambda function names"
}

#------------------------------------------------------------------------------
# Monitoring Outputs
#------------------------------------------------------------------------------

output "alarm_topic_arn" {
  value       = module.monitoring.alarm_topic_arn
  description = "SNS topic ARN for alarms"
}

output "dashboard_name" {
  value       = module.monitoring.dashboard_name
  description = "CloudWatch dashboard name"
}
