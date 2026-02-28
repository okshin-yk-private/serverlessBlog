# API Module Outputs
# Requirements: 5.1

# REST API outputs
output "rest_api_id" {
  value       = aws_api_gateway_rest_api.main.id
  description = "REST API ID"
}

output "rest_api_execution_arn" {
  value       = aws_api_gateway_rest_api.main.execution_arn
  description = "REST API Execution ARN"
}

output "rest_api_root_resource_id" {
  value       = aws_api_gateway_rest_api.main.root_resource_id
  description = "REST API Root Resource ID"
}

# Stage outputs
output "api_endpoint" {
  value       = aws_api_gateway_stage.main.invoke_url
  description = "API endpoint URL"
}

output "stage_name" {
  value       = aws_api_gateway_stage.main.stage_name
  description = "API Gateway stage name"
}

# Authorizer outputs
output "authorizer_id" {
  value       = aws_api_gateway_authorizer.cognito.id
  description = "Cognito Authorizer ID"
}

# Resource outputs
output "admin_resource_id" {
  value       = aws_api_gateway_resource.admin.id
  description = "Admin resource ID"
}

output "posts_resource_id" {
  value       = aws_api_gateway_resource.posts.id
  description = "Posts resource ID"
}

output "admin_posts_resource_id" {
  value       = aws_api_gateway_resource.admin_posts.id
  description = "Admin Posts resource ID"
}

output "admin_posts_id_resource_id" {
  value       = aws_api_gateway_resource.admin_posts_id.id
  description = "Admin Posts {id} resource ID"
}

output "posts_id_resource_id" {
  value       = aws_api_gateway_resource.posts_id.id
  description = "Posts {id} resource ID"
}

output "admin_images_resource_id" {
  value       = aws_api_gateway_resource.admin_images.id
  description = "Admin Images resource ID"
}

output "admin_images_upload_url_resource_id" {
  value       = aws_api_gateway_resource.admin_images_upload_url.id
  description = "Admin Images upload-url resource ID"
}

output "admin_images_key_resource_id" {
  value       = aws_api_gateway_resource.admin_images_key.id
  description = "Admin Images {key+} resource ID"
}

output "admin_auth_resource_id" {
  value       = aws_api_gateway_resource.admin_auth.id
  description = "Admin Auth resource ID"
}

output "admin_auth_login_resource_id" {
  value       = aws_api_gateway_resource.admin_auth_login.id
  description = "Admin Auth login resource ID"
}

output "admin_auth_logout_resource_id" {
  value       = aws_api_gateway_resource.admin_auth_logout.id
  description = "Admin Auth logout resource ID"
}

output "admin_auth_refresh_resource_id" {
  value       = aws_api_gateway_resource.admin_auth_refresh.id
  description = "Admin Auth refresh resource ID"
}

# Request Validator output
output "request_validator_id" {
  value       = aws_api_gateway_request_validator.main.id
  description = "Request Validator ID"
}

# Deployment output
output "deployment_id" {
  value       = aws_api_gateway_deployment.main.id
  description = "Deployment ID"
}
