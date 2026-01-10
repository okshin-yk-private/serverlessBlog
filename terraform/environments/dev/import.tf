# Dev Environment - Import Blocks for CDK to Terraform Migration
# These import blocks must be in the root module
#
# Usage:
# 1. Run `terraform plan` to verify imports
# 2. Run `terraform apply` to perform the imports
# 3. Comment out or remove after successful import

#------------------------------------------------------------------------------
# Database Module Imports
#------------------------------------------------------------------------------
import {
  to = module.database.aws_dynamodb_table.blog_posts
  id = "serverless-blog-posts"
}

#------------------------------------------------------------------------------
# Auth Module Imports
#------------------------------------------------------------------------------
import {
  to = module.auth.aws_cognito_user_pool.main
  id = "ap-northeast-1_GWhOM3BpU"
}

import {
  to = module.auth.aws_cognito_user_pool_client.main
  id = "ap-northeast-1_GWhOM3BpU/7mp44ekvp0pgmv20hv1bm10h78"
}

#------------------------------------------------------------------------------
# Storage Module Imports
#------------------------------------------------------------------------------
# S3 Buckets
import {
  to = module.storage.aws_s3_bucket.images
  id = "serverless-blog-images-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket.public_site
  id = "serverless-blog-public-site-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket.admin_site
  id = "serverless-blog-admin-site-dev-881302602065"
}

# Image Bucket Sub-Resources
import {
  to = module.storage.aws_s3_bucket_versioning.images
  id = "serverless-blog-images-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket_server_side_encryption_configuration.images
  id = "serverless-blog-images-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket_public_access_block.images
  id = "serverless-blog-images-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket_lifecycle_configuration.images
  id = "serverless-blog-images-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket_cors_configuration.images
  id = "serverless-blog-images-dev-881302602065"
}

# Public Site Bucket Sub-Resources
import {
  to = module.storage.aws_s3_bucket_server_side_encryption_configuration.public_site
  id = "serverless-blog-public-site-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket_public_access_block.public_site
  id = "serverless-blog-public-site-dev-881302602065"
}

# Admin Site Bucket Sub-Resources
import {
  to = module.storage.aws_s3_bucket_server_side_encryption_configuration.admin_site
  id = "serverless-blog-admin-site-dev-881302602065"
}

import {
  to = module.storage.aws_s3_bucket_public_access_block.admin_site
  id = "serverless-blog-admin-site-dev-881302602065"
}

#------------------------------------------------------------------------------
# API Module Imports
#------------------------------------------------------------------------------
import {
  to = module.api.aws_api_gateway_rest_api.main
  id = "4lfu0fgsk3"
}

import {
  to = module.api.aws_api_gateway_authorizer.cognito
  id = "4lfu0fgsk3/klt512"
}

import {
  to = module.api.aws_api_gateway_request_validator.main
  id = "4lfu0fgsk3/6nrld8"
}

import {
  to = module.api.aws_api_gateway_gateway_response.default_4xx
  id = "4lfu0fgsk3/DEFAULT_4XX"
}

import {
  to = module.api.aws_api_gateway_gateway_response.default_5xx
  id = "4lfu0fgsk3/DEFAULT_5XX"
}

# API Resources
import {
  to = module.api.aws_api_gateway_resource.admin
  id = "4lfu0fgsk3/53axfk"
}

import {
  to = module.api.aws_api_gateway_resource.posts
  id = "4lfu0fgsk3/7zl3r1"
}

import {
  to = module.api.aws_api_gateway_resource.posts_id
  id = "4lfu0fgsk3/zmx8tv"
}

import {
  to = module.api.aws_api_gateway_resource.admin_posts
  id = "4lfu0fgsk3/deqwrc"
}

import {
  to = module.api.aws_api_gateway_resource.admin_posts_id
  id = "4lfu0fgsk3/t1uzm7"
}

import {
  to = module.api.aws_api_gateway_resource.admin_images
  id = "4lfu0fgsk3/osory9"
}

import {
  to = module.api.aws_api_gateway_resource.admin_images_upload_url
  id = "4lfu0fgsk3/klcop4"
}

import {
  to = module.api.aws_api_gateway_resource.admin_images_key
  id = "4lfu0fgsk3/m72w81"
}

import {
  to = module.api.aws_api_gateway_resource.admin_auth
  id = "4lfu0fgsk3/zg5axl"
}

import {
  to = module.api.aws_api_gateway_resource.admin_auth_login
  id = "4lfu0fgsk3/e1qjrn"
}

import {
  to = module.api.aws_api_gateway_resource.admin_auth_logout
  id = "4lfu0fgsk3/s4tg1s"
}

import {
  to = module.api.aws_api_gateway_resource.admin_auth_refresh
  id = "4lfu0fgsk3/e106oi"
}

# Stage doesn't exist yet - will be created by Terraform
# import {
#   to = module.api.aws_api_gateway_stage.main
#   id = "4lfu0fgsk3/dev"
# }

#------------------------------------------------------------------------------
# CDN Module Imports - CloudFront Functions
# These functions were retained when CDK stack was deleted
#------------------------------------------------------------------------------
import {
  to = module.cdn.aws_cloudfront_function.image_path
  id = "ImagePathFunction-dev"
}

import {
  to = module.cdn.aws_cloudfront_function.api_path
  id = "ApiPathFunction-dev"
}

# Note: With enable_basic_auth = true:
# - admin_spa (count=0) is NOT created
# - basic_auth (count=1) IS created
# - admin_combined (count=1) IS created
# Existing AdminSpaFunction-dev in AWS must be deleted manually before apply
