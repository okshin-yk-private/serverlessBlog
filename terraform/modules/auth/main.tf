# Auth Module - Cognito User Pool
# Requirements: 4.1, 4.2, 4.3, 4.4, 4.5

locals {
  default_tags = {
    Environment = var.environment
    Module      = "auth"
  }
  tags = merge(local.default_tags, var.tags)
}

# Cognito User Pool
# Requirements: 4.1 (email sign-in), 4.2 (password policy), 4.4 (email verification), 4.5 (MFA)
resource "aws_cognito_user_pool" "main" {
  name = var.user_pool_name

  # Requirement 4.1: Email-based sign-in
  username_attributes = ["email"]

  # Self-registration disabled (admin-only user creation)
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # Requirement 4.4: Email auto-verification
  auto_verified_attributes = ["email"]

  # Requirement 4.2: Password policy (12+ characters, require all character types)
  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # Requirement 4.5: MFA configuration (OPTIONAL by default, ON for production)
  mfa_configuration = var.mfa_configuration

  # Software token MFA configuration (required when MFA is OPTIONAL or ON)
  software_token_mfa_configuration {
    enabled = var.mfa_configuration != "OFF"
  }

  # Account recovery settings: email only
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Deletion protection: ACTIVE for production, INACTIVE for dev
  deletion_protection = var.environment == "prd" ? "ACTIVE" : "INACTIVE"

  tags = local.tags
}

# Cognito User Pool Client
# Requirement 4.3: App Client with USER_PASSWORD_AUTH, USER_SRP_AUTH, REFRESH_TOKEN_AUTH
resource "aws_cognito_user_pool_client" "main" {
  # Note: CDK created client with name "serverless-blog-admin-client"
  name         = "serverless-blog-admin-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # Note: generate_secret is not specified to avoid forced replacement during import
  # The CDK-created client does not have a secret (ClientSecret is not returned by API)

  # Requirement 4.3: Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  # Token validity settings (matching CDK configuration)
  access_token_validity  = 60    # 1 hour in minutes
  id_token_validity      = 60    # 1 hour in minutes
  refresh_token_validity = 43200 # 30 days in minutes

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "minutes"
  }

  # Supported identity providers
  supported_identity_providers = ["COGNITO"]

  # OAuth settings (matching CDK configuration)
  allowed_oauth_flows = ["code", "implicit"]
  allowed_oauth_scopes = [
    "aws.cognito.signin.user.admin",
    "email",
    "openid",
    "phone",
    "profile"
  ]
  allowed_oauth_flows_user_pool_client = true
  callback_urls                        = ["https://example.com"]

  # Token revocation
  enable_token_revocation = true

  # Session validity
  auth_session_validity = 3
}
