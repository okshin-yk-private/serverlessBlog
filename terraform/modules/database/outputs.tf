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
