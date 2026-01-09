# Storage Module Outputs
# Requirements: 3.1

#------------------------------------------------------------------------------
# Image Bucket Outputs
#------------------------------------------------------------------------------

output "image_bucket_name" {
  value       = aws_s3_bucket.images.bucket
  description = "Image bucket name"
}

output "image_bucket_arn" {
  value       = aws_s3_bucket.images.arn
  description = "Image bucket ARN"
}

output "image_bucket_id" {
  value       = aws_s3_bucket.images.id
  description = "Image bucket ID"
}

output "image_bucket_regional_domain_name" {
  value       = aws_s3_bucket.images.bucket_regional_domain_name
  description = "Image bucket regional domain name for CloudFront OAC"
}

#------------------------------------------------------------------------------
# Public Site Bucket Outputs
#------------------------------------------------------------------------------

output "public_site_bucket_name" {
  value       = aws_s3_bucket.public_site.bucket
  description = "Public site bucket name"
}

output "public_site_bucket_arn" {
  value       = aws_s3_bucket.public_site.arn
  description = "Public site bucket ARN"
}

output "public_site_bucket_id" {
  value       = aws_s3_bucket.public_site.id
  description = "Public site bucket ID"
}

output "public_site_bucket_regional_domain_name" {
  value       = aws_s3_bucket.public_site.bucket_regional_domain_name
  description = "Public site bucket regional domain name for CloudFront OAC"
}

#------------------------------------------------------------------------------
# Admin Site Bucket Outputs
#------------------------------------------------------------------------------

output "admin_site_bucket_name" {
  value       = aws_s3_bucket.admin_site.bucket
  description = "Admin site bucket name"
}

output "admin_site_bucket_arn" {
  value       = aws_s3_bucket.admin_site.arn
  description = "Admin site bucket ARN"
}

output "admin_site_bucket_id" {
  value       = aws_s3_bucket.admin_site.id
  description = "Admin site bucket ID"
}

output "admin_site_bucket_regional_domain_name" {
  value       = aws_s3_bucket.admin_site.bucket_regional_domain_name
  description = "Admin site bucket regional domain name for CloudFront OAC"
}

#------------------------------------------------------------------------------
# Access Logs Bucket Outputs (Optional)
#------------------------------------------------------------------------------

output "access_logs_bucket_name" {
  value       = var.enable_access_logs ? aws_s3_bucket.access_logs[0].bucket : null
  description = "Access logs bucket name (null if access logs disabled)"
}

output "access_logs_bucket_arn" {
  value       = var.enable_access_logs ? aws_s3_bucket.access_logs[0].arn : null
  description = "Access logs bucket ARN (null if access logs disabled)"
}
