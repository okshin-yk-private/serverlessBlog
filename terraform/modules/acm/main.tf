# ACM Certificate Module
# Creates SSL/TLS certificate with DNS validation for CloudFront custom domains
# NOTE: This module must be deployed in us-east-1 region for CloudFront compatibility

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    {
      Name        = "${var.project_name}-cert-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    },
    var.tags
  )
}

# Certificate validation waiter
# This resource waits for DNS validation to complete
resource "aws_acm_certificate_validation" "main" {
  count = var.wait_for_validation ? 1 : 0

  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = var.validation_record_fqdns

  timeouts {
    create = var.validation_timeout
  }
}
