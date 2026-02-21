# API Module - API Gateway
# Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

locals {
  is_production = var.environment == "prd"
  common_tags = merge(var.tags, {
    Environment = var.environment
    Module      = "api"
  })
}

# ======================
# REST API
# ======================

# REST API creation
# Requirement 5.1: Create REST API with all existing endpoints
resource "aws_api_gateway_rest_api" "main" {
  name        = var.api_name
  description = "Serverless Blog REST API"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# ======================
# Cognito Authorizer
# ======================

# Cognito User Pool Authorizer
# Requirement 5.2: Configure Cognito Authorizer for protected endpoints
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "blog-cognito-authorizer"
  rest_api_id     = aws_api_gateway_rest_api.main.id
  type            = "COGNITO_USER_POOLS"
  identity_source = "method.request.header.Authorization"
  provider_arns   = [var.cognito_user_pool_arn]
}

# ======================
# Request Validator
# ======================

# Request Validator for API Gateway
# Requirement 5.5: Configure request validation
resource "aws_api_gateway_request_validator" "main" {
  name                        = "BlogApiRequestValidator"
  rest_api_id                 = aws_api_gateway_rest_api.main.id
  validate_request_body       = true
  validate_request_parameters = true
}

# ======================
# API Resource Paths
# ======================

# /admin resource
# Requirement 5.1: Create /admin resource for authenticated endpoints
resource "aws_api_gateway_resource" "admin" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "admin"
}

# /posts resource (public)
# Requirement 5.1: Create /posts resource for public endpoints
resource "aws_api_gateway_resource" "posts" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "posts"
}

# /posts/{id} resource (public)
# Requirement 5.1: Create /posts/{id} resource
resource "aws_api_gateway_resource" "posts_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.posts.id
  path_part   = "{id}"
}

# /admin/posts resource
# Requirement 5.1: Create /admin/posts resource
resource "aws_api_gateway_resource" "admin_posts" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "posts"
}

# /admin/posts/{id} resource
# Requirement 5.1: Create /admin/posts/{id} resource
resource "aws_api_gateway_resource" "admin_posts_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_posts.id
  path_part   = "{id}"
}

# /admin/images resource
# Requirement 5.1: Create /admin/images resource
resource "aws_api_gateway_resource" "admin_images" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "images"
}

# /admin/images/upload-url resource
# Requirement 5.1: Create /admin/images/upload-url resource
resource "aws_api_gateway_resource" "admin_images_upload_url" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_images.id
  path_part   = "upload-url"
}

# /admin/images/{key+} resource (greedy path for nested paths)
# Requirement 5.1: Create /admin/images/{key+} resource
resource "aws_api_gateway_resource" "admin_images_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_images.id
  path_part   = "{key+}"
}

# /admin/auth resource
# Requirement 5.1: Create /admin/auth resource
resource "aws_api_gateway_resource" "admin_auth" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "auth"
}

# /admin/auth/login resource
# Requirement 5.1: Create /admin/auth/login resource
resource "aws_api_gateway_resource" "admin_auth_login" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_auth.id
  path_part   = "login"
}

# /admin/auth/logout resource
# Requirement 5.1: Create /admin/auth/logout resource
resource "aws_api_gateway_resource" "admin_auth_logout" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_auth.id
  path_part   = "logout"
}

# /admin/auth/refresh resource
# Requirement 5.1: Create /admin/auth/refresh resource
resource "aws_api_gateway_resource" "admin_auth_refresh" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_auth.id
  path_part   = "refresh"
}

# ======================
# API Methods and Integrations
# ======================

# --- POST /admin/posts (Cognito auth) ---
resource "aws_api_gateway_method" "admin_posts_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_posts_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_posts.id
  http_method             = aws_api_gateway_method.admin_posts_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_create_post_invoke_arn
}

# --- GET /admin/posts (Cognito auth) ---
resource "aws_api_gateway_method" "admin_posts_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_posts_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_posts.id
  http_method             = aws_api_gateway_method.admin_posts_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_list_posts_invoke_arn
}

