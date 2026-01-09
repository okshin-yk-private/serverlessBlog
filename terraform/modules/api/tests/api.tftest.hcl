# API Module Tests
# TDD: RED -> GREEN -> REFACTOR
# Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

# ======================
# REST API Creation Tests
# ======================

# Test 1: Verify REST API is created
# Requirement 5.1: Create REST API with all existing endpoints
run "rest_api_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_rest_api.main.name == "serverless-blog-api"
    error_message = "REST API name must match input variable"
  }
}

# Test 2: Verify REST API description
# Requirement 5.1: REST API with proper description
run "rest_api_description" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_rest_api.main.description == "Serverless Blog REST API"
    error_message = "REST API must have proper description"
  }
}

# Test 3: Verify REST API endpoint type is REGIONAL
# Requirement 5.1: REST API with REGIONAL endpoint
run "rest_api_endpoint_type" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = contains(aws_api_gateway_rest_api.main.endpoint_configuration[0].types, "REGIONAL")
    error_message = "REST API endpoint type must be REGIONAL"
  }
}

# ======================
# Cognito Authorizer Tests
# ======================

# Test 4: Verify Cognito Authorizer is created
# Requirement 5.2: Configure Cognito Authorizer for protected endpoints
run "cognito_authorizer_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_authorizer.cognito.name == "blog-cognito-authorizer"
    error_message = "Cognito Authorizer must be created with proper name"
  }
}

# Test 5: Verify Cognito Authorizer type is COGNITO_USER_POOLS
# Requirement 5.2: Authorizer type must be COGNITO_USER_POOLS
run "cognito_authorizer_type" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_authorizer.cognito.type == "COGNITO_USER_POOLS"
    error_message = "Authorizer type must be COGNITO_USER_POOLS"
  }
}

# Test 6: Verify Cognito Authorizer identity source
# Requirement 5.2: Authorizer uses Authorization header
run "cognito_authorizer_identity_source" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_authorizer.cognito.identity_source == "method.request.header.Authorization"
    error_message = "Authorizer identity source must be Authorization header"
  }
}

# ======================
# API Resource Path Tests
# ======================

# Test 7: Verify /admin resource path is created
# Requirement 5.1: Create /admin resource for authenticated endpoints
run "admin_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin.path_part == "admin"
    error_message = "/admin resource path must be created"
  }
}

# Test 8: Verify /posts resource path is created
# Requirement 5.1: Create /posts resource for public endpoints
run "posts_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.posts.path_part == "posts"
    error_message = "/posts resource path must be created"
  }
}

# Test 9: Verify /admin/posts resource path is created
# Requirement 5.1: Create /admin/posts resource
run "admin_posts_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_posts.path_part == "posts"
    error_message = "/admin/posts resource path must be created"
  }
}

# Test 10: Verify /admin/posts/{id} resource path is created
# Requirement 5.1: Create /admin/posts/{id} resource
run "admin_posts_id_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_posts_id.path_part == "{id}"
    error_message = "/admin/posts/{id} resource path must be created"
  }
}

# Test 11: Verify /posts/{id} resource path is created
# Requirement 5.1: Create /posts/{id} resource for public endpoint
run "posts_id_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.posts_id.path_part == "{id}"
    error_message = "/posts/{id} resource path must be created"
  }
}

# Test 12: Verify /admin/images resource path is created
# Requirement 5.1: Create /admin/images resource
run "admin_images_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_images.path_part == "images"
    error_message = "/admin/images resource path must be created"
  }
}

# Test 13: Verify /admin/images/upload-url resource path is created
# Requirement 5.1: Create /admin/images/upload-url resource
run "admin_images_upload_url_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_images_upload_url.path_part == "upload-url"
    error_message = "/admin/images/upload-url resource path must be created"
  }
}

# Test 14: Verify /admin/images/{key+} resource path is created
# Requirement 5.1: Create /admin/images/{key+} resource for greedy path
run "admin_images_key_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_images_key.path_part == "{key+}"
    error_message = "/admin/images/{key+} resource path must be created"
  }
}

# Test 15: Verify /admin/auth resource path is created
# Requirement 5.1: Create /admin/auth resource
run "admin_auth_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_auth.path_part == "auth"
    error_message = "/admin/auth resource path must be created"
  }
}

# Test 16: Verify /admin/auth/login resource path is created
# Requirement 5.1: Create /admin/auth/login resource
run "admin_auth_login_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_auth_login.path_part == "login"
    error_message = "/admin/auth/login resource path must be created"
  }
}

# Test 17: Verify /admin/auth/logout resource path is created
# Requirement 5.1: Create /admin/auth/logout resource
run "admin_auth_logout_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_auth_logout.path_part == "logout"
    error_message = "/admin/auth/logout resource path must be created"
  }
}

