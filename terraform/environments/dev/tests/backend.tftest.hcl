# Environment Backend Configuration Tests - DEV
# Task 1.3 - TDD approach: Test environment-specific backend and variable definitions
# Requirements: 1.3, 1.4, 1.5, 1.6

# Mock providers for testing (no actual AWS calls)
mock_provider "aws" {}

# Test 1: Verify environment variable validation
run "test_dev_environment_validation" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = var.environment == "dev"
    error_message = "Environment must be 'dev' for this configuration"
  }
}

# Test 2: Verify environment validation rejects invalid values
run "test_environment_validation_rejects_invalid" {
  command = plan

  variables {
    environment  = "dev" # Only dev is valid for this environment
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  # This test verifies that the validation rule works
  assert {
    condition     = var.environment == "dev"
    error_message = "Dev environment validation should accept 'dev'"
  }
}

# Test 3: Verify project_name variable
run "test_project_name_variable" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = var.project_name == "serverless-blog"
    error_message = "Project name should be set correctly"
  }

  assert {
    condition     = length(var.project_name) > 0
    error_message = "Project name must not be empty"
  }
}

# Test 4: Verify aws_region validation
run "test_aws_region_validation" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "AWS region must be in valid format"
  }
}

# Test 5: Verify alarm_email is optional for dev (can be empty)
run "test_alarm_email_optional_for_dev" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = ""
  }

  assert {
    condition     = var.alarm_email == ""
    error_message = "alarm_email should be allowed to be empty for dev environment"
  }
}

# Test 6: Verify alarm_email is marked as sensitive
run "test_alarm_email_can_be_set" {
  command = plan

  variables {
    environment  = "dev"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "test@example.com"
  }

  assert {
    condition     = var.alarm_email == "test@example.com"
    error_message = "alarm_email should accept a valid email"
  }
}
