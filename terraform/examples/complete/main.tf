# Complete Deployment Example
# This example demonstrates a full deployment of the serverless blog platform
#
# Note: Due to circular dependencies (Lambda -> CDN -> API -> Lambda),
# cloudfront_domain is set after CDN creation. Initial deployment will have
# empty cloudfront_domain in Lambda functions.

terraform {
  required_version = "~> 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Example     = "complete"
    }
  }
}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

#------------------------------------------------------------------------------
# Module 1: Database (DynamoDB)
#------------------------------------------------------------------------------

module "database" {
  source = "../../modules/database"

  table_name            = "${var.project_name}-posts-${var.environment}"
  categories_table_name = "${var.project_name}-categories-${var.environment}"
  environment           = var.environment
  enable_pitr           = var.enable_pitr

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# Module 2: Auth (Cognito)
#------------------------------------------------------------------------------

module "auth" {
  source = "../../modules/auth"

  user_pool_name          = "${var.project_name}-${var.environment}"
  environment             = var.environment
  mfa_configuration       = var.mfa_configuration
  password_minimum_length = var.password_minimum_length

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# Module 3: Storage (S3)
#------------------------------------------------------------------------------

module "storage" {
  source = "../../modules/storage"

  project_name                = var.project_name
  environment                 = var.environment
  enable_access_logs          = var.enable_access_logs
  cloudfront_distribution_arn = ""

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# Module 4: Lambda Functions
# Dependencies: database, storage, auth
# Note: cloudfront_domain is empty initially (circular dependency)
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
  cloudfront_domain   = "" # Set after CDN creation to break circular dependency
  enable_xray         = var.enable_xray
  go_binary_path      = var.go_binary_path

  # Categories domain
  categories_table_name = module.database.categories_table_name
  categories_table_arn  = module.database.categories_table_arn

  # CodeBuild integration (empty for examples - not using CodeBuild)
  codebuild_project_name = ""
  codebuild_project_arn  = ""

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
  cors_allow_origins    = var.cors_allow_origins

  # Lambda function ARNs
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
  price_class                             = var.cloudfront_price_class

  tags = local.common_tags

  depends_on = [module.storage, module.api]
}

#------------------------------------------------------------------------------
# S3 Bucket Policies for CloudFront OAC
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
# Module 7: Monitoring (CloudWatch)
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
  enable_alarms         = var.enable_alarms

  tags = local.common_tags

  depends_on = [module.lambda, module.database, module.api]
}
