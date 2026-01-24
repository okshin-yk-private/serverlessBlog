# CDN Module Outputs
# Requirements: 7.1

output "distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "CloudFront distribution ID"
}

output "distribution_domain_name" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "CloudFront domain name"
}

output "distribution_arn" {
  value       = aws_cloudfront_distribution.main.arn
  description = "CloudFront distribution ARN"
}

output "oac_id" {
  value       = aws_cloudfront_origin_access_control.s3_oac.id
  description = "Origin Access Control ID"
}

# URL outputs for convenience
output "public_site_url" {
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
  description = "Public site URL (root path)"
}

output "admin_site_url" {
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/admin/"
  description = "Admin site URL (/admin/ path)"
}

output "images_base_url" {
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/images/"
  description = "Images base URL (/images/ path)"
}

output "api_base_url" {
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/api/"
  description = "API base URL (/api/ path)"
}

# Custom Domain Outputs
output "custom_domain_names" {
  value       = var.use_custom_domain ? var.domain_names : []
  description = "Custom domain names configured for this distribution"
}

output "custom_domain_url" {
  value       = var.use_custom_domain && length(var.domain_names) > 0 ? "https://${var.domain_names[0]}" : null
  description = "Primary custom domain URL (first domain in the list)"
}

output "api_endpoint_ssm_parameter_name" {
  value       = aws_ssm_parameter.api_endpoint.name
  description = "SSM parameter name for API endpoint"
}

output "distribution_id_ssm_parameter_name" {
  value       = aws_ssm_parameter.distribution_id.name
  description = "SSM parameter name for CloudFront distribution ID"
}
