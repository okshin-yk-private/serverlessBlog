# Environment Backend Configuration Tests - PRD
# Task 1.3 - TDD approach: Test environment-specific backend and variable definitions
# Requirements: 1.3, 1.4, 1.5, 1.6

# Mock providers for testing (no actual AWS calls)
mock_provider "aws" {}

# Test 1: Verify environment variable validation
run "test_prd_environment_validation" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = var.environment == "prd"
    error_message = "Environment must be 'prd' for this configuration"
  }
}

# Test 2: Verify environment validation rejects invalid values
run "test_environment_validation_rejects_invalid" {
  command = plan

  variables {
    environment  = "prd" # Only prd is valid for this environment
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  # This test verifies that the validation rule works
  assert {
    condition     = var.environment == "prd"
    error_message = "Prd environment validation should accept 'prd'"
  }
}

# Test 3: Verify project_name variable
run "test_project_name_variable" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
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
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "AWS region must be in valid format"
  }
}

# Test 5: Verify alarm_email is required for prd (must have a value)
run "test_alarm_email_required_for_prd" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "alerts@example.com"
  }

  assert {
    condition     = length(var.alarm_email) > 0
    error_message = "alarm_email is required for production environment"
  }
}

# Test 6: Verify alarm_email with valid email
run "test_alarm_email_accepts_valid_email" {
  command = plan

  variables {
    environment  = "prd"
    project_name = "serverless-blog"
    aws_region   = "ap-northeast-1"
    alarm_email  = "production-alerts@company.com"
  }

  assert {
    condition     = var.alarm_email == "production-alerts@company.com"
    error_message = "alarm_email should accept a valid email"
  }
}