# Test 18: Verify /admin/auth/refresh resource path is created
# Requirement 5.1: Create /admin/auth/refresh resource
run "admin_auth_refresh_resource_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_auth_refresh.path_part == "refresh"
    error_message = "/admin/auth/refresh resource path must be created"
  }
}

# ======================
# Deployment Stage Tests
# ======================

# Test 19: Verify deployment stage is created for dev
# Requirement 5.6: Create dev deployment stage
run "deployment_stage_dev" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_stage.main.stage_name == "dev"
    error_message = "Dev deployment stage must be created"
  }
}

# Test 20: Verify deployment stage is created for prd
# Requirement 5.6: Create prd deployment stage
run "deployment_stage_prd" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "prd"
    stage_name            = "prod"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_stage.main.stage_name == "prod"
    error_message = "Prod deployment stage must be created"
  }
}

# Test 21: Verify X-Ray tracing is enabled for prd
# Requirement 5.6: X-Ray tracing enabled for production
run "xray_tracing_prd" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "prd"
    stage_name            = "prod"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_stage.main.xray_tracing_enabled == true
    error_message = "X-Ray tracing must be enabled for production"
  }
}

# Test 22: Verify X-Ray tracing is disabled for dev
# Requirement 5.6: X-Ray tracing disabled for dev (cost optimization)
run "xray_tracing_dev" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_stage.main.xray_tracing_enabled == false
    error_message = "X-Ray tracing should be disabled for dev"
  }
}

# ======================
# Gateway Response Tests (CORS)
# ======================

# Test 23: Verify Gateway Response for 4xx errors
# Requirement 5.3: Configure CORS for error responses
run "gateway_response_4xx" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_gateway_response.default_4xx.response_type == "DEFAULT_4XX"
    error_message = "Gateway Response for DEFAULT_4XX must be configured"
  }
}

# Test 24: Verify Gateway Response for 5xx errors
# Requirement 5.3: Configure CORS for error responses
run "gateway_response_5xx" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_gateway_response.default_5xx.response_type == "DEFAULT_5XX"
    error_message = "Gateway Response for DEFAULT_5XX must be configured"
  }
}

# Test 25: Verify CORS header in 4xx response
# Requirement 5.3: CORS headers in error responses
run "gateway_response_4xx_cors_header" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_gateway_response.default_4xx.response_parameters["gatewayresponse.header.Access-Control-Allow-Origin"] == "'*'"
    error_message = "4xx Gateway Response must have Access-Control-Allow-Origin header"
  }
}

# ======================
# Variable Validation Tests
# ======================

# Test 26: Verify environment variable validation - invalid value
run "environment_validation_invalid" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "staging"
    stage_name            = "staging"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  expect_failures = [
    var.environment
  ]
}

# Test 27: Verify CORS allow origins default
run "cors_allow_origins_default" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = contains(var.cors_allow_origins, "*")
    error_message = "CORS allow origins default must include '*'"
  }
}

# ======================
# Tags Tests
# ======================

# Test 28: Verify tags are applied to REST API
run "rest_api_tags" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    tags = {
      Project = "serverless-blog"
    }
  }

  assert {
    condition     = aws_api_gateway_rest_api.main.tags["Environment"] == "dev"
    error_message = "Environment tag must be applied to REST API"
  }
}

# ======================
# Request Validator Tests
# ======================

# Test 29: Verify Request Validator is created
# Requirement 5.5: Configure request validation
run "request_validator_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_request_validator.main.name == "BlogApiRequestValidator"
    error_message = "Request Validator must be created with proper name"
  }
}

# Test 30: Verify Request Validator validates body
# Requirement 5.5: Validate request body
run "request_validator_body" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_request_validator.main.validate_request_body == true
    error_message = "Request Validator must validate request body"
  }
}

# Test 31: Verify Request Validator validates parameters
# Requirement 5.5: Validate request parameters
run "request_validator_parameters" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_request_validator.main.validate_request_parameters == true
    error_message = "Request Validator must validate request parameters"
  }
}

# ======================
# Output Tests
# ======================

# Test 32: Verify output resources exist
run "output_resources_exist" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  # Verify REST API resource exists
  assert {
    condition     = aws_api_gateway_rest_api.main.name != ""
    error_message = "REST API resource must exist for outputs"
  }

  # Verify Authorizer resource exists
  assert {
    condition     = aws_api_gateway_authorizer.cognito.name != ""
    error_message = "Authorizer resource must exist for outputs"
  }

  # Verify Stage resource exists
  assert {
    condition     = aws_api_gateway_stage.main.stage_name != ""
    error_message = "Stage resource must exist for outputs"
  }
}

# ======================
# CloudWatch Logging Tests
# ======================

# Test 33: Verify CloudWatch logging for production
run "cloudwatch_logging_prd" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "prd"
    stage_name            = "prod"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  # Access log destination should be set for production
  assert {
    condition     = aws_api_gateway_stage.main.access_log_settings != null
    error_message = "Access log settings must be configured for production"
  }
}
