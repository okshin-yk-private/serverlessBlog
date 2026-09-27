# API Module Tests
# TDD: RED -> GREEN -> REFACTOR
# Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

# Mock provider for testing without AWS credentials
mock_provider "aws" {}

# Global variables for all Lambda ARNs (required by API module)
variables {
  lambda_create_post_arn                         = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-create-post-go"
  lambda_create_post_invoke_arn                  = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-create-post-go/invocations"
  lambda_list_posts_arn                          = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-list-posts-go"
  lambda_list_posts_invoke_arn                   = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-list-posts-go/invocations"
  lambda_get_post_arn                            = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-get-post-go"
  lambda_get_post_invoke_arn                     = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-get-post-go/invocations"
  lambda_get_public_post_arn                     = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-get-public-post-go"
  lambda_get_public_post_invoke_arn              = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-get-public-post-go/invocations"
  lambda_update_post_arn                         = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-update-post-go"
  lambda_update_post_invoke_arn                  = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-update-post-go/invocations"
  lambda_delete_post_arn                         = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-delete-post-go"
  lambda_delete_post_invoke_arn                  = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-delete-post-go/invocations"
  lambda_build_status_post_arn                   = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-build-status-post-go"
  lambda_build_status_post_invoke_arn            = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-build-status-post-go/invocations"
  lambda_get_upload_url_arn                      = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-upload-url-go"
  lambda_get_upload_url_invoke_arn               = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-upload-url-go/invocations"
  lambda_delete_image_arn                        = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-delete-image-go"
  lambda_delete_image_invoke_arn                 = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-delete-image-go/invocations"
  lambda_list_categories_arn                     = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-list-categories-go"
  lambda_list_categories_invoke_arn              = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-list-categories-go/invocations"
  lambda_create_category_arn                     = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-create-category-go"
  lambda_create_category_invoke_arn              = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-create-category-go/invocations"
  lambda_update_category_arn                     = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-update-category-go"
  lambda_update_category_invoke_arn              = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-update-category-go/invocations"
  lambda_update_categories_sort_order_arn        = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-update-categories-sort-order-go"
  lambda_update_categories_sort_order_invoke_arn = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-update-categories-sort-order-go/invocations"
  lambda_delete_category_arn                     = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-delete-category-go"
  lambda_delete_category_invoke_arn              = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-delete-category-go/invocations"
  lambda_get_post_by_slug_arn                    = "arn:aws:lambda:ap-northeast-1:123456789012:function:blog-get-post-by-slug-go"
  lambda_get_post_by_slug_invoke_arn             = "arn:aws:apigateway:ap-northeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-1:123456789012:function:blog-get-post-by-slug-go/invocations"
}

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

