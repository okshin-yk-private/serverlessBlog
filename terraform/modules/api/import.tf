# API Module - Import Blocks
# Requirements: 9.1, 9.4
#
# This file contains import blocks for migrating existing CDK-managed API Gateway resources
# to Terraform management. The import blocks should be uncommented during the migration
# phase and removed after successful import.
#
# CDK Stack: ApiStack, ApiIntegrationsStack
# CDK Resources:
#   - BlogApi (REST API)
#   - BlogCognitoAuthorizer (Cognito Authorizer)
#   - RequestValidator
#   - Gateway Responses (4xx, 5xx)
#   - API Resources (/admin, /posts, etc.)
#
# Usage:
# 1. Get the REST API ID from AWS Console or CDK output
# 2. Uncomment the import blocks below
# 3. Run `terraform plan` to verify the import will succeed with no changes
# 4. Run `terraform apply` to perform the import
# 5. Verify the state matches the actual AWS resources
# 6. Comment out or remove the import blocks after successful import

# ====================
# Step 1: Import REST API (Required first - other resources depend on it)
# ====================

# Uncomment the following block to import the existing REST API
# import {
#   to = aws_api_gateway_rest_api.main
#   id = "xxxxxxxxxx"  # Replace with actual REST API ID from CDK deployment
# }

# ====================
# Step 2: Import Cognito Authorizer
# ====================

# Uncomment the following block to import the Cognito Authorizer
# import {
#   to = aws_api_gateway_authorizer.cognito
#   id = "xxxxxxxxxx/yyyyyyyy"  # Format: {rest_api_id}/{authorizer_id}
# }

# ====================
# Step 3: Import Request Validator
# ====================

# Uncomment the following block to import the Request Validator
# import {
#   to = aws_api_gateway_request_validator.main
#   id = "xxxxxxxxxx/zzzzzzzz"  # Format: {rest_api_id}/{validator_id}
# }

# ====================
# Step 4: Import Gateway Responses
# ====================

# Uncomment to import 4xx Gateway Response
# import {
#   to = aws_api_gateway_gateway_response.default_4xx
#   id = "xxxxxxxxxx/DEFAULT_4XX"  # Format: {rest_api_id}/{response_type}
# }

# Uncomment to import 5xx Gateway Response
# import {
#   to = aws_api_gateway_gateway_response.default_5xx
#   id = "xxxxxxxxxx/DEFAULT_5XX"  # Format: {rest_api_id}/{response_type}
# }

# ====================
# Step 5: Import API Resources
# ====================

# Note: Resources must be imported in parent-to-child order
# Get resource IDs from AWS Console: API Gateway -> Resources -> Select resource -> Resource ID

# /admin resource
# import {
#   to = aws_api_gateway_resource.admin
#   id = "xxxxxxxxxx/aaaaaa"  # Format: {rest_api_id}/{resource_id}
# }

# /posts resource
# import {
#   to = aws_api_gateway_resource.posts
#   id = "xxxxxxxxxx/bbbbbb"  # Format: {rest_api_id}/{resource_id}
# }

# /posts/{id} resource
# import {
#   to = aws_api_gateway_resource.posts_id
#   id = "xxxxxxxxxx/cccccc"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/posts resource
# import {
#   to = aws_api_gateway_resource.admin_posts
#   id = "xxxxxxxxxx/dddddd"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/posts/{id} resource
# import {
#   to = aws_api_gateway_resource.admin_posts_id
#   id = "xxxxxxxxxx/eeeeee"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/images resource
# import {
#   to = aws_api_gateway_resource.admin_images
#   id = "xxxxxxxxxx/ffffff"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/images/upload-url resource
# import {
#   to = aws_api_gateway_resource.admin_images_upload_url
#   id = "xxxxxxxxxx/gggggg"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/images/{key+} resource
# import {
#   to = aws_api_gateway_resource.admin_images_key
#   id = "xxxxxxxxxx/hhhhhh"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/auth resource
# import {
#   to = aws_api_gateway_resource.admin_auth
#   id = "xxxxxxxxxx/iiiiii"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/auth/login resource
# import {
#   to = aws_api_gateway_resource.admin_auth_login
#   id = "xxxxxxxxxx/jjjjjj"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/auth/logout resource
# import {
#   to = aws_api_gateway_resource.admin_auth_logout
#   id = "xxxxxxxxxx/kkkkkk"  # Format: {rest_api_id}/{resource_id}
# }

# /admin/auth/refresh resource
# import {
#   to = aws_api_gateway_resource.admin_auth_refresh
#   id = "xxxxxxxxxx/llllll"  # Format: {rest_api_id}/{resource_id}
# }

# ====================
# Step 6: Import Deployment and Stage
# ====================

# Note: Stage imports require deployment to exist first
# Deployment should be recreated by Terraform, not imported

# Uncomment to import Stage
# import {
#   to = aws_api_gateway_stage.main
#   id = "xxxxxxxxxx/dev"  # Format: {rest_api_id}/{stage_name}
# }

# ====================
# Migration Notes
# ====================
#
# CDK Logical ID to Terraform Resource Mapping:
# +--------------------------------+-------------------------------------------+
# | CDK Logical ID                 | Terraform Resource Address                |
# +--------------------------------+-------------------------------------------+
# | BlogApi                        | aws_api_gateway_rest_api.main             |
# | BlogCognitoAuthorizer          | aws_api_gateway_authorizer.cognito        |
# | RequestValidator               | aws_api_gateway_request_validator.main    |
# | Default4xx                     | aws_api_gateway_gateway_response.default_4xx |
# | Default5xx                     | aws_api_gateway_gateway_response.default_5xx |
# +--------------------------------+-------------------------------------------+
#
# Resource Path Mapping:
# +---------------------------+------------------------------------------------+
# | API Path                  | Terraform Resource Address                     |
# +---------------------------+------------------------------------------------+
# | /admin                    | aws_api_gateway_resource.admin                 |
# | /posts                    | aws_api_gateway_resource.posts                 |
# | /posts/{id}               | aws_api_gateway_resource.posts_id              |
# | /admin/posts              | aws_api_gateway_resource.admin_posts           |
# | /admin/posts/{id}         | aws_api_gateway_resource.admin_posts_id        |
# | /admin/images             | aws_api_gateway_resource.admin_images          |
# | /admin/images/upload-url  | aws_api_gateway_resource.admin_images_upload_url |
# | /admin/images/{key+}      | aws_api_gateway_resource.admin_images_key      |
# | /admin/auth               | aws_api_gateway_resource.admin_auth            |
# | /admin/auth/login         | aws_api_gateway_resource.admin_auth_login      |
# | /admin/auth/logout        | aws_api_gateway_resource.admin_auth_logout     |
# | /admin/auth/refresh       | aws_api_gateway_resource.admin_auth_refresh    |
# +---------------------------+------------------------------------------------+
#
# After import, verify:
# - REST API name: serverless-blog-api
# - Endpoint type: REGIONAL
# - Cognito Authorizer configured correctly
# - All resources paths match CDK deployment
# - Gateway responses for CORS configured
# - Stage settings (X-Ray, logging) match environment
#
# Known Differences:
# - Method integrations (Lambda) are NOT imported by this module
#   They will be managed by the lambda module through API Gateway integrations
# - Deployment ID will change after Terraform manages the resources
