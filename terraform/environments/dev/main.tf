# Main configuration for dev environment
# Requirements: 1.6 - Module calls with environment-specific variables

# Get current AWS account ID for constructing ARNs
data "aws_caller_identity" "current" {}

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
  mindmaps_table_name   = "${var.project_name}-mindmaps"
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

  # Mindmaps domain
  mindmaps_table_name = module.database.mindmaps_table_name
  mindmaps_table_arn  = module.database.mindmaps_table_arn

  # CodeBuild integration for posts/update Lambda
  # Note: CodeBuild project name follows predictable pattern so we can set it before CodeBuild module exists
  # The actual CodeBuild project is created after CDN to get the distribution ID
  # Requirement 10.1: Trigger CodeBuild when post is published
  codebuild_project_name = "${var.project_name}-astro-build-${var.environment}"
  codebuild_project_arn  = "arn:aws:codebuild:${var.aws_region}:${data.aws_caller_identity.current.account_id}:project/${var.project_name}-astro-build-${var.environment}"

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

  # Mindmaps Lambda function ARNs
  lambda_create_mindmap_arn              = module.lambda.function_arns["create_mindmap"]
  lambda_create_mindmap_invoke_arn       = module.lambda.function_invoke_arns["create_mindmap"]
  lambda_get_mindmap_arn                 = module.lambda.function_arns["get_mindmap"]
  lambda_get_mindmap_invoke_arn          = module.lambda.function_invoke_arns["get_mindmap"]
  lambda_list_mindmaps_arn               = module.lambda.function_arns["list_mindmaps"]
  lambda_list_mindmaps_invoke_arn        = module.lambda.function_invoke_arns["list_mindmaps"]
  lambda_update_mindmap_arn              = module.lambda.function_arns["update_mindmap"]
  lambda_update_mindmap_invoke_arn       = module.lambda.function_invoke_arns["update_mindmap"]
  lambda_delete_mindmap_arn              = module.lambda.function_arns["delete_mindmap"]
  lambda_delete_mindmap_invoke_arn       = module.lambda.function_invoke_arns["delete_mindmap"]
  lambda_get_public_mindmap_arn          = module.lambda.function_arns["get_public_mindmap"]
  lambda_get_public_mindmap_invoke_arn   = module.lambda.function_invoke_arns["get_public_mindmap"]
  lambda_list_public_mindmaps_arn        = module.lambda.function_arns["list_public_mindmaps"]
  lambda_list_public_mindmaps_invoke_arn = module.lambda.function_invoke_arns["list_public_mindmaps"]

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

  # Custom domain configuration
  # Note: acm_certificate_arn should only be set after ACM validation is complete
  use_custom_domain   = var.enable_custom_domain
  domain_names        = var.enable_custom_domain ? [var.domain_name] : []
  acm_certificate_arn = var.enable_custom_domain ? module.acm[0].validated_certificate_arn : ""

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
  dynamodb_table_names  = [module.database.table_name, module.database.mindmaps_table_name]
  api_gateway_name      = "${var.project_name}-api-${var.environment}"
  api_gateway_stage     = var.environment
  enable_alarms         = false # Alarms disabled for dev

  tags = local.common_tags

  depends_on = [module.lambda, module.database, module.api]
}

#------------------------------------------------------------------------------
# Module 8: CodeBuild (Astro SSG Build)
# Dependencies: storage (for S3 bucket), cdn (for CloudFront distribution)
# Requirements: 8.5, 9.5, 9.6 (Astro SSG Migration spec)
#------------------------------------------------------------------------------

module "codebuild" {
  source = "../../modules/codebuild"

  project_name               = var.project_name
  environment                = var.environment
  public_site_bucket_name    = module.storage.public_site_bucket_name
  public_site_bucket_arn     = module.storage.public_site_bucket_arn
  cloudfront_distribution_id = module.cdn.distribution_id
  api_url                    = module.cdn.api_base_url

  # GitHub source configuration for Astro SSG builds
  github_repo   = "https://github.com/okshin-yk-private/serverlessBlog.git"
  github_branch = "develop"

  tags = local.common_tags

  depends_on = [module.storage, module.cdn]
}

#------------------------------------------------------------------------------
# Custom Domain Configuration (Optional)
# Dependencies: cdn (for CloudFront domain)
# Enable with: enable_custom_domain = true
#------------------------------------------------------------------------------

# ACM Certificate (us-east-1 required for CloudFront)
module "acm" {
  source = "../../modules/acm"
  providers = {
    aws = aws.us_east_1
  }

  count = var.enable_custom_domain ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = [] # Single domain only for dev
  environment               = var.environment
  project_name              = var.project_name

  # Wait for validation after DNS records are created
  wait_for_validation     = true
  validation_record_fqdns = var.enable_custom_domain ? module.dns_route53[0].acm_validation_record_fqdns : []
}

# Route53 Hosted Zone for dev subdomain
# Note: cloudfront_domain_name is NOT passed here to avoid circular dependency
# The A/AAAA records pointing to CloudFront are created separately below
module "dns_route53" {
  source = "../../modules/dns-route53"

  count = var.enable_custom_domain ? 1 : 0

  zone_name              = var.domain_name # dev.boneofmyfallacy.net
  cloudfront_domain_name = ""              # Created separately after CDN to avoid cycle
  environment            = var.environment
  project_name           = var.project_name

  # ACM validation records
  acm_domain_validation_options = var.enable_custom_domain ? module.acm[0].domain_validation_options : []
}

# Cloudflare NS delegation for dev subdomain
module "dns_cloudflare" {
  source = "../../modules/dns-cloudflare"

  count = var.enable_custom_domain ? 1 : 0

  zone_name   = var.parent_domain # boneofmyfallacy.net
  environment = var.environment

  # NS delegation to Route53
  enable_ns_delegation  = true
  subdomain_to_delegate = "dev"
  route53_ns_records    = module.dns_route53[0].name_servers

  # Don't create apex/www records (those are for prod)
  create_apex_record = false
  create_www_record  = false

  # ACM validation handled by Route53 for dev
  acm_domain_validation_options = []

  depends_on = [module.dns_route53]
}

#------------------------------------------------------------------------------
# Route53 A/AAAA Records for CloudFront
# Created separately to avoid circular dependency:
# CDN needs validated certificate → ACM needs Route53 validation records →
# Route53 would need CDN domain (cycle!)
# By separating these records, the cycle is broken.
#------------------------------------------------------------------------------

resource "aws_route53_record" "cloudfront_apex" {
  count = var.enable_custom_domain ? 1 : 0

  zone_id = module.dns_route53[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.cdn.distribution_domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront hosted zone ID (constant)
    evaluate_target_health = false
  }

  depends_on = [module.cdn]
}

resource "aws_route53_record" "cloudfront_apex_ipv6" {
  count = var.enable_custom_domain ? 1 : 0

  zone_id = module.dns_route53[0].zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = module.cdn.distribution_domain_name
    zone_id                = "Z2FDTNDATAQYW2" # CloudFront hosted zone ID (constant)
    evaluate_target_health = false
  }

  depends_on = [module.cdn]
}