# PR5b: Verify /admin/posts/{id}/build-status resource and Cognito-protected GET method
run "admin_posts_id_build_status_route_created" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  assert {
    condition     = aws_api_gateway_resource.admin_posts_id_build_status.path_part == "build-status"
    error_message = "/admin/posts/{id}/build-status resource must be created"
  }

  assert {
    condition     = aws_api_gateway_method.admin_posts_id_build_status_get.http_method == "GET"
    error_message = "build-status method must be GET"
  }

  assert {
    condition     = aws_api_gateway_method.admin_posts_id_build_status_get.authorization == "COGNITO_USER_POOLS"
    error_message = "build-status GET must require Cognito authorization"
  }

  assert {
    condition     = aws_api_gateway_method.admin_posts_id_build_status_options.authorization == "NONE"
    error_message = "build-status OPTIONS (CORS preflight) must allow unauthenticated requests"
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
    condition     = aws_api_gateway_gateway_response.default_4xx.response_parameters["gatewayresponse.header.Access-Control-Allow-Origin"] == "'${var.cors_allow_origins[0]}'"
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

# ======================
# Admin Write Method Throttling Tests (Issue #682, item 1)
# ======================

# Test 34: Verify a per-method throttling setting exists for every admin write
# method, with the expected method_path and the configured admin-write limits.
run "admin_write_method_settings_created" {
  command = plan

  variables {
    api_name                           = "serverless-blog-api"
    environment                        = "dev"
    stage_name                         = "dev"
    cognito_user_pool_arn              = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    admin_write_throttling_rate_limit  = 10
    admin_write_throttling_burst_limit = 20
  }

  # aws_api_gateway_resource.*.path is a computed attribute, unknown until apply.
  # Override it with the known path so method_path (built from it via trimprefix)
  # can be asserted at plan time, matching the pattern the rest of this test file
  # uses (command = plan everywhere, no real apply).
  override_resource {
    target          = aws_api_gateway_resource.admin_posts
    override_during = plan
    values = {
      path = "/admin/posts"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_posts_id
    override_during = plan
    values = {
      path = "/admin/posts/{id}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_images_upload_url
    override_during = plan
    values = {
      path = "/admin/images/upload-url"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_images_key
    override_during = plan
    values = {
      path = "/admin/images/{key+}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories
    override_during = plan
    values = {
      path = "/admin/categories"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories_id
    override_during = plan
    values = {
      path = "/admin/categories/{id}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories_sort
    override_during = plan
    values = {
      path = "/admin/categories/sort"
    }
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_posts_create"].method_path == "admin/posts/POST"
    error_message = "POST /admin/posts must have a method-level throttling setting at admin/posts/POST"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_posts_update"].method_path == "admin/posts/{id}/PUT"
    error_message = "PUT /admin/posts/{id} must have a method-level throttling setting at admin/posts/{id}/PUT"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_posts_delete"].method_path == "admin/posts/{id}/DELETE"
    error_message = "DELETE /admin/posts/{id} must have a method-level throttling setting at admin/posts/{id}/DELETE"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_images_upload_url"].method_path == "admin/images/upload-url/POST"
    error_message = "POST /admin/images/upload-url must have a method-level throttling setting"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_images_delete"].method_path == "admin/images/{key+}/DELETE"
    error_message = "DELETE /admin/images/{key+} must have a method-level throttling setting"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_categories_create"].method_path == "admin/categories/POST"
    error_message = "POST /admin/categories must have a method-level throttling setting"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_categories_update"].method_path == "admin/categories/{id}/PUT"
    error_message = "PUT /admin/categories/{id} must have a method-level throttling setting"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_categories_delete"].method_path == "admin/categories/{id}/DELETE"
    error_message = "DELETE /admin/categories/{id} must have a method-level throttling setting"
  }

  assert {
    condition     = aws_api_gateway_method_settings.admin_write["admin_categories_sort"].method_path == "admin/categories/sort/PATCH"
    error_message = "PATCH /admin/categories/sort must have a method-level throttling setting"
  }

  # Every admin write method setting must carry the lower admin-write limits.
  assert {
    condition = alltrue([
      for k, v in aws_api_gateway_method_settings.admin_write :
      v.settings[0].throttling_rate_limit == 10 && v.settings[0].throttling_burst_limit == 20
    ])
    error_message = "All admin write method settings must use the admin_write_throttling_rate_limit/burst_limit values"
  }

  # Exactly the 9 write methods enumerated above, no more, no less.
  assert {
    condition     = length(aws_api_gateway_method_settings.admin_write) == 9
    error_message = "Exactly 9 admin write methods are expected to have per-method throttling"
  }
}

# Test 35: OPTIONS (CORS preflight) methods must never be throttled individually.
run "admin_write_excludes_options" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_posts
    override_during = plan
    values = {
      path = "/admin/posts"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_posts_id
    override_during = plan
    values = {
      path = "/admin/posts/{id}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_images_upload_url
    override_during = plan
    values = {
      path = "/admin/images/upload-url"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_images_key
    override_during = plan
    values = {
      path = "/admin/images/{key+}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories
    override_during = plan
    values = {
      path = "/admin/categories"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories_id
    override_during = plan
    values = {
      path = "/admin/categories/{id}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories_sort
    override_during = plan
    values = {
      path = "/admin/categories/sort"
    }
  }

  assert {
    condition = alltrue([
      for k, v in aws_api_gateway_method_settings.admin_write : !endswith(v.method_path, "/OPTIONS")
    ])
    error_message = "OPTIONS methods must not have a per-method throttling setting"
  }
}

# Test 36: Public GET methods (posts, categories) must stay on the stage-wide
# setting, not be given their own lower per-method limit — the SSG build depends
# on the public API at build time and must not be at risk of extra throttling.
run "admin_write_excludes_public_get" {
  command = plan

  variables {
    api_name              = "serverless-blog-api"
    environment           = "dev"
    stage_name            = "dev"
    cognito_user_pool_arn = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_posts
    override_during = plan
    values = {
      path = "/admin/posts"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_posts_id
    override_during = plan
    values = {
      path = "/admin/posts/{id}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_images_upload_url
    override_during = plan
    values = {
      path = "/admin/images/upload-url"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_images_key
    override_during = plan
    values = {
      path = "/admin/images/{key+}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories
    override_during = plan
    values = {
      path = "/admin/categories"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories_id
    override_during = plan
    values = {
      path = "/admin/categories/{id}"
    }
  }

  override_resource {
    target          = aws_api_gateway_resource.admin_categories_sort
    override_during = plan
    values = {
      path = "/admin/categories/sort"
    }
  }

  assert {
    condition = alltrue([
      for k, v in aws_api_gateway_method_settings.admin_write :
      !startswith(v.method_path, "posts/") && !startswith(v.method_path, "categories/")
    ])
    error_message = "Public GET methods (posts, categories) must not receive a per-method throttling setting"
  }
}

# Test 37: The stage-wide "all" method settings must remain unchanged (still
# */* at the stage-wide throttling_rate_limit/burst_limit), so public GET and any
# method not covered by the admin-write map keep their existing behavior.
run "stage_wide_all_setting_unchanged" {
  command = plan

  variables {
    api_name               = "serverless-blog-api"
    environment            = "dev"
    stage_name             = "dev"
    cognito_user_pool_arn  = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    throttling_rate_limit  = 100
    throttling_burst_limit = 200
  }

  assert {
    condition     = aws_api_gateway_method_settings.all.method_path == "*/*"
    error_message = "The stage-wide method settings must still cover */* "
  }

  assert {
    condition     = aws_api_gateway_method_settings.all.settings[0].throttling_rate_limit == 100
    error_message = "The stage-wide throttling_rate_limit must remain unchanged at 100"
  }

  assert {
    condition     = aws_api_gateway_method_settings.all.settings[0].throttling_burst_limit == 200
    error_message = "The stage-wide throttling_burst_limit must remain unchanged at 200"
  }
}

# Test 38: admin_write_throttling_rate_limit must be positive.
run "admin_write_rate_limit_must_be_positive" {
  command = plan

  variables {
    api_name                          = "serverless-blog-api"
    environment                       = "dev"
    stage_name                        = "dev"
    cognito_user_pool_arn             = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    admin_write_throttling_rate_limit = 0
  }

  expect_failures = [
    var.admin_write_throttling_rate_limit,
  ]
}

# Test 39: admin_write_throttling_burst_limit must be positive.
run "admin_write_burst_limit_must_be_positive" {
  command = plan

  variables {
    api_name                           = "serverless-blog-api"
    environment                        = "dev"
    stage_name                         = "dev"
    cognito_user_pool_arn              = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    admin_write_throttling_burst_limit = -1
  }

  expect_failures = [
    var.admin_write_throttling_burst_limit,
  ]
}

# Test 40: admin_write_throttling_rate_limit must not exceed the stage-wide
# throttling_rate_limit (validation rejects a value above the stage-wide limit).
run "admin_write_rate_limit_must_not_exceed_stage_wide" {
  command = plan

  variables {
    api_name                          = "serverless-blog-api"
    environment                       = "dev"
    stage_name                        = "dev"
    cognito_user_pool_arn             = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    throttling_rate_limit             = 100
    admin_write_throttling_rate_limit = 150
  }

  expect_failures = [
    var.admin_write_throttling_rate_limit,
  ]
}

# Test 41: admin_write_throttling_burst_limit must not exceed the stage-wide
# throttling_burst_limit (validation rejects a value above the stage-wide limit).
run "admin_write_burst_limit_must_not_exceed_stage_wide" {
  command = plan

  variables {
    api_name                           = "serverless-blog-api"
    environment                        = "dev"
    stage_name                         = "dev"
    cognito_user_pool_arn              = "arn:aws:cognito-idp:ap-northeast-1:123456789012:userpool/ap-northeast-1_XXXXXXXXX"
    throttling_burst_limit             = 200
    admin_write_throttling_burst_limit = 250
  }

  expect_failures = [
    var.admin_write_throttling_burst_limit,
  ]
}
