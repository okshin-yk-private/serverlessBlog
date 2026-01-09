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
# Gateway Responses (CORS)
# ======================

# Gateway Response for 4xx errors
# Requirement 5.3: Configure CORS for error responses
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }
}

# Gateway Response for 5xx errors
# Requirement 5.3: Configure CORS for error responses
resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
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
# Note: This deployment is triggered by changes to resources
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # Trigger redeployment when resources change
  triggers = {
    redeployment = sha1(jsonencode([
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
      aws_api_gateway_authorizer.cognito.id,
      aws_api_gateway_gateway_response.default_4xx.id,
      aws_api_gateway_gateway_response.default_5xx.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
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
    metrics_enabled = local.is_production
    logging_level   = local.is_production ? "INFO" : "OFF"
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
