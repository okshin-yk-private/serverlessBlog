# Lambda Module - Import Blocks
# Requirements: 9.1, 9.4
#
# This file contains import blocks for migrating existing CDK-managed Lambda functions
# to Terraform management. The import blocks should be uncommented during the migration
# phase and removed after successful import.
#
# CDK Stack: GoLambdaStack
# CDK Resources:
#   - CreatePostGo (blog-create-post-go)
#   - GetPostGo (blog-get-post-go)
#   - GetPublicPostGo (blog-get-public-post-go)
#   - ListPostsGo (blog-list-posts-go)
#   - UpdatePostGo (blog-update-post-go)
#   - DeletePostGo (blog-delete-post-go)
#   - LoginGo (blog-login-go)
#   - LogoutGo (blog-logout-go)
#   - RefreshGo (blog-refresh-go)
#   - GetUploadUrlGo (blog-upload-url-go)
#   - DeleteImageGo (blog-delete-image-go)
#
# Usage:
# 1. Get the Lambda function names from AWS Console or CDK output
# 2. Uncomment the import blocks below
# 3. Run `terraform plan` to verify the import will succeed with no changes
# 4. Run `terraform apply` to perform the import
# 5. Verify the state matches the actual AWS resources
# 6. Comment out or remove the import blocks after successful import

# ====================
# Posts Domain Functions
# ====================

# Import Create Post Lambda Function
# import {
#   to = aws_lambda_function.create_post
#   id = "blog-create-post-go"
# }

# Import Get Post Lambda Function
# import {
#   to = aws_lambda_function.get_post
#   id = "blog-get-post-go"
# }

# Import Get Public Post Lambda Function
# import {
#   to = aws_lambda_function.get_public_post
#   id = "blog-get-public-post-go"
# }

# Import List Posts Lambda Function
# import {
#   to = aws_lambda_function.list_posts
#   id = "blog-list-posts-go"
# }

# Import Update Post Lambda Function
# import {
#   to = aws_lambda_function.update_post
#   id = "blog-update-post-go"
# }

# Import Delete Post Lambda Function
# import {
#   to = aws_lambda_function.delete_post
#   id = "blog-delete-post-go"
# }

# ====================
# Auth Domain Functions
# ====================

# Import Login Lambda Function
# import {
#   to = aws_lambda_function.login
#   id = "blog-login-go"
# }

# Import Logout Lambda Function
# import {
#   to = aws_lambda_function.logout
#   id = "blog-logout-go"
# }

# Import Refresh Lambda Function
# import {
#   to = aws_lambda_function.refresh
#   id = "blog-refresh-go"
# }

# ====================
# Images Domain Functions
# ====================

# Import Get Upload URL Lambda Function
# import {
#   to = aws_lambda_function.get_upload_url
#   id = "blog-upload-url-go"
# }

# Import Delete Image Lambda Function
# import {
#   to = aws_lambda_function.delete_image
#   id = "blog-delete-image-go"
# }

# ====================
# IAM Role Import
# ====================

# Note: IAM roles are typically shared across functions in CDK
# You may need to import the execution role separately
# import {
#   to = aws_iam_role.lambda_execution
#   id = "blog-lambda-execution-role"
# }

# ====================
# CloudWatch Log Groups Import
# ====================

# Import Create Post Log Group
# import {
#   to = aws_cloudwatch_log_group.create_post
#   id = "/aws/lambda/blog-create-post-go"
# }

# Import Get Post Log Group
# import {
#   to = aws_cloudwatch_log_group.get_post
#   id = "/aws/lambda/blog-get-post-go"
# }

# Import Get Public Post Log Group
# import {
#   to = aws_cloudwatch_log_group.get_public_post
#   id = "/aws/lambda/blog-get-public-post-go"
# }

# Import List Posts Log Group
# import {
#   to = aws_cloudwatch_log_group.list_posts
#   id = "/aws/lambda/blog-list-posts-go"
# }

# Import Update Post Log Group
# import {
#   to = aws_cloudwatch_log_group.update_post
#   id = "/aws/lambda/blog-update-post-go"
# }

# Import Delete Post Log Group
# import {
#   to = aws_cloudwatch_log_group.delete_post
#   id = "/aws/lambda/blog-delete-post-go"
# }

# Import Login Log Group
# import {
#   to = aws_cloudwatch_log_group.login
#   id = "/aws/lambda/blog-login-go"
# }

# Import Logout Log Group
# import {
#   to = aws_cloudwatch_log_group.logout
#   id = "/aws/lambda/blog-logout-go"
# }

# Import Refresh Log Group
# import {
#   to = aws_cloudwatch_log_group.refresh
#   id = "/aws/lambda/blog-refresh-go"
# }

# Import Get Upload URL Log Group
# import {
#   to = aws_cloudwatch_log_group.get_upload_url
#   id = "/aws/lambda/blog-upload-url-go"
# }

# Import Delete Image Log Group
# import {
#   to = aws_cloudwatch_log_group.delete_image
#   id = "/aws/lambda/blog-delete-image-go"
# }

# ====================
# Migration Notes
# ====================
#
# CDK Logical ID to Terraform Resource Mapping:
# +--------------------------------+-------------------------------------------+
# | CDK Logical ID                 | Terraform Resource Address                |
# +--------------------------------+-------------------------------------------+
# | CreatePostGo                   | aws_lambda_function.create_post           |
# | GetPostGo                      | aws_lambda_function.get_post              |
# | GetPublicPostGo                | aws_lambda_function.get_public_post       |
# | ListPostsGo                    | aws_lambda_function.list_posts            |
# | UpdatePostGo                   | aws_lambda_function.update_post           |
# | DeletePostGo                   | aws_lambda_function.delete_post           |
# | LoginGo                        | aws_lambda_function.login                 |
# | LogoutGo                       | aws_lambda_function.logout                |
# | RefreshGo                      | aws_lambda_function.refresh               |
# | GetUploadUrlGo                 | aws_lambda_function.get_upload_url        |
# | DeleteImageGo                  | aws_lambda_function.delete_image          |
# +--------------------------------+-------------------------------------------+
#
# Function Name Mapping:
# +---------------------------+------------------------------------------------+
# | CDK Function Name         | Terraform Resource Address                     |
# +---------------------------+------------------------------------------------+
# | blog-create-post-go       | aws_lambda_function.create_post                |
# | blog-get-post-go          | aws_lambda_function.get_post                   |
# | blog-get-public-post-go   | aws_lambda_function.get_public_post            |
# | blog-list-posts-go        | aws_lambda_function.list_posts                 |
# | blog-update-post-go       | aws_lambda_function.update_post                |
# | blog-delete-post-go       | aws_lambda_function.delete_post                |
# | blog-login-go             | aws_lambda_function.login                      |
# | blog-logout-go            | aws_lambda_function.logout                     |
# | blog-refresh-go           | aws_lambda_function.refresh                    |
# | blog-upload-url-go        | aws_lambda_function.get_upload_url             |
# | blog-delete-image-go      | aws_lambda_function.delete_image               |
# +---------------------------+------------------------------------------------+
#
# After import, verify:
# - All 11 Lambda functions are properly imported
# - Runtime is provided.al2023
# - Architecture is arm64
# - Memory size is 128 MB
# - Timeout is 30 seconds
# - Environment variables match CDK deployment
# - X-Ray tracing configuration matches environment (Active for prd)
# - IAM role permissions are correct
#
# Known Differences:
# - CDK creates individual IAM roles per function; Terraform uses a shared role
# - CloudWatch log group retention may differ between CDK and Terraform defaults
# - Source code hash will differ after Terraform manages the resources
