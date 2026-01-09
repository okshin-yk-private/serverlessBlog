# Database Module Tests
# TDD: RED -> GREEN -> REFACTOR
# Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

# Test 1: Verify DynamoDB table is created with correct partition key
# Requirement 2.1: BlogPostsTable with partition key `id` (String)
run "table_partition_key" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.hash_key == "id"
    error_message = "DynamoDB table must have 'id' as partition key"
  }
}

# Test 2: Verify PAY_PER_REQUEST billing mode
# Requirement 2.2: PAY_PER_REQUEST billing mode
run "billing_mode" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.billing_mode == "PAY_PER_REQUEST"
    error_message = "DynamoDB table must use PAY_PER_REQUEST billing mode"
  }
}

# Test 3: Verify CategoryIndex GSI configuration
# Requirement 2.3: CategoryIndex GSI with partition key `category` and sort key `createdAt`
run "category_index_gsi" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = length([for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi if gsi.name == "CategoryIndex"]) == 1
    error_message = "DynamoDB table must have CategoryIndex GSI"
  }

  assert {
    condition     = [for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi.hash_key if gsi.name == "CategoryIndex"][0] == "category"
    error_message = "CategoryIndex GSI must have 'category' as partition key"
  }

  assert {
    condition     = [for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi.range_key if gsi.name == "CategoryIndex"][0] == "createdAt"
    error_message = "CategoryIndex GSI must have 'createdAt' as sort key"
  }
}

# Test 4: Verify PublishStatusIndex GSI configuration
# Requirement 2.4: PublishStatusIndex GSI with partition key `publishStatus` and sort key `createdAt`
run "publish_status_index_gsi" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = length([for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi if gsi.name == "PublishStatusIndex"]) == 1
    error_message = "DynamoDB table must have PublishStatusIndex GSI"
  }

  assert {
    condition     = [for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi.hash_key if gsi.name == "PublishStatusIndex"][0] == "publishStatus"
    error_message = "PublishStatusIndex GSI must have 'publishStatus' as partition key"
  }

  assert {
    condition     = [for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi.range_key if gsi.name == "PublishStatusIndex"][0] == "createdAt"
    error_message = "PublishStatusIndex GSI must have 'createdAt' as sort key"
  }
}

# Test 5: Verify Point-in-Time Recovery is enabled
# Requirement 2.5: Enable Point-in-Time Recovery
run "pitr_enabled" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
    enable_pitr = true
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.point_in_time_recovery[0].enabled == true
    error_message = "Point-in-Time Recovery must be enabled"
  }
}

# Test 6: Verify server-side encryption is enabled
# Requirement 2.6: Enable server-side encryption with AWS managed key
run "encryption_enabled" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.server_side_encryption[0].enabled == true
    error_message = "Server-side encryption must be enabled"
  }
}

# Test 7: Verify table name variable validation (3-255 characters)
run "table_name_validation_min" {
  command = plan

  variables {
    table_name  = "ab" # Less than 3 characters - should fail
    environment = "dev"
  }

  expect_failures = [
    var.table_name
  ]
}

# Test 8: Verify environment variable validation
run "environment_validation" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "staging" # Invalid environment - should fail
  }

  expect_failures = [
    var.environment
  ]
}

# Test 9: Verify outputs are correct
run "outputs" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = output.table_name == "test-blog-posts"
    error_message = "Output table_name must match input variable"
  }

  assert {
    condition     = output.category_index_name == "CategoryIndex"
    error_message = "Output category_index_name must be 'CategoryIndex'"
  }

  assert {
    condition     = output.publish_status_index_name == "PublishStatusIndex"
    error_message = "Output publish_status_index_name must be 'PublishStatusIndex'"
  }
}

# Test 10: Verify PITR can be disabled
run "pitr_disabled" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
    enable_pitr = false
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.point_in_time_recovery[0].enabled == false
    error_message = "Point-in-Time Recovery should be disabled when enable_pitr is false"
  }
}

# Test 11: Verify GSI projection type is ALL
run "gsi_projection_all" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = [for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi.projection_type if gsi.name == "CategoryIndex"][0] == "ALL"
    error_message = "CategoryIndex GSI must have projection type ALL"
  }

  assert {
    condition     = [for gsi in aws_dynamodb_table.blog_posts.global_secondary_index : gsi.projection_type if gsi.name == "PublishStatusIndex"][0] == "ALL"
    error_message = "PublishStatusIndex GSI must have projection type ALL"
  }
}

# Test 12: Verify tags are applied
run "tags_applied" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
    tags = {
      Project = "serverless-blog"
      Owner   = "devops"
    }
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.tags["Environment"] == "dev"
    error_message = "Environment tag must be applied"
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.tags["Project"] == "serverless-blog"
    error_message = "Custom Project tag must be applied"
  }
}

# Test 13: Verify deletion protection for production
run "deletion_protection_prd" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "prd"
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.deletion_protection_enabled == true
    error_message = "Deletion protection must be enabled for production environment"
  }
}

# Test 14: Verify deletion protection disabled for dev
run "deletion_protection_dev" {
  command = plan

  variables {
    table_name  = "test-blog-posts"
    environment = "dev"
  }

  assert {
    condition     = aws_dynamodb_table.blog_posts.deletion_protection_enabled == false
    error_message = "Deletion protection should be disabled for dev environment"
  }
}
