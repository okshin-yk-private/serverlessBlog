# Auth Module Tests
# TDD: RED -> GREEN -> REFACTOR
# Requirements: 4.1, 4.2, 4.3, 4.4, 4.5

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

# Test 1: Verify User Pool is created with email sign-in
# Requirement 4.1: Create User Pool with email-based sign-in
run "user_pool_email_signin" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = contains(aws_cognito_user_pool.main.username_attributes, "email")
    error_message = "User Pool must have email as sign-in attribute"
  }
}

# Test 2: Verify password policy - minimum length
# Requirement 4.2: Configure password policy (12+ characters)
run "password_policy_min_length" {
  command = plan

  variables {
    user_pool_name          = "test-blog-user-pool"
    environment             = "dev"
    password_minimum_length = 12
  }

  assert {
    condition     = aws_cognito_user_pool.main.password_policy[0].minimum_length == 12
    error_message = "Password policy minimum length must be 12"
  }
}

# Test 3: Verify password policy - require lowercase
# Requirement 4.2: Configure password policy (require lowercase)
run "password_policy_require_lowercase" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.password_policy[0].require_lowercase == true
    error_message = "Password policy must require lowercase letters"
  }
}

# Test 4: Verify password policy - require uppercase
# Requirement 4.2: Configure password policy (require uppercase)
run "password_policy_require_uppercase" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.password_policy[0].require_uppercase == true
    error_message = "Password policy must require uppercase letters"
  }
}

# Test 5: Verify password policy - require numbers
# Requirement 4.2: Configure password policy (require numbers)
run "password_policy_require_numbers" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.password_policy[0].require_numbers == true
    error_message = "Password policy must require numbers"
  }
}

# Test 6: Verify password policy - require symbols
# Requirement 4.2: Configure password policy (require symbols)
run "password_policy_require_symbols" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.password_policy[0].require_symbols == true
    error_message = "Password policy must require symbols"
  }
}

# Test 7: Verify MFA configuration - OPTIONAL by default
# Requirement 4.5: MFA configuration (OPTIONAL)
run "mfa_configuration_optional" {
  command = plan

  variables {
    user_pool_name    = "test-blog-user-pool"
    environment       = "dev"
    mfa_configuration = "OPTIONAL"
  }

  assert {
    condition     = aws_cognito_user_pool.main.mfa_configuration == "OPTIONAL"
    error_message = "MFA configuration must be OPTIONAL by default"
  }
}

# Test 8: Verify MFA configuration - can be set to ON
# Requirement 4.5: MFA configuration can be ON
run "mfa_configuration_on" {
  command = plan

  variables {
    user_pool_name    = "test-blog-user-pool"
    environment       = "prd"
    mfa_configuration = "ON"
  }

  assert {
    condition     = aws_cognito_user_pool.main.mfa_configuration == "ON"
    error_message = "MFA configuration must support ON setting"
  }
}

# Test 9: Verify App Client is created with USER_PASSWORD_AUTH flow
# Requirement 4.3: App Client with USER_PASSWORD_AUTH
run "app_client_user_password_auth" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = contains(aws_cognito_user_pool_client.main.explicit_auth_flows, "ALLOW_USER_PASSWORD_AUTH")
    error_message = "App Client must support USER_PASSWORD_AUTH flow"
  }
}

# Test 10: Verify App Client is created with USER_SRP_AUTH flow
# Requirement 4.3: App Client with USER_SRP_AUTH
run "app_client_user_srp_auth" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = contains(aws_cognito_user_pool_client.main.explicit_auth_flows, "ALLOW_USER_SRP_AUTH")
    error_message = "App Client must support USER_SRP_AUTH flow"
  }
}

# Test 11: Verify App Client is created with REFRESH_TOKEN_AUTH flow
# Requirement 4.3: App Client with REFRESH_TOKEN_AUTH
run "app_client_refresh_token_auth" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = contains(aws_cognito_user_pool_client.main.explicit_auth_flows, "ALLOW_REFRESH_TOKEN_AUTH")
    error_message = "App Client must support REFRESH_TOKEN_AUTH flow"
  }
}

# Test 12: Verify email verification configuration
# Requirement 4.4: Configure email verification
run "email_verification_enabled" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = contains(aws_cognito_user_pool.main.auto_verified_attributes, "email")
    error_message = "Email must be auto-verified"
  }
}