# --- OPTIONS /admin/posts (CORS) ---
resource "aws_api_gateway_method" "admin_posts_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_posts_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts.id
  http_method = aws_api_gateway_method.admin_posts_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_posts_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts.id
  http_method = aws_api_gateway_method.admin_posts_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_posts_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts.id
  http_method = aws_api_gateway_method.admin_posts_options.http_method
  status_code = aws_api_gateway_method_response.admin_posts_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- GET /admin/posts/{id} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_posts_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts_id.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_posts_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_posts_id.id
  http_method             = aws_api_gateway_method.admin_posts_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_get_post_invoke_arn
}

# --- PUT /admin/posts/{id} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_posts_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts_id.id
  http_method   = "PUT"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_posts_id_put" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_posts_id.id
  http_method             = aws_api_gateway_method.admin_posts_id_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_update_post_invoke_arn
}

# --- DELETE /admin/posts/{id} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_posts_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts_id.id
  http_method   = "DELETE"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_posts_id_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_posts_id.id
  http_method             = aws_api_gateway_method.admin_posts_id_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_delete_post_invoke_arn
}

# --- OPTIONS /admin/posts/{id} (CORS) ---
resource "aws_api_gateway_method" "admin_posts_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_posts_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_posts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts_id.id
  http_method = aws_api_gateway_method.admin_posts_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_posts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts_id.id
  http_method = aws_api_gateway_method.admin_posts_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_posts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_posts_id.id
  http_method = aws_api_gateway_method.admin_posts_id_options.http_method
  status_code = aws_api_gateway_method_response.admin_posts_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- POST /admin/images/upload-url (Cognito auth) ---
resource "aws_api_gateway_method" "admin_images_upload_url_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_images_upload_url.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_images_upload_url_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_images_upload_url.id
  http_method             = aws_api_gateway_method.admin_images_upload_url_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_get_upload_url_invoke_arn
}

# --- OPTIONS /admin/images/upload-url (CORS) ---
resource "aws_api_gateway_method" "admin_images_upload_url_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_images_upload_url.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_images_upload_url_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_images_upload_url.id
  http_method = aws_api_gateway_method.admin_images_upload_url_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_images_upload_url_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_images_upload_url.id
  http_method = aws_api_gateway_method.admin_images_upload_url_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_images_upload_url_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_images_upload_url.id
  http_method = aws_api_gateway_method.admin_images_upload_url_options.http_method
  status_code = aws_api_gateway_method_response.admin_images_upload_url_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- DELETE /admin/images/{key+} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_images_key_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_images_key.id
  http_method   = "DELETE"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.key" = true
  }
}

resource "aws_api_gateway_integration" "admin_images_key_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_images_key.id
  http_method             = aws_api_gateway_method.admin_images_key_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_delete_image_invoke_arn
}

# --- OPTIONS /admin/images/{key+} (CORS) ---
resource "aws_api_gateway_method" "admin_images_key_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_images_key.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_images_key_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_images_key.id
  http_method = aws_api_gateway_method.admin_images_key_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_images_key_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_images_key.id
  http_method = aws_api_gateway_method.admin_images_key_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_images_key_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_images_key.id
  http_method = aws_api_gateway_method.admin_images_key_options.http_method
  status_code = aws_api_gateway_method_response.admin_images_key_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- POST /admin/auth/login (No auth) ---
resource "aws_api_gateway_method" "admin_auth_login_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_auth_login.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_auth_login_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_auth_login.id
  http_method             = aws_api_gateway_method.admin_auth_login_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_login_invoke_arn
}

# --- OPTIONS /admin/auth/login (CORS) ---
resource "aws_api_gateway_method" "admin_auth_login_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_auth_login.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_auth_login_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_login.id
  http_method = aws_api_gateway_method.admin_auth_login_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_auth_login_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_login.id
  http_method = aws_api_gateway_method.admin_auth_login_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_auth_login_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_login.id
  http_method = aws_api_gateway_method.admin_auth_login_options.http_method
  status_code = aws_api_gateway_method_response.admin_auth_login_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- POST /admin/auth/logout (Cognito auth) ---
