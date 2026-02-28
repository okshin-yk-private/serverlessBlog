# Database Module Outputs
# Requirements: 2.1

output "table_name" {
  value       = aws_dynamodb_table.blog_posts.name
  description = "DynamoDB table name"
}

output "table_arn" {
  value       = aws_dynamodb_table.blog_posts.arn
  description = "DynamoDB table ARN"
}

output "table_id" {
  value       = aws_dynamodb_table.blog_posts.id
  description = "DynamoDB table ID"
}

output "category_index_name" {
  value       = "CategoryIndex"
  description = "CategoryIndex GSI name"
}

output "publish_status_index_name" {
  value       = "PublishStatusIndex"
  description = "PublishStatusIndex GSI name"
}

output "table_stream_arn" {
  value       = aws_dynamodb_table.blog_posts.stream_arn
  description = "DynamoDB table stream ARN (if enabled)"
}

#------------------------------------------------------------------------------
# Categories Table Outputs
# Requirements: Category Management Feature 1.1
#------------------------------------------------------------------------------

output "categories_table_name" {
  value       = aws_dynamodb_table.categories.name
  description = "Categories DynamoDB table name"
}

output "categories_table_arn" {
  value       = aws_dynamodb_table.categories.arn
  description = "Categories DynamoDB table ARN"
}

output "categories_table_id" {
  value       = aws_dynamodb_table.categories.id
  description = "Categories DynamoDB table ID"
}

output "categories_slug_index_name" {
  value       = "SlugIndex"
  description = "SlugIndex GSI name for Categories table"
}

#------------------------------------------------------------------------------
# Mindmaps Table Outputs
# Requirements: Mindmap Feature 4.1, 4.3, 9.5
#------------------------------------------------------------------------------

output "mindmaps_table_name" {
  value       = aws_dynamodb_table.mindmaps.name
  description = "Mindmaps DynamoDB table name"
}

output "mindmaps_table_arn" {
  value       = aws_dynamodb_table.mindmaps.arn
  description = "Mindmaps DynamoDB table ARN"
}

output "mindmaps_table_id" {
  value       = aws_dynamodb_table.mindmaps.id
  description = "Mindmaps DynamoDB table ID"
}

output "mindmaps_publish_status_index_name" {
  value       = "PublishStatusIndex"
  description = "PublishStatusIndex GSI name for Mindmaps table"
}