# Test 13: Verify MFA configuration variable validation
run "mfa_configuration_validation" {
  command = plan

  variables {
    user_pool_name    = "test-blog-user-pool"
    environment       = "dev"
    mfa_configuration = "INVALID" # Invalid value - should fail
  }

  expect_failures = [
    var.mfa_configuration
  ]
}

# Test 14: Verify environment variable validation
run "environment_validation" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "staging" # Invalid environment - should fail
  }

  expect_failures = [
    var.environment
  ]
}

# Test 15: Verify password minimum length validation
run "password_min_length_validation" {
  command = plan

  variables {
    user_pool_name          = "test-blog-user-pool"
    environment             = "dev"
    password_minimum_length = 5 # Less than 8 - should fail
  }

  expect_failures = [
    var.password_minimum_length
  ]
}

# Test 16: Verify outputs are referencing correct resources
# Note: Actual values are computed after apply, so we verify the resource configuration
run "outputs_resources_exist" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  # Verify that the resources for outputs exist and are configured
  assert {
    condition     = aws_cognito_user_pool.main.name == "test-blog-user-pool"
    error_message = "User Pool resource must exist for output"
  }

  assert {
    condition     = aws_cognito_user_pool_client.main.name == "test-blog-user-pool-client"
    error_message = "User Pool Client resource must exist for output"
  }
}

# Test 17: Verify User Pool name
run "user_pool_name" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.name == "test-blog-user-pool"
    error_message = "User Pool name must match input variable"
  }
}

# Test 18: Verify App Client name
run "app_client_name" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool_client.main.name == "test-blog-user-pool-client"
    error_message = "App Client name must follow naming convention: {user_pool_name}-client"
  }
}

# Test 19: Verify self sign-up is disabled (admin-only user creation)
run "self_signup_disabled" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.admin_create_user_config[0].allow_admin_create_user_only == true
    error_message = "Self sign-up must be disabled (admin-only user creation)"
  }
}

# Test 20: Verify account recovery is email only
run "account_recovery_email_only" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition = anytrue([
      for rm in aws_cognito_user_pool.main.account_recovery_setting[0].recovery_mechanism :
      rm.name == "verified_email" && rm.priority == 1
    ])
    error_message = "Account recovery must use verified email with priority 1"
  }
}

# Test 21: Verify tags are applied
run "tags_applied" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
    tags = {
      Project = "serverless-blog"
      Owner   = "devops"
    }
  }

  assert {
    condition     = aws_cognito_user_pool.main.tags["Environment"] == "dev"
    error_message = "Environment tag must be applied to User Pool"
  }

  assert {
    condition     = aws_cognito_user_pool.main.tags["Project"] == "serverless-blog"
    error_message = "Custom Project tag must be applied"
  }
}

# Test 22: Verify token validity settings
run "token_validity" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  # Access token validity: 1 hour (60 minutes)
  assert {
    condition     = aws_cognito_user_pool_client.main.access_token_validity == 60
    error_message = "Access token validity must be 60 minutes (1 hour)"
  }

  # ID token validity: 1 hour (60 minutes)
  assert {
    condition     = aws_cognito_user_pool_client.main.id_token_validity == 60
    error_message = "ID token validity must be 60 minutes (1 hour)"
  }

  # Refresh token validity: 30 days
  assert {
    condition     = aws_cognito_user_pool_client.main.refresh_token_validity == 30
    error_message = "Refresh token validity must be 30 days"
  }
}

# Test 23: Verify App Client does not generate secret (for frontend apps)
run "app_client_no_secret" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool_client.main.generate_secret == false
    error_message = "App Client must not generate secret (frontend app requirement)"
  }
}

# Test 24: Verify deletion protection for production
run "deletion_protection_prd" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "prd"
  }

  assert {
    condition     = aws_cognito_user_pool.main.deletion_protection == "ACTIVE"
    error_message = "Deletion protection must be ACTIVE for production environment"
  }
}

# Test 25: Verify deletion protection inactive for dev
run "deletion_protection_dev" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool.main.deletion_protection == "INACTIVE"
    error_message = "Deletion protection should be INACTIVE for dev environment"
  }
}
