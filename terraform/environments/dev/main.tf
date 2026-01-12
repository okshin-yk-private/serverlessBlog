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
  table_name            = "${var.project_name}-posts"
  categories_table_name = "${var.project_name}-categories"
  environment           = var.environment
  enable_pitr           = true

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
# Module 4: Lambda Functions
# Dependencies: database, storage, auth
# Note: cloudfront_domain will be updated after CDN module is created
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
  cloudfront_domain   = ""    # Will be updated after CDN creation (see below)
  enable_xray         = false # X-Ray disabled for dev
  go_binary_path      = "${path.module}/../../../go-functions/bin"

  # Categories domain
  categories_table_name = module.database.categories_table_name
  categories_table_arn  = module.database.categories_table_arn

  tags = local.common_tags

  depends_on = [module.database, module.storage, module.auth]
}

#------------------------------------------------------------------------------
# Module 5: API Gateway
# Dependencies: auth (for Cognito Authorizer), lambda (for function ARNs)
#------------------------------------------------------------------------------

module "api" {
  source = "../../modules/api"

  api_name              = "${var.project_name}-api-${var.environment}"
  environment           = var.environment
  stage_name            = var.environment
  cognito_user_pool_arn = module.auth.user_pool_arn
  cors_allow_origins    = ["*"]

  # Lambda function ARNs (from Lambda module outputs)
  lambda_create_post_arn            = module.lambda.function_arns["create_post"]
  lambda_create_post_invoke_arn     = module.lambda.function_invoke_arns["create_post"]
  lambda_list_posts_arn             = module.lambda.function_arns["list_posts"]
  lambda_list_posts_invoke_arn      = module.lambda.function_invoke_arns["list_posts"]
  lambda_get_post_arn               = module.lambda.function_arns["get_post"]
  lambda_get_post_invoke_arn        = module.lambda.function_invoke_arns["get_post"]
  lambda_get_public_post_arn        = module.lambda.function_arns["get_public_post"]
  lambda_get_public_post_invoke_arn = module.lambda.function_invoke_arns["get_public_post"]
  lambda_update_post_arn            = module.lambda.function_arns["update_post"]
  lambda_update_post_invoke_arn     = module.lambda.function_invoke_arns["update_post"]
  lambda_delete_post_arn            = module.lambda.function_arns["delete_post"]
  lambda_delete_post_invoke_arn     = module.lambda.function_invoke_arns["delete_post"]
  lambda_login_arn                  = module.lambda.function_arns["login"]
  lambda_login_invoke_arn           = module.lambda.function_invoke_arns["login"]
  lambda_logout_arn                 = module.lambda.function_arns["logout"]
  lambda_logout_invoke_arn          = module.lambda.function_invoke_arns["logout"]
  lambda_refresh_arn                = module.lambda.function_arns["refresh"]
  lambda_refresh_invoke_arn         = module.lambda.function_invoke_arns["refresh"]
  lambda_get_upload_url_arn         = module.lambda.function_arns["get_upload_url"]
  lambda_get_upload_url_invoke_arn  = module.lambda.function_invoke_arns["get_upload_url"]
  lambda_delete_image_arn           = module.lambda.function_arns["delete_image"]
  lambda_delete_image_invoke_arn    = module.lambda.function_invoke_arns["delete_image"]

  # Categories Lambda function ARNs
  lambda_list_categories_arn                     = module.lambda.function_arns["list_categories"]
  lambda_list_categories_invoke_arn              = module.lambda.function_invoke_arns["list_categories"]
  lambda_create_category_arn                     = module.lambda.function_arns["create_category"]
  lambda_create_category_invoke_arn              = module.lambda.function_invoke_arns["create_category"]
  lambda_update_category_arn                     = module.lambda.function_arns["update_category"]
  lambda_update_category_invoke_arn              = module.lambda.function_invoke_arns["update_category"]
  lambda_update_categories_sort_order_arn        = module.lambda.function_arns["update_categories_sort_order"]
  lambda_update_categories_sort_order_invoke_arn = module.lambda.function_invoke_arns["update_categories_sort_order"]
  lambda_delete_category_arn                     = module.lambda.function_arns["delete_category"]
  lambda_delete_category_invoke_arn              = module.lambda.function_invoke_arns["delete_category"]

  tags = local.common_tags

  depends_on = [module.auth, module.lambda]
}

#------------------------------------------------------------------------------
# Module 6: CDN (CloudFront)
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
# Update Lambda with CloudFront domain
# This updates Lambda environment variables after CDN is created
#------------------------------------------------------------------------------

# Note: Lambda functions will receive the CloudFront domain through a second
# apply or can be configured manually. The domain is used for CORS headers.
# For now, using a null_resource to document this dependency.
# In a production setup, consider using SSM Parameter Store or Secrets Manager.

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
