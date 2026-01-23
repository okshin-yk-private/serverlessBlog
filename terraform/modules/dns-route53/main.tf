# DNS Route53 Module
# Creates Route53 hosted zone and DNS records for development subdomain
# The NS records from this zone must be added to Cloudflare for delegation

# Route53 hosted zone for subdomain
resource "aws_route53_zone" "subdomain" {
  name    = var.zone_name
  comment = "Hosted zone for ${var.zone_name} - ${var.environment} environment"

  tags = merge(
    {
      Name        = "${var.project_name}-zone-${var.environment}"
      Environment = var.environment
      Project     = var.project_name
    },
    var.tags
  )
}

# Apex record (A alias) → CloudFront
resource "aws_route53_record" "apex" {
  count = var.cloudfront_domain_name != "" ? 1 : 0

  zone_id = aws_route53_zone.subdomain.zone_id
  name    = var.zone_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# IPv6 apex record (AAAA alias) → CloudFront
resource "aws_route53_record" "apex_ipv6" {
  count = var.cloudfront_domain_name != "" && var.create_ipv6_records ? 1 : 0

  zone_id = aws_route53_zone.subdomain.zone_id
  name    = var.zone_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# ACM certificate DNS validation records
resource "aws_route53_record" "acm_validation" {
  for_each = {
    for opt in var.acm_domain_validation_options : opt.domain_name => {
      name   = opt.resource_record_name
      record = opt.resource_record_value
      type   = opt.resource_record_type
    }
    # Only create records for domains that belong to this zone
    if endswith(opt.domain_name, var.zone_name) || opt.domain_name == var.zone_name
  }

  zone_id         = aws_route53_zone.subdomain.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}
