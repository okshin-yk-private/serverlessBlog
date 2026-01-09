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

# Import blocks moved to environments/dev/import.tf (root module)
# See environments/dev/import.tf for active import blocks

# Migration Notes:
# - CDK bucket naming pattern: serverless-blog-{type}-{stage}-{account_id}
# - After import, verify:
#   - Image bucket: versioning enabled, SSE-S3, public access blocked, lifecycle rules
#   - Site buckets: SSE-S3, public access blocked
#   - All buckets: CORS configuration (if applicable), CloudFront OAC policy (if CDN configured)
