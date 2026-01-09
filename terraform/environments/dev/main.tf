# Main configuration for dev environment
# Requirements: 1.6 - Module calls with environment-specific variables

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

#------------------------------------------------------------------------------
# Module 1: Database (DynamoDB)
# Dependencies: None
#------------------------------------------------------------------------------

module "database" {
  source = "../../modules/database"

  # Note: CDK created table without -dev suffix
  table_name  = "${var.project_name}-posts"
  environment = var.environment
  enable_pitr = true

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# Module 2: Auth (Cognito)
# Dependencies: None
#------------------------------------------------------------------------------

module "auth" {
  source = "../../modules/auth"

  # Note: CDK created user pool as "serverless-blog-user-pool"
  user_pool_name          = "${var.project_name}-user-pool"
  environment             = var.environment
  mfa_configuration       = "OPTIONAL"
  password_minimum_length = 12

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# Module 3: Storage (S3)
# Dependencies: None (bucket policies added separately after CDN creation)
#------------------------------------------------------------------------------

module "storage" {
  source = "../../modules/storage"

  project_name                = var.project_name
  environment                 = var.environment
  enable_access_logs          = false # Access logs not enabled for dev
  cloudfront_distribution_arn = ""    # Bucket policy set separately to avoid circular dependency

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# Data Sources: Lambda Functions (for API Gateway integration)
# These reference existing Lambda functions to break circular dependency
#------------------------------------------------------------------------------

data "aws_lambda_function" "create_post" {
  function_name = "blog-create-post-go"
}

data "aws_lambda_function" "list_posts" {
  function_name = "blog-list-posts-go"
}

data "aws_lambda_function" "get_post" {
  function_name = "blog-get-post-go"
}

data "aws_lambda_function" "get_public_post" {
  function_name = "blog-get-public-post-go"
}

data "aws_lambda_function" "update_post" {
  function_name = "blog-update-post-go"
}

data "aws_lambda_function" "delete_post" {
  function_name = "blog-delete-post-go"
}

data "aws_lambda_function" "login" {
  function_name = "blog-login-go"
}

data "aws_lambda_function" "logout" {
  function_name = "blog-logout-go"
}

data "aws_lambda_function" "refresh" {
  function_name = "blog-refresh-go"
}

data "aws_lambda_function" "get_upload_url" {
  function_name = "blog-upload-url-go"
}

data "aws_lambda_function" "delete_image" {
  function_name = "blog-delete-image-go"
}

#------------------------------------------------------------------------------
# Module 4: API Gateway
# Dependencies: auth (for Cognito Authorizer), Lambda data sources
#------------------------------------------------------------------------------

module "api" {
  source = "../../modules/api"

  api_name              = "${var.project_name}-api-${var.environment}"
  environment           = var.environment
  stage_name            = var.environment
  cognito_user_pool_arn = module.auth.user_pool_arn
  cors_allow_origins    = ["*"]

  # Lambda function ARNs (from data sources)
  lambda_create_post_arn            = data.aws_lambda_function.create_post.arn
  lambda_create_post_invoke_arn     = data.aws_lambda_function.create_post.invoke_arn
  lambda_list_posts_arn             = data.aws_lambda_function.list_posts.arn
  lambda_list_posts_invoke_arn      = data.aws_lambda_function.list_posts.invoke_arn
  lambda_get_post_arn               = data.aws_lambda_function.get_post.arn
  lambda_get_post_invoke_arn        = data.aws_lambda_function.get_post.invoke_arn
  lambda_get_public_post_arn        = data.aws_lambda_function.get_public_post.arn
  lambda_get_public_post_invoke_arn = data.aws_lambda_function.get_public_post.invoke_arn
  lambda_update_post_arn            = data.aws_lambda_function.update_post.arn
  lambda_update_post_invoke_arn     = data.aws_lambda_function.update_post.invoke_arn
  lambda_delete_post_arn            = data.aws_lambda_function.delete_post.arn
  lambda_delete_post_invoke_arn     = data.aws_lambda_function.delete_post.invoke_arn
  lambda_login_arn                  = data.aws_lambda_function.login.arn
  lambda_login_invoke_arn           = data.aws_lambda_function.login.invoke_arn
  lambda_logout_arn                 = data.aws_lambda_function.logout.arn
  lambda_logout_invoke_arn          = data.aws_lambda_function.logout.invoke_arn
  lambda_refresh_arn                = data.aws_lambda_function.refresh.arn
  lambda_refresh_invoke_arn         = data.aws_lambda_function.refresh.invoke_arn
  lambda_get_upload_url_arn         = data.aws_lambda_function.get_upload_url.arn
  lambda_get_upload_url_invoke_arn  = data.aws_lambda_function.get_upload_url.invoke_arn
  lambda_delete_image_arn           = data.aws_lambda_function.delete_image.arn
  lambda_delete_image_invoke_arn    = data.aws_lambda_function.delete_image.invoke_arn

