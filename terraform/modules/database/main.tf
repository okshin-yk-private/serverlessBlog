# Database Module - DynamoDB Tables
# Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6

# BlogPosts DynamoDB Table
# Requirement 2.1: DynamoDB table with partition key `id` (String)
# Requirement 2.2: PAY_PER_REQUEST billing mode
# Requirement 2.5: Point-in-Time Recovery enabled
# Requirement 2.6: Server-side encryption with AWS managed key
resource "aws_dynamodb_table" "blog_posts" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  # Partition key attribute
  attribute {
    name = "id"
    type = "S"
  }

  # GSI attributes
  attribute {
    name = "category"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "publishStatus"
    type = "S"
  }

  # Requirement 2.3: CategoryIndex GSI
  # Partition key: category, Sort key: createdAt
  global_secondary_index {
    name            = "CategoryIndex"
    hash_key        = "category"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # Requirement 2.4: PublishStatusIndex GSI
  # Partition key: publishStatus, Sort key: createdAt
  global_secondary_index {
    name            = "PublishStatusIndex"
    hash_key        = "publishStatus"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # Requirement 2.5: Point-in-Time Recovery
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Requirement 2.6: Server-side encryption (AWS managed key)
  server_side_encryption {
    enabled = true
  }

  # Prevent accidental deletion
  deletion_protection_enabled = var.environment == "prd" ? true : false

  # Tags
  tags = merge(
    {
      Name        = var.table_name
      Environment = var.environment
      Module      = "database"
      ManagedBy   = "terraform"
    },
    var.tags
  )

  lifecycle {
    prevent_destroy = false # Set to true in production via environment-specific configuration
  }
}
