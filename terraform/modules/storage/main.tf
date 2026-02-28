# Storage Module - S3 Buckets
# Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

# Get current AWS account ID for bucket naming
data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Bucket naming convention: {project}-{type}-{env}-{account_id}
  image_bucket_name       = "${var.project_name}-images-${var.environment}-${local.account_id}"
  public_site_bucket_name = "${var.project_name}-public-site-${var.environment}-${local.account_id}"
  admin_site_bucket_name  = "${var.project_name}-admin-site-${var.environment}-${local.account_id}"
  access_logs_bucket_name = "${var.project_name}-access-logs-${var.environment}-${local.account_id}"

  # Common tags for all resources
  common_tags = merge(
    {
      Environment = var.environment
      Module      = "storage"
      ManagedBy   = "terraform"
    },
    var.tags
  )
}

#------------------------------------------------------------------------------
# Access Logs Bucket (Optional - recommended for prd)
#------------------------------------------------------------------------------

# Requirement: Enable access logging for production
resource "aws_s3_bucket" "access_logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = local.access_logs_bucket_name

  tags = merge(
    local.common_tags,
    {
      Name = local.access_logs_bucket_name
      Type = "access-logs"
    }
  )

  lifecycle {
    prevent_destroy = false # Set to true in production
  }
}

#trivy:ignore:AVD-AWS-0132 S3 access logging target buckets do not support SSE-KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

#------------------------------------------------------------------------------
# Image Storage Bucket
#------------------------------------------------------------------------------

# Requirement 3.1: Create image storage bucket with versioning enabled
resource "aws_s3_bucket" "images" {
  bucket = local.image_bucket_name

  tags = merge(
    local.common_tags,
    {
      Name = local.image_bucket_name
      Type = "images"
    }
  )

  lifecycle {
    prevent_destroy = false # Set to true in production
  }
}

# Requirement 3.1: Enable versioning on image bucket
resource "aws_s3_bucket_versioning" "images" {
  bucket = aws_s3_bucket.images.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Requirement 3.2: Configure SSE-S3 encryption
#trivy:ignore:AVD-AWS-0132 SSE-S3 is sufficient for blog images; KMS adds cost with pre-signed URL complexity
resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Requirement 3.3: Block all public access
resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Requirement 3.4: Create lifecycle policy for version management
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# CORS configuration for pre-signed URL uploads from browser
resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = var.cors_allow_origins
    max_age_seconds = 3000
  }
}

# Configure access logging for image bucket (when enabled)
resource "aws_s3_bucket_logging" "images" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.images.id

  target_bucket = aws_s3_bucket.access_logs[0].id
  target_prefix = "image-bucket/"
}

# Requirement 3.6: CloudFront OAC bucket policy (conditional)
resource "aws_s3_bucket_policy" "images" {
  count  = var.cloudfront_distribution_arn != "" ? 1 : 0
  bucket = aws_s3_bucket.images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.images.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Public Site Bucket
#------------------------------------------------------------------------------

# Requirement 3.5: Create public site bucket for static hosting
resource "aws_s3_bucket" "public_site" {
  bucket = local.public_site_bucket_name

  tags = merge(
    local.common_tags,
    {
      Name = local.public_site_bucket_name
      Type = "public-site"
    }
  )

  lifecycle {
    prevent_destroy = false # Set to true in production
  }
}

# Requirement 6.2: Enable versioning on public site bucket for atomic deployment rollback
resource "aws_s3_bucket_versioning" "public_site" {
  bucket = aws_s3_bucket.public_site.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Requirement 3.2: Configure SSE-S3 encryption
#trivy:ignore:AVD-AWS-0132 SSE-S3 is sufficient for static site assets served via CloudFront
resource "aws_s3_bucket_server_side_encryption_configuration" "public_site" {
  bucket = aws_s3_bucket.public_site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Requirement 3.3: Block all public access
resource "aws_s3_bucket_public_access_block" "public_site" {
  bucket = aws_s3_bucket.public_site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Requirement 6.7: Lifecycle policy to cleanup old versions (retain for rollback window)
resource "aws_s3_bucket_lifecycle_configuration" "public_site" {
  bucket = aws_s3_bucket.public_site.id

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    # Delete old versions after 7 days (allows rollback window)
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

# Configure access logging for public site bucket (when enabled)
resource "aws_s3_bucket_logging" "public_site" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.public_site.id

  target_bucket = aws_s3_bucket.access_logs[0].id
  target_prefix = "public-site-bucket/"
}

# Requirement 3.6: CloudFront OAC bucket policy (conditional)
resource "aws_s3_bucket_policy" "public_site" {
  count  = var.cloudfront_distribution_arn != "" ? 1 : 0
  bucket = aws_s3_bucket.public_site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.public_site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Admin Site Bucket
#------------------------------------------------------------------------------

# Requirement 3.5: Create admin site bucket for static hosting
resource "aws_s3_bucket" "admin_site" {
  bucket = local.admin_site_bucket_name

  tags = merge(
    local.common_tags,
    {
      Name = local.admin_site_bucket_name
      Type = "admin-site"
    }
  )

  lifecycle {
    prevent_destroy = false # Set to true in production
  }
}

# Requirement 3.2: Configure SSE-S3 encryption
#trivy:ignore:AVD-AWS-0132 SSE-S3 is sufficient for admin SPA assets served via CloudFront
resource "aws_s3_bucket_server_side_encryption_configuration" "admin_site" {
  bucket = aws_s3_bucket.admin_site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Requirement 3.3: Block all public access
resource "aws_s3_bucket_public_access_block" "admin_site" {
  bucket = aws_s3_bucket.admin_site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Configure access logging for admin site bucket (when enabled)
resource "aws_s3_bucket_logging" "admin_site" {
  count  = var.enable_access_logs ? 1 : 0
  bucket = aws_s3_bucket.admin_site.id

  target_bucket = aws_s3_bucket.access_logs[0].id
  target_prefix = "admin-site-bucket/"
}

# Requirement 3.6: CloudFront OAC bucket policy (conditional)
resource "aws_s3_bucket_policy" "admin_site" {
  count  = var.cloudfront_distribution_arn != "" ? 1 : 0
  bucket = aws_s3_bucket.admin_site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.admin_site.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# SSM Parameters for bucket names (used by CI/CD pipeline)
#------------------------------------------------------------------------------

resource "aws_ssm_parameter" "public_site_bucket_name" {
  name        = "/serverless-blog/${var.environment}/storage/public-site-bucket-name"
  description = "Public site S3 bucket name for ${var.environment} environment"
  type        = "String"
  value       = aws_s3_bucket.public_site.bucket

  tags = local.common_tags
}

resource "aws_ssm_parameter" "admin_site_bucket_name" {
  name        = "/serverless-blog/${var.environment}/storage/admin-site-bucket-name"
  description = "Admin site S3 bucket name for ${var.environment} environment"
  type        = "String"
  value       = aws_s3_bucket.admin_site.bucket

  tags = local.common_tags
}