  tags = local.common_tags

  depends_on = [module.auth]
}

#------------------------------------------------------------------------------
# Module 5: CDN (CloudFront)
# Dependencies: storage (for S3 buckets), api (for API Gateway origin)
#------------------------------------------------------------------------------

module "cdn" {
  source = "../../modules/cdn"

  environment                             = var.environment
  image_bucket_name                       = module.storage.image_bucket_name
  image_bucket_regional_domain_name       = module.storage.image_bucket_regional_domain_name
  public_site_bucket_name                 = module.storage.public_site_bucket_name
  public_site_bucket_regional_domain_name = module.storage.public_site_bucket_regional_domain_name
  admin_site_bucket_name                  = module.storage.admin_site_bucket_name
  admin_site_bucket_regional_domain_name  = module.storage.admin_site_bucket_regional_domain_name
  rest_api_id                             = module.api.rest_api_id
  api_stage_name                          = module.api.stage_name
  aws_region                              = var.aws_region
  price_class                             = "PriceClass_100"

  # Basic Auth for dev environment protection (matches CDK configuration)
  enable_basic_auth   = var.basic_auth_username != "" && var.basic_auth_password != ""
  basic_auth_username = var.basic_auth_username
  basic_auth_password = var.basic_auth_password

  tags = local.common_tags

  depends_on = [module.storage, module.api]
}

#------------------------------------------------------------------------------
# S3 Bucket Policies for CloudFront OAC
# Created after CDN module to avoid circular dependency
#------------------------------------------------------------------------------

resource "aws_s3_bucket_policy" "images_cloudfront" {
  bucket = module.storage.image_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${module.storage.image_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cdn.distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.cdn]
}

resource "aws_s3_bucket_policy" "public_site_cloudfront" {
  bucket = module.storage.public_site_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${module.storage.public_site_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cdn.distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.cdn]
}

resource "aws_s3_bucket_policy" "admin_site_cloudfront" {
  bucket = module.storage.admin_site_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${module.storage.admin_site_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cdn.distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.cdn]
}

#------------------------------------------------------------------------------
# Module 6: Lambda Functions
# Dependencies: database, storage, auth, cdn
#------------------------------------------------------------------------------

module "lambda" {
  source = "../../modules/lambda"

  environment         = var.environment
  table_name          = module.database.table_name
  table_arn           = module.database.table_arn
  bucket_name         = module.storage.image_bucket_name
  bucket_arn          = module.storage.image_bucket_arn
  user_pool_id        = module.auth.user_pool_id
  user_pool_arn       = module.auth.user_pool_arn
  user_pool_client_id = module.auth.user_pool_client_id
  cloudfront_domain   = module.cdn.distribution_domain_name
  enable_xray         = false # X-Ray disabled for dev
  go_binary_path      = "${path.module}/../../../go-functions/bin"

  tags = local.common_tags

  depends_on = [module.database, module.storage, module.auth, module.cdn]
}

#------------------------------------------------------------------------------
# Module 7: Monitoring (CloudWatch)
# Dependencies: lambda, database, api
# Note: Alarms disabled for dev environment
#------------------------------------------------------------------------------

module "monitoring" {
  source = "../../modules/monitoring"

  environment           = var.environment
  project_name          = var.project_name
  alarm_email           = var.alarm_email
  lambda_function_names = module.lambda.function_names
  dynamodb_table_names  = [module.database.table_name]
  api_gateway_name      = "${var.project_name}-api-${var.environment}"
  api_gateway_stage     = var.environment
  enable_alarms         = false # Alarms disabled for dev

  tags = local.common_tags

  depends_on = [module.lambda, module.database, module.api]
}
