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

# Import blocks moved to environments/dev/import.tf (root module)
# See environments/dev/import.tf for active import blocks
#
# Resource IDs for reference:
# - REST API: 4lfu0fgsk3
# - Authorizer: klt512
# - Request Validator: 6nrld8
# - Resources: admin=53axfk, posts=7zl3r1, posts_id=zmx8tv, etc.

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