resource "aws_api_gateway_method" "admin_auth_logout_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_auth_logout.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_auth_logout_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_auth_logout.id
  http_method             = aws_api_gateway_method.admin_auth_logout_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_logout_invoke_arn
}

# --- OPTIONS /admin/auth/logout (CORS) ---
resource "aws_api_gateway_method" "admin_auth_logout_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_auth_logout.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_auth_logout_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_logout.id
  http_method = aws_api_gateway_method.admin_auth_logout_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_auth_logout_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_logout.id
  http_method = aws_api_gateway_method.admin_auth_logout_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_auth_logout_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_logout.id
  http_method = aws_api_gateway_method.admin_auth_logout_options.http_method
  status_code = aws_api_gateway_method_response.admin_auth_logout_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- POST /admin/auth/refresh (No auth) ---
resource "aws_api_gateway_method" "admin_auth_refresh_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_auth_refresh.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_auth_refresh_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_auth_refresh.id
  http_method             = aws_api_gateway_method.admin_auth_refresh_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_refresh_invoke_arn
}

# --- OPTIONS /admin/auth/refresh (CORS) ---
resource "aws_api_gateway_method" "admin_auth_refresh_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_auth_refresh.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_auth_refresh_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_refresh.id
  http_method = aws_api_gateway_method.admin_auth_refresh_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_auth_refresh_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_refresh.id
  http_method = aws_api_gateway_method.admin_auth_refresh_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_auth_refresh_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_auth_refresh.id
  http_method = aws_api_gateway_method.admin_auth_refresh_options.http_method
  status_code = aws_api_gateway_method_response.admin_auth_refresh_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- GET /posts (No auth - public) ---
resource "aws_api_gateway_method" "posts_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.posts.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "posts_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.posts.id
  http_method             = aws_api_gateway_method.posts_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_list_posts_invoke_arn
}

# --- OPTIONS /posts (CORS) ---
resource "aws_api_gateway_method" "posts_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.posts.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "posts_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.posts.id
  http_method = aws_api_gateway_method.posts_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "posts_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.posts.id
  http_method = aws_api_gateway_method.posts_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "posts_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.posts.id
  http_method = aws_api_gateway_method.posts_options.http_method
  status_code = aws_api_gateway_method_response.posts_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- GET /posts/{id} (No auth - public) ---
resource "aws_api_gateway_method" "posts_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.posts_id.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "posts_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.posts_id.id
  http_method             = aws_api_gateway_method.posts_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_get_public_post_invoke_arn
}

# --- OPTIONS /posts/{id} (CORS) ---
resource "aws_api_gateway_method" "posts_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.posts_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "posts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.posts_id.id
  http_method = aws_api_gateway_method.posts_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "posts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.posts_id.id
  http_method = aws_api_gateway_method.posts_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "posts_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.posts_id.id
  http_method = aws_api_gateway_method.posts_id_options.http_method
  status_code = aws_api_gateway_method_response.posts_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Categories API Resource Paths
# Requirement 2: Category List API
# ======================

# /categories resource (public)
# Requirement 2.3: Publicly accessible without authentication
resource "aws_api_gateway_resource" "categories" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "categories"
}

# --- GET /categories (No auth - public) ---
# Requirement 2.1: Return all categories sorted by sortOrder ascending
# Requirement 2.3: Publicly accessible without authentication
# Requirement 2.5: CORS headers
resource "aws_api_gateway_method" "categories_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.categories.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "categories_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.categories.id
  http_method             = aws_api_gateway_method.categories_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_list_categories_invoke_arn
}

# --- OPTIONS /categories (CORS) ---
# Requirement 2.5: CORS headers
resource "aws_api_gateway_method" "categories_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.categories.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "categories_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.categories.id
  http_method = aws_api_gateway_method.categories_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "categories_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.categories.id
  http_method = aws_api_gateway_method.categories_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "categories_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.categories.id
  http_method = aws_api_gateway_method.categories_options.http_method
  status_code = aws_api_gateway_method_response.categories_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Admin Categories API Resource Path
