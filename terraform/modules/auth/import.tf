# Auth Module - Import Blocks
# Requirements: 9.1, 9.4
#
# This file contains import blocks for migrating existing CDK-managed Cognito resources
# to Terraform management. The import blocks should be uncommented during the migration
# phase and removed after successful import.
#
# CDK Logical ID: BlogUserPool
# Terraform Resource Address: module.auth.aws_cognito_user_pool.main
#
# CDK Logical ID: BlogUserPoolClient
# Terraform Resource Address: module.auth.aws_cognito_user_pool_client.main
#
# Usage:
# 1. Uncomment the import blocks below
# 2. Set the correct User Pool ID and Client ID from your CDK deployment
# 3. Run `terraform plan` to verify the import will succeed with no changes
# 4. Run `terraform apply` to perform the import
# 5. Verify the state matches the actual AWS resource
# 6. Comment out or remove the import blocks after successful import

# Import blocks moved to environments/dev/import.tf (root module)
# import {
#   to = aws_cognito_user_pool.main
#   id = "ap-northeast-1_GWhOM3BpU"
# }
#
# import {
#   to = aws_cognito_user_pool_client.main
#   id = "ap-northeast-1_GWhOM3BpU/7mp44ekvp0pgmv20hv1bm10h78"
# }

# Migration Notes:
# - The existing CDK User Pool name is "serverless-blog-user-pool"
# - The existing CDK Client name is "serverless-blog-admin-client"
# - After import, verify:
#   - Sign-in: email-based
#   - Password policy: 12+ chars, require all character types
#   - MFA: OPTIONAL
#   - Email verification: enabled
#   - Auth flows: USER_PASSWORD_AUTH, USER_SRP_AUTH, REFRESH_TOKEN_AUTH
#   - Token validity: access/id 1h, refresh 30d
#   - Self sign-up: disabled
