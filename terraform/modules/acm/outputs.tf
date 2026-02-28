output "certificate_arn" {
  value       = aws_acm_certificate.main.arn
  description = "ARN of the ACM certificate"
}

output "certificate_domain_name" {
  value       = aws_acm_certificate.main.domain_name
  description = "Primary domain name of the certificate"
}

output "certificate_status" {
  value       = aws_acm_certificate.main.status
  description = "Status of the certificate (PENDING_VALIDATION, ISSUED, etc.)"
}

output "domain_validation_options" {
  value = [for opt in aws_acm_certificate.main.domain_validation_options : {
    domain_name           = opt.domain_name
    resource_record_name  = opt.resource_record_name
    resource_record_type  = opt.resource_record_type
    resource_record_value = opt.resource_record_value
  }]
  description = "DNS validation options for creating validation records in Cloudflare or Route53"
}

output "validation_record_fqdns" {
  value       = [for opt in aws_acm_certificate.main.domain_validation_options : opt.resource_record_name]
  description = "List of FQDNs for validation records (for use with aws_acm_certificate_validation)"
}

output "validated_certificate_arn" {
  value       = var.wait_for_validation ? aws_acm_certificate_validation.main[0].certificate_arn : aws_acm_certificate.main.arn
  description = "ARN of the validated ACM certificate. Use this for CloudFront to ensure certificate is validated before use."
}