# Requirement 3: Category Creation API
# ======================

# /admin/categories resource
# Requirement 3.2: Cognito Authorizer for create endpoint
resource "aws_api_gateway_resource" "admin_categories" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "categories"
}

# --- POST /admin/categories (Cognito auth) ---
# Requirement 3.1: Create new category
# Requirement 3.2: Cognito Authorizer
resource "aws_api_gateway_method" "admin_categories_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_categories_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_categories.id
  http_method             = aws_api_gateway_method.admin_categories_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_create_category_invoke_arn
}

# --- OPTIONS /admin/categories (CORS) ---
resource "aws_api_gateway_method" "admin_categories_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_categories_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories.id
  http_method = aws_api_gateway_method.admin_categories_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_categories_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories.id
  http_method = aws_api_gateway_method.admin_categories_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_categories_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories.id
  http_method = aws_api_gateway_method.admin_categories_options.http_method
  status_code = aws_api_gateway_method_response.admin_categories_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Admin Categories ID API Resource Path
# Requirement 4: Category Update API
# ======================

# /admin/categories/{id} resource
# Requirement 4.2: PUT endpoint for category update
resource "aws_api_gateway_resource" "admin_categories_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_categories.id
  path_part   = "{id}"
}

# --- PUT /admin/categories/{id} (Cognito auth) ---
# Requirement 4.1: Update existing category
# Requirement 4.2: Cognito Authorizer
resource "aws_api_gateway_method" "admin_categories_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories_id.id
  http_method   = "PUT"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_categories_id_put" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_categories_id.id
  http_method             = aws_api_gateway_method.admin_categories_id_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_update_category_invoke_arn
}

# --- DELETE /admin/categories/{id} (Cognito auth) ---
# Requirement 5.1: Delete existing category
# Requirement 5.2: Cognito Authorizer
resource "aws_api_gateway_method" "admin_categories_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories_id.id
  http_method   = "DELETE"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_categories_id_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_categories_id.id
  http_method             = aws_api_gateway_method.admin_categories_id_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_delete_category_invoke_arn
}

# --- OPTIONS /admin/categories/{id} (CORS) ---
resource "aws_api_gateway_method" "admin_categories_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_categories_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories_id.id
  http_method = aws_api_gateway_method.admin_categories_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_categories_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories_id.id
  http_method = aws_api_gateway_method.admin_categories_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_categories_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories_id.id
  http_method = aws_api_gateway_method.admin_categories_id_options.http_method
  status_code = aws_api_gateway_method_response.admin_categories_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Admin Categories Sort API Resource Path
# Requirement 4B: Category Sort Order Bulk Update API
# ======================

# /admin/categories/sort resource
# Requirement 4B.2: PATCH endpoint for bulk sort order update
resource "aws_api_gateway_resource" "admin_categories_sort" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_categories.id
  path_part   = "sort"
}

# --- PATCH /admin/categories/sort (Cognito auth) ---
# Requirement 4B.1: Bulk update sortOrder
# Requirement 4B.2: Cognito Authorizer
resource "aws_api_gateway_method" "admin_categories_sort_patch" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories_sort.id
  http_method   = "PATCH"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_categories_sort_patch" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_categories_sort.id
  http_method             = aws_api_gateway_method.admin_categories_sort_patch.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_update_categories_sort_order_invoke_arn
}

# --- OPTIONS /admin/categories/sort (CORS) ---
resource "aws_api_gateway_method" "admin_categories_sort_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_categories_sort.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_categories_sort_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories_sort.id
  http_method = aws_api_gateway_method.admin_categories_sort_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_categories_sort_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories_sort.id
  http_method = aws_api_gateway_method.admin_categories_sort_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_categories_sort_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_categories_sort.id
  http_method = aws_api_gateway_method.admin_categories_sort_options.http_method
  status_code = aws_api_gateway_method_response.admin_categories_sort_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'PATCH,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Mindmaps Admin API Resource Paths
