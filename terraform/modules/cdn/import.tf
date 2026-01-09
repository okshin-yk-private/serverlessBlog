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

# ====================
# Step 1: Import CloudFront Distribution
# ====================

# Uncomment the following block to import the existing CloudFront Distribution
# import {
#   to = aws_cloudfront_distribution.main
#   id = "EXXXXXXXXXX"  # Replace with actual distribution ID from CDK output
# }

# ====================
# Step 2: Import Origin Access Control
# ====================

# Uncomment the following block to import the existing Origin Access Control
# import {
#   to = aws_cloudfront_origin_access_control.s3_oac
#   id = "EXXXXXXXXXXXXXXX"  # Replace with actual OAC ID
# }

# ====================
# Step 3: Import CloudFront Functions
# ====================

# Note: CloudFront Functions are imported by name

# Uncomment to import Image Path Function
# import {
#   to = aws_cloudfront_function.image_path
#   id = "ImagePathFunction-dev"  # Replace with actual function name
# }

# Uncomment to import Admin SPA Function
# import {
#   to = aws_cloudfront_function.admin_spa
#   id = "AdminSpaFunction-dev"  # Replace with actual function name
# }

# Uncomment to import API Path Function
# import {
#   to = aws_cloudfront_function.api_path
#   id = "ApiPathFunction-dev"  # Replace with actual function name
# }

# ====================
# Step 4: Import Cache Policies
# ====================

# Uncomment to import Image Cache Policy
# import {
#   to = aws_cloudfront_cache_policy.images
#   id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Replace with actual cache policy ID
# }

# ====================
# Step 5: Import Origin Request Policies
# ====================

# Uncomment to import API Origin Request Policy
# import {
#   to = aws_cloudfront_origin_request_policy.api
#   id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Replace with actual origin request policy ID
# }

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
