# Database Module - Import Blocks
# Requirements: 9.1, 9.4
#
# This file contains import blocks for migrating existing CDK-managed DynamoDB tables
# to Terraform management. The import blocks should be uncommented during the migration
# phase and removed after successful import.
#
# CDK Logical ID: BlogPostsTable
# Terraform Resource Address: module.database.aws_dynamodb_table.blog_posts
#
# Usage:
# 1. Uncomment the import block below
# 2. Run `terraform plan` to verify the import will succeed with no changes
# 3. Run `terraform apply` to perform the import
# 4. Verify the state matches the actual AWS resource
# 5. Comment out or remove the import block after successful import

# Import blocks moved to environments/dev/import.tf (root module)
# import {
#   to = aws_dynamodb_table.blog_posts
#   id = "serverless-blog-posts"
# }

# Migration Notes:
# - The existing CDK table name is "serverless-blog-posts"
# - After import, verify:
#   - Partition key: id (String)
#   - Billing mode: PAY_PER_REQUEST
#   - GSIs: CategoryIndex, PublishStatusIndex
#   - PITR: enabled
#   - Encryption: enabled (AWS managed key)