# ======================

# /admin/mindmaps resource
resource "aws_api_gateway_resource" "admin_mindmaps" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "mindmaps"
}

# /admin/mindmaps/{id} resource
resource "aws_api_gateway_resource" "admin_mindmaps_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_mindmaps.id
  path_part   = "{id}"
}

# --- POST /admin/mindmaps (Cognito auth) ---
resource "aws_api_gateway_method" "admin_mindmaps_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps.id
  http_method   = "POST"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_mindmaps_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_mindmaps.id
  http_method             = aws_api_gateway_method.admin_mindmaps_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_create_mindmap_invoke_arn
}

# --- GET /admin/mindmaps (Cognito auth) ---
resource "aws_api_gateway_method" "admin_mindmaps_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id
}

resource "aws_api_gateway_integration" "admin_mindmaps_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_mindmaps.id
  http_method             = aws_api_gateway_method.admin_mindmaps_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_list_mindmaps_invoke_arn
}

# --- OPTIONS /admin/mindmaps (CORS) ---
resource "aws_api_gateway_method" "admin_mindmaps_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_mindmaps_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_mindmaps.id
  http_method = aws_api_gateway_method.admin_mindmaps_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_mindmaps_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_mindmaps.id
  http_method = aws_api_gateway_method.admin_mindmaps_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_mindmaps_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_mindmaps.id
  http_method = aws_api_gateway_method.admin_mindmaps_options.http_method
  status_code = aws_api_gateway_method_response.admin_mindmaps_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- GET /admin/mindmaps/{id} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_mindmaps_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method   = "GET"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_mindmaps_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method             = aws_api_gateway_method.admin_mindmaps_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_get_mindmap_invoke_arn
}

# --- PUT /admin/mindmaps/{id} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_mindmaps_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method   = "PUT"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_mindmaps_id_put" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method             = aws_api_gateway_method.admin_mindmaps_id_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_update_mindmap_invoke_arn
}

# --- DELETE /admin/mindmaps/{id} (Cognito auth) ---
resource "aws_api_gateway_method" "admin_mindmaps_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method   = "DELETE"
  authorization = "COGNITO_USER_POOLS"
  authorizer_id = aws_api_gateway_authorizer.cognito.id

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "admin_mindmaps_id_delete" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method             = aws_api_gateway_method.admin_mindmaps_id_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_delete_mindmap_invoke_arn
}

# --- OPTIONS /admin/mindmaps/{id} (CORS) ---
resource "aws_api_gateway_method" "admin_mindmaps_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "admin_mindmaps_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method = aws_api_gateway_method.admin_mindmaps_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "admin_mindmaps_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method = aws_api_gateway_method.admin_mindmaps_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "admin_mindmaps_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_mindmaps_id.id
  http_method = aws_api_gateway_method.admin_mindmaps_id_options.http_method
  status_code = aws_api_gateway_method_response.admin_mindmaps_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Mindmaps Public API Resource Paths
# ======================

# /public resource
resource "aws_api_gateway_resource" "public" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "public"
}

# /public/mindmaps resource
resource "aws_api_gateway_resource" "public_mindmaps" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.public.id
  path_part   = "mindmaps"
}

# /public/mindmaps/{id} resource
resource "aws_api_gateway_resource" "public_mindmaps_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.public_mindmaps.id
  path_part   = "{id}"
}

# --- GET /public/mindmaps (No auth - public) ---
resource "aws_api_gateway_method" "public_mindmaps_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.public_mindmaps.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "public_mindmaps_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.public_mindmaps.id
  http_method             = aws_api_gateway_method.public_mindmaps_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_list_public_mindmaps_invoke_arn
}

