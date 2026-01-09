# Storage Module - Import Blocks
# Requirements: 9.1, 9.4
#
# This file contains import blocks for migrating existing CDK-managed S3 buckets
# to Terraform management. The import blocks should be uncommented during the migration
# phase and removed after successful import.
#
# CDK Stack: StorageStack
# Resources:
#   - ImageBucket -> module.storage.aws_s3_bucket.images
#   - PublicSiteBucket -> module.storage.aws_s3_bucket.public_site
#   - AdminSiteBucket -> module.storage.aws_s3_bucket.admin_site
#   - AccessLogsBucket -> module.storage.aws_s3_bucket.access_logs[0]
#
# Usage:
# 1. Uncomment the import blocks below (update bucket names to match CDK deployment)
# 2. Run `terraform plan` to verify the import will succeed with no changes
# 3. Run `terraform apply` to perform the import
# 4. Verify the state matches the actual AWS resource
# 5. Comment out or remove the import blocks after successful import

# Uncomment the following blocks to import existing S3 buckets

# Image Bucket
# import {
#   to = aws_s3_bucket.images
#   id = "serverless-blog-images-dev-123456789012"  # Replace with actual bucket name
# }

# Public Site Bucket
# import {
#   to = aws_s3_bucket.public_site
#   id = "serverless-blog-public-site-dev-123456789012"  # Replace with actual bucket name
# }

# Admin Site Bucket
# import {
#   to = aws_s3_bucket.admin_site
#   id = "serverless-blog-admin-site-dev-123456789012"  # Replace with actual bucket name
# }

# Access Logs Bucket (only if enable_access_logs = true)
# import {
#   to = aws_s3_bucket.access_logs[0]
#   id = "serverless-blog-access-logs-dev-123456789012"  # Replace with actual bucket name
# }

# Migration Notes:
# - CDK bucket naming pattern: serverless-blog-{type}-{stage}-{account_id}
# - After import, verify:
#   - Image bucket: versioning enabled, SSE-S3, public access blocked, lifecycle rules
#   - Site buckets: SSE-S3, public access blocked
#   - All buckets: CORS configuration (if applicable), CloudFront OAC policy (if CDN configured)
