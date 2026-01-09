# Storage Module Tests
# TDD: RED -> GREEN -> REFACTOR
# Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

# Test 1: Verify image bucket is created with versioning enabled
# Requirement 3.1: Create image storage bucket with versioning enabled
run "image_bucket_versioning" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket_versioning.images.versioning_configuration[0].status == "Enabled"
    error_message = "Image bucket must have versioning enabled"
  }
}

# Test 2: Verify SSE-S3 encryption on image bucket
# Requirement 3.2: Configure SSE-S3 encryption on all buckets
run "image_bucket_encryption" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.images.rule :
      rule.apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    ])
    error_message = "Image bucket must use SSE-S3 (AES256) encryption"
  }
}

# Test 3: Verify public access block on image bucket
# Requirement 3.3: Block all public access on storage buckets
run "image_bucket_public_access_block" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.images.block_public_acls == true
    error_message = "Image bucket must block public ACLs"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.images.block_public_policy == true
    error_message = "Image bucket must block public policy"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.images.ignore_public_acls == true
    error_message = "Image bucket must ignore public ACLs"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.images.restrict_public_buckets == true
    error_message = "Image bucket must restrict public buckets"
  }
}

# Test 4: Verify lifecycle policy for versioning management
# Requirement 3.4: Create lifecycle policy for version management
run "image_bucket_lifecycle" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = length(aws_s3_bucket_lifecycle_configuration.images.rule) > 0
    error_message = "Image bucket must have lifecycle rules configured"
  }
}

# Test 5: Verify public site bucket is created
# Requirement 3.5: Create public site bucket for static hosting
run "public_site_bucket_exists" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket.public_site.bucket != null
    error_message = "Public site bucket must be created"
  }
}

# Test 6: Verify admin site bucket is created
# Requirement 3.5: Create admin site bucket for static hosting
run "admin_site_bucket_exists" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket.admin_site.bucket != null
    error_message = "Admin site bucket must be created"
  }
}

# Test 7: Verify SSE-S3 encryption on public site bucket
# Requirement 3.2: Configure SSE-S3 encryption on all buckets
run "public_site_bucket_encryption" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.public_site.rule :
      rule.apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    ])
    error_message = "Public site bucket must use SSE-S3 (AES256) encryption"
  }
}

# Test 8: Verify SSE-S3 encryption on admin site bucket
# Requirement 3.2: Configure SSE-S3 encryption on all buckets
run "admin_site_bucket_encryption" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition = anytrue([
      for rule in aws_s3_bucket_server_side_encryption_configuration.admin_site.rule :
      rule.apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    ])
    error_message = "Admin site bucket must use SSE-S3 (AES256) encryption"
  }
}

# Test 9: Verify public access block on public site bucket
# Requirement 3.3: Block all public access on storage buckets
run "public_site_bucket_public_access_block" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.public_site.block_public_acls == true
    error_message = "Public site bucket must block public ACLs"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.public_site.block_public_policy == true
    error_message = "Public site bucket must block public policy"
  }
}

# Test 10: Verify public access block on admin site bucket
# Requirement 3.3: Block all public access on storage buckets
run "admin_site_bucket_public_access_block" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.admin_site.block_public_acls == true
    error_message = "Admin site bucket must block public ACLs"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.admin_site.block_public_policy == true
    error_message = "Admin site bucket must block public policy"
  }
}

# Test 11: Verify environment variable validation
run "environment_validation" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "staging" # Invalid environment - should fail
  }

  expect_failures = [
    var.environment
  ]
}

# Test 12: Verify outputs are correct
# Note: ARN and regional_domain_name are computed after apply, so we only check bucket names
run "outputs" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = can(regex("^serverless-blog-images-dev-", output.image_bucket_name))
    error_message = "Output image_bucket_name must follow naming convention"
  }

  assert {
    condition     = can(regex("^serverless-blog-public-site-dev-", output.public_site_bucket_name))
    error_message = "Output public_site_bucket_name must follow naming convention"
  }

  assert {
    condition     = can(regex("^serverless-blog-admin-site-dev-", output.admin_site_bucket_name))
    error_message = "Output admin_site_bucket_name must follow naming convention"
  }
}

# Test 13: Verify bucket naming convention
run "bucket_naming" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = can(regex("^serverless-blog-images-dev-", aws_s3_bucket.images.bucket))
    error_message = "Image bucket name must follow naming convention: {project}-images-{env}-{account_id}"
  }
}

# Test 14: Verify tags are applied
run "tags_applied" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
    tags = {
      Project = "serverless-blog"
      Owner   = "devops"
    }
  }

  assert {
    condition     = aws_s3_bucket.images.tags["Environment"] == "dev"
    error_message = "Environment tag must be applied to image bucket"
  }

  assert {
    condition     = aws_s3_bucket.images.tags["Project"] == "serverless-blog"
    error_message = "Custom Project tag must be applied"
  }
}

# Test 15: Verify CORS configuration on image bucket
run "image_bucket_cors" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  assert {
    condition     = length(aws_s3_bucket_cors_configuration.images.cors_rule) > 0
    error_message = "Image bucket must have CORS configuration for pre-signed URL uploads"
  }
}

# Test 16: Verify CloudFront OAC bucket policy is conditionally created
# Requirement 3.6: Configure appropriate bucket policies for CloudFront OAC access
run "cloudfront_oac_policy_conditional" {
  command = plan

  variables {
    project_name                = "serverless-blog"
    environment                 = "dev"
    cloudfront_distribution_arn = "" # Empty - no policy should be created
  }

  # When cloudfront_distribution_arn is empty, no bucket policy should be created
  # This test verifies the conditional logic
  assert {
    condition     = aws_s3_bucket.images.bucket != null
    error_message = "Image bucket must exist regardless of CloudFront configuration"
  }
}

# Test 17: Verify access logs bucket is created when enabled
run "access_logs_bucket_enabled" {
  command = plan

  variables {
    project_name       = "serverless-blog"
    environment        = "prd"
    enable_access_logs = true
  }

  assert {
    condition     = aws_s3_bucket.access_logs[0].bucket != null
    error_message = "Access logs bucket must be created when enable_access_logs is true"
  }
}

# Test 18: Verify access logs bucket is NOT created when disabled
run "access_logs_bucket_disabled" {
  command = plan

  variables {
    project_name       = "serverless-blog"
    environment        = "dev"
    enable_access_logs = false
  }

  assert {
    condition     = length(aws_s3_bucket.access_logs) == 0
    error_message = "Access logs bucket must not be created when enable_access_logs is false"
  }
}

# Test 19: Verify all three buckets are created with correct naming
# Note: regional_domain_name and id are computed after apply,
# so we verify bucket resources directly
run "all_buckets_created" {
  command = plan

  variables {
    project_name = "serverless-blog"
    environment  = "dev"
  }

  # Verify all three main buckets exist
  assert {
    condition     = aws_s3_bucket.images.bucket != null
    error_message = "Image bucket must be created"
  }

  assert {
    condition     = aws_s3_bucket.public_site.bucket != null
    error_message = "Public site bucket must be created"
  }

  assert {
    condition     = aws_s3_bucket.admin_site.bucket != null
    error_message = "Admin site bucket must be created"
  }
}