# --- OPTIONS /public/mindmaps (CORS) ---
resource "aws_api_gateway_method" "public_mindmaps_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.public_mindmaps.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "public_mindmaps_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.public_mindmaps.id
  http_method = aws_api_gateway_method.public_mindmaps_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "public_mindmaps_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.public_mindmaps.id
  http_method = aws_api_gateway_method.public_mindmaps_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "public_mindmaps_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.public_mindmaps.id
  http_method = aws_api_gateway_method.public_mindmaps_options.http_method
  status_code = aws_api_gateway_method_response.public_mindmaps_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# --- GET /public/mindmaps/{id} (No auth - public) ---
resource "aws_api_gateway_method" "public_mindmaps_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.public_mindmaps_id.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.id" = true
  }
}

resource "aws_api_gateway_integration" "public_mindmaps_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.public_mindmaps_id.id
  http_method             = aws_api_gateway_method.public_mindmaps_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_get_public_mindmap_invoke_arn
}

# --- OPTIONS /public/mindmaps/{id} (CORS) ---
resource "aws_api_gateway_method" "public_mindmaps_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.public_mindmaps_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "public_mindmaps_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.public_mindmaps_id.id
  http_method = aws_api_gateway_method.public_mindmaps_id_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "public_mindmaps_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.public_mindmaps_id.id
  http_method = aws_api_gateway_method.public_mindmaps_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "public_mindmaps_id_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.public_mindmaps_id.id
  http_method = aws_api_gateway_method.public_mindmaps_id_options.http_method
  status_code = aws_api_gateway_method_response.public_mindmaps_id_options.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
  }
}

# ======================
# Gateway Responses (CORS)
# ======================

# Gateway Response for 4xx errors
# Requirement 5.3: Configure CORS for error responses
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

# Gateway Response for 5xx errors
# Requirement 5.3: Configure CORS for error responses
resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origins[0]}'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

# ======================
# CloudWatch Log Group (Production only)
# ======================

# CloudWatch Log Group for API Gateway Access Logs
resource "aws_cloudwatch_log_group" "api_access_logs" {
  count             = local.is_production ? 1 : 0
  name              = "/aws/apigateway/${var.api_name}"
  retention_in_days = 90

  tags = local.common_tags
}

# ======================
# API Gateway Deployment
# ======================

