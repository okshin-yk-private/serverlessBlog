# CDN Module - Import Blocks
# Requirements: 9.1, 9.4
#
# This file contains import blocks for migrating existing CDK-managed CloudFront resources
# to Terraform management. The import blocks should be uncommented during the migration
# phase and removed after successful import.
#
# CDK Stack: CdnStack
# CDK Resources:
#   - UnifiedDistribution (CloudFront Distribution)
#   - S3 OAC (Origin Access Control)
#   - ImagePathFunction, AdminSpaFunction, ApiPathFunction (CloudFront Functions)
#   - ImageCachePolicy (Cache Policy)
#   - ApiOriginRequestPolicy (Origin Request Policy)
#
# Usage:
# 1. Get the CloudFront distribution ID from AWS Console or CDK output
# 2. Uncomment the import blocks below
# 3. Run `terraform plan` to verify the import will succeed with no changes
# 4. Run `terraform apply` to perform the import
# 5. Verify the state matches the actual AWS resources
# 6. Comment out or remove the import blocks after successful import

# Import blocks moved to environments/dev/import.tf (root module)
# See environments/dev/import.tf for active import blocks
#
# Resource IDs for reference:
# - Distribution: ESRLM0CV5EBG7
# - OAC: E3HGZ6IT0VJXIP (public-site)
# - CloudFront Functions: ImagePathFunction-dev, AdminCombinedFunction-dev, ApiPathFunction-dev, BasicAuthFunction-dev
# - Cache Policy: 073fd421-ac36-448c-a0f8-37033f73e2ee
# - Origin Request Policy: 49da6566-5d17-4347-aecd-5fca52d2e527

# ====================
# Migration Notes
# ====================
#
# CDK Logical ID to Terraform Resource Mapping:
# +--------------------------------+-------------------------------------------+
# | CDK Logical ID                 | Terraform Resource Address                |
# +--------------------------------+-------------------------------------------+
# | UnifiedDistribution            | aws_cloudfront_distribution.main          |
# | S3 OAC                         | aws_cloudfront_origin_access_control.s3_oac |
# | ImagePathFunction              | aws_cloudfront_function.image_path        |
# | AdminSpaFunction               | aws_cloudfront_function.admin_spa         |
# | ApiPathFunction                | aws_cloudfront_function.api_path          |
# | ImageCachePolicy               | aws_cloudfront_cache_policy.images        |
# | ApiOriginRequestPolicy         | aws_cloudfront_origin_request_policy.api  |
# +--------------------------------+-------------------------------------------+
#
# After import, verify:
# - Distribution enabled
# - HTTPS redirect (ViewerProtocolPolicy: redirect-to-https)
# - Compression enabled (Gzip, Brotli)
# - Price class: PriceClass_100
# - Origins: public-site, admin-site, images, api-gateway
# - Cache behaviors for /admin/*, /images/*, /api/*
# - Default root object: index.html
# - Error responses for SPA (403/404 -> 200 /index.html)
#
# Known Differences:
# - CDK creates bucket policies in CdnStack; Terraform creates them in environments
# - CloudFront Function code format may differ slightly
# - OAC naming convention may differ
