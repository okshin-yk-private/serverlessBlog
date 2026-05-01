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

  # GSI attribute for slug lookup (writer-experience overhaul)
  attribute {
    name = "slug"
    type = "S"
  }

  # Requirement 2.3: CategoryIndex GSI
  # Partition key: category, Sort key: createdAt
  global_secondary_index {
    name            = "CategoryIndex"
    projection_type = "ALL"
    key_schema {
      attribute_name = "category"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }

  # Requirement 2.4: PublishStatusIndex GSI
  # Partition key: publishStatus, Sort key: createdAt
  global_secondary_index {
    name            = "PublishStatusIndex"
    projection_type = "ALL"
    key_schema {
      attribute_name = "publishStatus"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }

  # SlugIndex GSI for friendly URL lookup and uniqueness enforcement
  # Partition key: slug, Projection: ALL (Astro getStaticPaths reads full post by slug)
  # Items without slug attribute are simply absent from this index, which is fine
  # for legacy items pending backfill.
  global_secondary_index {
    name            = "SlugIndex"
    projection_type = "ALL"
    key_schema {
      attribute_name = "slug"
      key_type       = "HASH"
    }
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

#------------------------------------------------------------------------------
# Categories DynamoDB Table
# Requirements: Category Management Feature
# - 1.1: Partition key `id` (String)
# - 1.2: PAY_PER_REQUEST billing mode
# - 1.4: Point-in-Time Recovery enabled
# - 1.5: Server-side encryption with AWS managed key
# - 1.6: SlugIndex GSI with partition key `slug` (KEYS_ONLY)
#------------------------------------------------------------------------------

resource "aws_dynamodb_table" "categories" {
  name         = var.categories_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  # Partition key attribute
  attribute {
    name = "id"
    type = "S"
  }

  # GSI attribute for slug lookup
  attribute {
    name = "slug"
    type = "S"
  }

  # Requirement 1.6: SlugIndex GSI for unique slug lookup
  # Partition key: slug, Projection: KEYS_ONLY
  global_secondary_index {
    name            = "SlugIndex"
    projection_type = "KEYS_ONLY"
    key_schema {
      attribute_name = "slug"
      key_type       = "HASH"
    }
  }

  # Requirement 1.4: Point-in-Time Recovery
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Requirement 1.5: Server-side encryption (AWS managed key)
  server_side_encryption {
    enabled = true
  }

  # Prevent accidental deletion in production
  deletion_protection_enabled = var.environment == "prd" ? true : false

  # Tags
  tags = merge(
    {
      Name        = var.categories_table_name
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

#------------------------------------------------------------------------------
# Mindmaps DynamoDB Table
# Requirements: Mindmap Feature
# - 4.1: Partition key `id` (String, UUID)
# - 4.3: PublishStatusIndex GSI for efficient public mindmap queries
# - 9.5: Terraform module definition
#------------------------------------------------------------------------------

resource "aws_dynamodb_table" "mindmaps" {
  name         = var.mindmaps_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  # Partition key attribute
  attribute {
    name = "id"
    type = "S"
  }

  # GSI attributes
  attribute {
    name = "publishStatus"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # PublishStatusIndex GSI
  # Partition key: publishStatus, Sort key: createdAt
  # Used to efficiently query published mindmaps
  global_secondary_index {
    name            = "PublishStatusIndex"
    projection_type = "ALL"
    key_schema {
      attribute_name = "publishStatus"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }

  # Point-in-Time Recovery
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Server-side encryption (AWS managed key)
  server_side_encryption {
    enabled = true
  }

  # Prevent accidental deletion in production
  deletion_protection_enabled = var.environment == "prd" ? true : false

  # Tags
  tags = merge(
    {
      Name        = var.mindmaps_table_name
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