# API Gateway Deployment
# Note: This deployment is triggered by changes to resources and methods
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # Trigger redeployment when resources, methods, or integrations change
  triggers = {
    redeployment = sha1(jsonencode([
      # Resources
      aws_api_gateway_resource.admin.id,
      aws_api_gateway_resource.posts.id,
      aws_api_gateway_resource.posts_id.id,
      aws_api_gateway_resource.admin_posts.id,
      aws_api_gateway_resource.admin_posts_id.id,
      aws_api_gateway_resource.admin_images.id,
      aws_api_gateway_resource.admin_images_upload_url.id,
      aws_api_gateway_resource.admin_images_key.id,
      aws_api_gateway_resource.admin_auth.id,
      aws_api_gateway_resource.admin_auth_login.id,
      aws_api_gateway_resource.admin_auth_logout.id,
      aws_api_gateway_resource.admin_auth_refresh.id,
      aws_api_gateway_resource.categories.id,
      aws_api_gateway_resource.admin_categories.id,
      aws_api_gateway_resource.admin_categories_id.id,
      aws_api_gateway_resource.admin_categories_sort.id,
      aws_api_gateway_resource.admin_mindmaps.id,
      aws_api_gateway_resource.admin_mindmaps_id.id,
      aws_api_gateway_resource.public.id,
      aws_api_gateway_resource.public_mindmaps.id,
      aws_api_gateway_resource.public_mindmaps_id.id,
      # Authorizer
      aws_api_gateway_authorizer.cognito.id,
      # Gateway Responses
      aws_api_gateway_gateway_response.default_4xx.id,
      aws_api_gateway_gateway_response.default_5xx.id,
      # Methods
      aws_api_gateway_method.admin_posts_post.id,
      aws_api_gateway_method.admin_posts_get.id,
      aws_api_gateway_method.admin_posts_id_get.id,
      aws_api_gateway_method.admin_posts_id_put.id,
      aws_api_gateway_method.admin_posts_id_delete.id,
      aws_api_gateway_method.admin_images_upload_url_post.id,
      aws_api_gateway_method.admin_images_key_delete.id,
      aws_api_gateway_method.admin_auth_login_post.id,
      aws_api_gateway_method.admin_auth_logout_post.id,
      aws_api_gateway_method.admin_auth_refresh_post.id,
      aws_api_gateway_method.posts_get.id,
      aws_api_gateway_method.posts_id_get.id,
      aws_api_gateway_method.categories_get.id,
      aws_api_gateway_method.admin_categories_post.id,
      aws_api_gateway_method.admin_categories_id_put.id,
      aws_api_gateway_method.admin_categories_id_delete.id,
      aws_api_gateway_method.admin_categories_sort_patch.id,
      aws_api_gateway_method.admin_mindmaps_post.id,
      aws_api_gateway_method.admin_mindmaps_get.id,
      aws_api_gateway_method.admin_mindmaps_id_get.id,
      aws_api_gateway_method.admin_mindmaps_id_put.id,
      aws_api_gateway_method.admin_mindmaps_id_delete.id,
      aws_api_gateway_method.public_mindmaps_get.id,
      aws_api_gateway_method.public_mindmaps_id_get.id,
      # OPTIONS (CORS)
      aws_api_gateway_method.admin_mindmaps_options.id,
      aws_api_gateway_method.admin_mindmaps_id_options.id,
      aws_api_gateway_method.public_mindmaps_options.id,
      aws_api_gateway_method.public_mindmaps_id_options.id,
      # Integrations
      aws_api_gateway_integration.admin_posts_post.id,
      aws_api_gateway_integration.admin_posts_get.id,
      aws_api_gateway_integration.admin_posts_id_get.id,
      aws_api_gateway_integration.admin_posts_id_put.id,
      aws_api_gateway_integration.admin_posts_id_delete.id,
      aws_api_gateway_integration.admin_images_upload_url_post.id,
      aws_api_gateway_integration.admin_images_key_delete.id,
      aws_api_gateway_integration.admin_auth_login_post.id,
      aws_api_gateway_integration.admin_auth_logout_post.id,
      aws_api_gateway_integration.admin_auth_refresh_post.id,
      aws_api_gateway_integration.posts_get.id,
      aws_api_gateway_integration.posts_id_get.id,
      aws_api_gateway_integration.categories_get.id,
      aws_api_gateway_integration.admin_categories_post.id,
      aws_api_gateway_integration.admin_categories_id_put.id,
      aws_api_gateway_integration.admin_categories_id_delete.id,
      aws_api_gateway_integration.admin_categories_sort_patch.id,
      aws_api_gateway_integration.admin_mindmaps_post.id,
      aws_api_gateway_integration.admin_mindmaps_get.id,
      aws_api_gateway_integration.admin_mindmaps_id_get.id,
      aws_api_gateway_integration.admin_mindmaps_id_put.id,
      aws_api_gateway_integration.admin_mindmaps_id_delete.id,
      aws_api_gateway_integration.public_mindmaps_get.id,
      aws_api_gateway_integration.public_mindmaps_id_get.id,
      # OPTIONS integrations (CORS)
      aws_api_gateway_integration.admin_mindmaps_options.id,
      aws_api_gateway_integration.admin_mindmaps_id_options.id,
      aws_api_gateway_integration.public_mindmaps_options.id,
      aws_api_gateway_integration.public_mindmaps_id_options.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.admin_posts_post,
    aws_api_gateway_integration.admin_posts_get,
    aws_api_gateway_integration.admin_posts_id_get,
    aws_api_gateway_integration.admin_posts_id_put,
    aws_api_gateway_integration.admin_posts_id_delete,
    aws_api_gateway_integration.admin_images_upload_url_post,
    aws_api_gateway_integration.admin_images_key_delete,
    aws_api_gateway_integration.admin_auth_login_post,
    aws_api_gateway_integration.admin_auth_logout_post,
    aws_api_gateway_integration.admin_auth_refresh_post,
    aws_api_gateway_integration.posts_get,
    aws_api_gateway_integration.posts_id_get,
    aws_api_gateway_integration.categories_get,
    aws_api_gateway_integration.admin_categories_post,
    aws_api_gateway_integration.admin_categories_id_put,
    aws_api_gateway_integration.admin_categories_id_delete,
    aws_api_gateway_integration.admin_categories_sort_patch,
    aws_api_gateway_integration.admin_mindmaps_post,
    aws_api_gateway_integration.admin_mindmaps_get,
    aws_api_gateway_integration.admin_mindmaps_id_get,
    aws_api_gateway_integration.admin_mindmaps_id_put,
    aws_api_gateway_integration.admin_mindmaps_id_delete,
    aws_api_gateway_integration.public_mindmaps_get,
    aws_api_gateway_integration.public_mindmaps_id_get,
    # OPTIONS integrations (CORS)
    aws_api_gateway_integration.admin_mindmaps_options,
    aws_api_gateway_integration.admin_mindmaps_id_options,
    aws_api_gateway_integration.public_mindmaps_options,
    aws_api_gateway_integration.public_mindmaps_id_options,
  ]
}

# ======================
# API Gateway Stage
# ======================

# API Gateway Stage
# Requirement 5.6: Create dev and prd deployment stages
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.stage_name

  xray_tracing_enabled = local.is_production

  # Access log settings (production only)
  dynamic "access_log_settings" {
    for_each = local.is_production ? [1] : []
    content {
      destination_arn = aws_cloudwatch_log_group.api_access_logs[0].arn
      format = jsonencode({
        requestId         = "$context.requestId"
        ip                = "$context.identity.sourceIp"
        caller            = "$context.identity.caller"
        user              = "$context.identity.user"
        requestTime       = "$context.requestTime"
        httpMethod        = "$context.httpMethod"
        resourcePath      = "$context.resourcePath"
        status            = "$context.status"
        protocol          = "$context.protocol"
        responseLength    = "$context.responseLength"
        integrationError  = "$context.integrationErrorMessage"
        integrationStatus = "$context.integrationStatus"
      })
    }
  }

  tags = local.common_tags
}

# ======================
# Method Settings (Stage-level)
# ======================

# Method settings for all methods
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled        = local.is_production
    logging_level          = local.is_production ? "INFO" : "OFF"
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }
}

