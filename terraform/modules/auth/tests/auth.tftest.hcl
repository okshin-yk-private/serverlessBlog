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
    condition     = aws_cognito_user_pool_client.main.name == "serverless-blog-admin-client"
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
# Note: the App Client name is a fixed literal ("serverless-blog-admin-client"),
# not derived from var.user_pool_name - it must match the name CDK originally
# created so that the resource can be imported without replacement. See the
# comment on aws_cognito_user_pool_client.main in main.tf.
run "app_client_name" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool_client.main.name == "serverless-blog-admin-client"
    error_message = "App Client name must match the CDK-imported client name"
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

  # Refresh token validity: 30 days, expressed in minutes because
  # token_validity_units.refresh_token = "minutes" (30 * 24 * 60 = 43200)
  assert {
    condition     = aws_cognito_user_pool_client.main.refresh_token_validity == 43200
    error_message = "Refresh token validity must be 30 days (43200 minutes)"
  }
}

# Test 23: Verify App Client does not generate secret (for frontend apps)
# Note: generate_secret is intentionally left unset in main.tf (see comment
# there) to avoid forced replacement of the CDK-imported client, whose API
# response has no secret. With the attribute unset, plan shows it as null
# rather than a computed false - assert it is not explicitly true instead.
run "app_client_no_secret" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = aws_cognito_user_pool_client.main.generate_secret != true
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

# =============================================================================
# E2E Test User (Issue #520)
# =============================================================================

# Test 26: E2E テストユーザーは既定では作られない
run "e2e_user_disabled_by_default" {
  command = plan

  variables {
    user_pool_name = "test-blog-user-pool"
    environment    = "dev"
  }

  assert {
    condition     = length(aws_cognito_user.e2e_admin) == 0
    error_message = "E2E test user must not be created unless explicitly enabled"
  }

  assert {
    condition     = length(aws_ssm_parameter.e2e_admin_password) == 0
    error_message = "E2E credentials must not be published unless the user is created"
  }
}

# Test 27: 有効化すると恒久パスワードの検証済みユーザーが作られる
# temporary_password だと初回ログインでパスワード変更チャレンジが入り、
# email_verified でないと SRP 認証自体が通らない
run "e2e_user_created_when_enabled" {
  command = plan

  variables {
    user_pool_name       = "test-blog-user-pool"
    environment          = "dev"
    create_e2e_test_user = true
    e2e_test_user_email  = "e2e-admin@example.com"
  }

  assert {
    condition     = aws_cognito_user.e2e_admin[0].username == "e2e-admin@example.com"
    error_message = "E2E test user must sign in with the configured email"
  }

  assert {
    condition     = aws_cognito_user.e2e_admin[0].attributes["email_verified"] == "true"
    error_message = "E2E test user must be email-verified to authenticate via SRP"
  }

  assert {
    condition     = aws_cognito_user.e2e_admin[0].temporary_password == null
    error_message = "E2E test user must have a permanent password, not a temporary one"
  }

  assert {
    condition     = aws_cognito_user.e2e_admin[0].message_action == "SUPPRESS"
    error_message = "Cognito must not send an invitation mail to the unreachable test address"
  }
}

# Test 28: admin グループに所属する (カテゴリ管理などの検証に必要)
run "e2e_user_in_admin_group" {
  command = plan

  variables {
    user_pool_name       = "test-blog-user-pool"
    environment          = "dev"
    create_e2e_test_user = true
  }

  assert {
    condition     = aws_cognito_user_in_group.e2e_admin[0].group_name == aws_cognito_user_group.admin.name
    error_message = "E2E test user must belong to the admin group"
  }
}

# Test 29: 認証情報は SecureString でのみ公開される
# 平文 (String) で置くと SSM の履歴と CLI 出力に残る
run "e2e_credentials_are_encrypted" {
  command = plan

  variables {
    user_pool_name       = "test-blog-user-pool"
    environment          = "dev"
    create_e2e_test_user = true
  }

  assert {
    condition     = aws_ssm_parameter.e2e_admin_password[0].type == "SecureString"
    error_message = "E2E password parameter must be a SecureString"
  }

  assert {
    condition     = aws_ssm_parameter.e2e_admin_email[0].type == "SecureString"
    error_message = "E2E email parameter must be a SecureString"
  }

  assert {
    condition     = aws_ssm_parameter.e2e_admin_password[0].name == "/serverless-blog/dev/e2e/admin-password"
    error_message = "E2E password parameter path must match what deploy.yml reads"
  }

  assert {
    condition     = aws_ssm_parameter.e2e_admin_email[0].name == "/serverless-blog/dev/e2e/admin-email"
    error_message = "E2E email parameter path must match what deploy.yml reads"
  }
}

# Test 30: 生成パスワードは user pool の password_policy を必ず満たす
run "e2e_password_satisfies_policy" {
  command = plan

  variables {
    user_pool_name          = "test-blog-user-pool"
    environment             = "dev"
    create_e2e_test_user    = true
    password_minimum_length = 12
  }

  assert {
    condition     = random_password.e2e_admin[0].length >= aws_cognito_user_pool.main.password_policy[0].minimum_length
    error_message = "Generated password must be at least as long as the pool's minimum length"
  }

  assert {
    condition = alltrue([
      random_password.e2e_admin[0].min_lower >= 1,
      random_password.e2e_admin[0].min_upper >= 1,
      random_password.e2e_admin[0].min_numeric >= 1,
      random_password.e2e_admin[0].min_special >= 1,
    ])
    error_message = "Generated password must cover every character class the pool requires"
  }
}

# Test 31: 本番では作成できない (precondition で apply 前に止まる)
run "e2e_user_forbidden_in_prd" {
  command = plan

  variables {
    user_pool_name       = "test-blog-user-pool"
    environment          = "prd"
    create_e2e_test_user = true
  }

  expect_failures = [
    aws_cognito_user.e2e_admin,
  ]
}
