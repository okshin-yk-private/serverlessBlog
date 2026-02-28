# Outputs for dev environment
# Requirements: 1.6

#------------------------------------------------------------------------------
# Environment Information
#------------------------------------------------------------------------------

output "environment" {
  value       = var.environment
  description = "Current environment"
}

output "project_name" {
  value       = var.project_name
  description = "Project name"
}

output "aws_region" {
  value       = var.aws_region
  description = "AWS region"
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

output "mindmaps_table_name" {
  value       = module.database.mindmaps_table_name
  description = "Mindmaps DynamoDB table name"
}

output "mindmaps_table_arn" {
  value       = module.database.mindmaps_table_arn
  description = "Mindmaps DynamoDB table ARN"
}

#------------------------------------------------------------------------------
# Auth Outputs
#------------------------------------------------------------------------------

output "cognito_user_pool_id" {
  value       = module.auth.user_pool_id
  description = "Cognito User Pool ID"
  sensitive   = true
}

output "cognito_user_pool_arn" {
  value       = module.auth.user_pool_arn
  description = "Cognito User Pool ARN"
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
  description = "Image bucket name"
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
# API Gateway Outputs
#------------------------------------------------------------------------------

output "api_endpoint" {
  value       = module.api.api_endpoint
  description = "API Gateway endpoint URL"
}

output "rest_api_id" {
  value       = module.api.rest_api_id
  description = "REST API ID"
}

#------------------------------------------------------------------------------
# CDN Outputs
#------------------------------------------------------------------------------

output "cloudfront_distribution_id" {
  value       = module.cdn.distribution_id
  description = "CloudFront distribution ID"
}

output "cloudfront_domain_name" {
  value       = module.cdn.distribution_domain_name
  description = "CloudFront domain name"
}

output "public_site_url" {
  value       = module.cdn.public_site_url
  description = "Public site URL"
}

output "admin_site_url" {
  value       = module.cdn.admin_site_url
  description = "Admin site URL"
}

output "api_base_url" {
  value       = module.cdn.api_base_url
  description = "API base URL via CloudFront"
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

output "dashboard_name" {
  value       = module.monitoring.dashboard_name
  description = "CloudWatch dashboard name"
}

#------------------------------------------------------------------------------
# CodeBuild Outputs
#------------------------------------------------------------------------------

output "codebuild_project_name" {
  value       = module.codebuild.codebuild_project_name
  description = "CodeBuild project name for Astro SSG builds"
}

output "codebuild_project_arn" {
  value       = module.codebuild.codebuild_project_arn
  description = "CodeBuild project ARN"
}

#------------------------------------------------------------------------------
# Custom Domain Outputs (when enabled)
#------------------------------------------------------------------------------

output "custom_domain_enabled" {
  value       = var.enable_custom_domain
  description = "Whether custom domain is enabled"
}

output "custom_domain_name" {
  value       = var.enable_custom_domain ? var.domain_name : null
  description = "Custom domain name"
}

output "custom_domain_url" {
  value       = var.enable_custom_domain ? "https://${var.domain_name}" : null
  description = "Custom domain URL"
}

output "route53_zone_id" {
  value       = var.enable_custom_domain ? module.dns_route53[0].zone_id : null
  description = "Route53 hosted zone ID for dev subdomain"
}

output "route53_name_servers" {
  value       = var.enable_custom_domain ? module.dns_route53[0].name_servers : null
  description = "Route53 nameservers (for Cloudflare NS delegation)"
}

output "acm_certificate_arn" {
  value       = var.enable_custom_domain ? module.acm[0].certificate_arn : null
  description = "ACM certificate ARN (us-east-1)"
}