# ======================
# CloudWatch Role (Account-level)
# ======================

# IAM Role for API Gateway CloudWatch Logs
resource "aws_iam_role" "api_gateway_cloudwatch" {
  count = local.is_production ? 1 : 0
  name  = "${var.api_name}-api-gateway-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach CloudWatch Logs policy to API Gateway role
resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  count      = local.is_production ? 1 : 0
  role       = aws_iam_role.api_gateway_cloudwatch[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# API Gateway Account settings (for CloudWatch logging)
resource "aws_api_gateway_account" "main" {
  count               = local.is_production ? 1 : 0
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch[0].arn
}

# ======================
# Lambda Permissions for API Gateway
# ======================

resource "aws_lambda_permission" "create_post" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_create_post_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "list_posts" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_list_posts_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_post" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_get_post_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_public_post" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_get_public_post_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_post" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_update_post_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_post" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_delete_post_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "login" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_login_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "logout" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_logout_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "refresh" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_refresh_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_upload_url" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_get_upload_url_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_image" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_delete_image_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# ======================
# Categories Lambda Permissions
# ======================

resource "aws_lambda_permission" "list_categories" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_list_categories_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "create_category" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_create_category_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_category" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_update_category_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_categories_sort_order" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_update_categories_sort_order_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_category" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_delete_category_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# ======================
# Mindmaps Lambda Permissions
# ======================

resource "aws_lambda_permission" "create_mindmap" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_create_mindmap_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_mindmap" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_get_mindmap_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "list_mindmaps" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_list_mindmaps_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "update_mindmap" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_update_mindmap_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "delete_mindmap" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_delete_mindmap_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_public_mindmap" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_get_public_mindmap_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "list_public_mindmaps" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_list_public_mindmaps_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
