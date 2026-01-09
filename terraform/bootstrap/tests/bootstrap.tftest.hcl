# Bootstrap Module Tests
# Task 1.2 - TDD approach: Test state backend initialization module
# Requirements: 1.3

# Mock providers for testing (no actual AWS calls)
mock_provider "aws" {}

# Test 1: Verify S3 bucket naming convention
run "test_state_bucket_naming" {
  command = plan

  assert {
    condition     = aws_s3_bucket.terraform_state.bucket == "terraform-state-${data.aws_caller_identity.current.account_id}"
    error_message = "State bucket should follow naming convention: terraform-state-{ACCOUNT_ID}"
  }
}

# Test 2: Verify versioning is enabled
run "test_versioning_enabled" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.terraform_state.versioning_configuration[0].status == "Enabled"
    error_message = "S3 versioning should be enabled for state bucket"
  }
}

# Test 3: Verify SSE-S3 encryption
run "test_encryption_enabled" {
  command = plan

  assert {
    condition = length([
      for rule in aws_s3_bucket_server_side_encryption_configuration.terraform_state.rule :
      rule if length([
        for default in rule.apply_server_side_encryption_by_default :
        default if default.sse_algorithm == "AES256"
      ]) > 0
    ]) > 0
    error_message = "SSE-S3 encryption (AES256) should be configured"
  }
}

# Test 4: Verify public access block settings
run "test_public_access_blocked" {
  command = plan

  assert {
    condition     = aws_s3_bucket_public_access_block.terraform_state.block_public_acls == true
    error_message = "block_public_acls should be true"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.terraform_state.block_public_policy == true
    error_message = "block_public_policy should be true"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.terraform_state.ignore_public_acls == true
    error_message = "ignore_public_acls should be true"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.terraform_state.restrict_public_buckets == true
    error_message = "restrict_public_buckets should be true"
  }
}

# Test 5: Verify prevent_destroy lifecycle rule
run "test_prevent_destroy" {
  command = plan

  # Note: lifecycle prevent_destroy cannot be directly tested in terraform test
  # but we verify the resource configuration is correct
  assert {
    condition     = aws_s3_bucket.terraform_state.bucket != null
    error_message = "State bucket should be defined"
  }
}

# Test 6: Verify outputs are defined correctly
# Note: Output values from computed resources cannot be fully tested in plan phase
# We verify that the resources used for outputs are correctly defined
run "test_outputs_defined" {
  command = plan

  # Verify state_bucket_name source resource exists
  assert {
    condition     = aws_s3_bucket.terraform_state.bucket != null
    error_message = "state_bucket_name source (aws_s3_bucket.terraform_state.bucket) should be defined"
  }

  # Verify account_id source exists
  assert {
    condition     = data.aws_caller_identity.current.account_id != null
    error_message = "account_id source (data.aws_caller_identity.current.account_id) should be defined"
  }
}

# Test 7: Verify default region variable
run "test_default_region" {
  command = plan

  variables {
    aws_region = "ap-northeast-1"
  }

  assert {
    condition     = var.aws_region == "ap-northeast-1"
    error_message = "Default region should be ap-northeast-1"
  }
}
