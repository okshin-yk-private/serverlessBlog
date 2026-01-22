# DNS Cloudflare Module
# Manages Cloudflare DNS records for:
# - Production: Apex domain and www pointing to CloudFront
# - All environments: ACM certificate validation records
# - Dev: NS delegation to Route53 for subdomain

# Lookup the Cloudflare zone - v5.x syntax
data "cloudflare_zones" "main" {
  name = var.zone_name
}

locals {
  zone_id = data.cloudflare_zones.main.result[0].id
}

# Apex domain CNAME → CloudFront (CNAME flattening at Cloudflare)
# Only for production environment
resource "cloudflare_dns_record" "apex" {
  count = var.create_apex_record ? 1 : 0

  zone_id = local.zone_id
  name    = "@"
  content = var.cloudfront_domain_name
  type    = "CNAME"
  ttl     = 300
  proxied = false # Must be false for CloudFront
  comment = "Apex domain to CloudFront - ${var.environment}"
}

# www subdomain CNAME → CloudFront
# Only for production environment
resource "cloudflare_dns_record" "www" {
  count = var.create_www_record ? 1 : 0

  zone_id = local.zone_id
  name    = "www"
  content = var.cloudfront_domain_name
  type    = "CNAME"
  ttl     = 300
  proxied = false # Must be false for CloudFront
  comment = "WWW subdomain to CloudFront - ${var.environment}"
}

# NS delegation records for subdomain (e.g., dev.example.com → Route53)
# Creates one NS record per Route53 nameserver
# AWS Route53 always returns exactly 4 nameservers, so we use count = 4
# Note: var.enable_ns_delegation must be set to true when route53_ns_records are provided
resource "cloudflare_dns_record" "subdomain_ns" {
  count = var.enable_ns_delegation ? 4 : 0

  zone_id = local.zone_id
  name    = var.subdomain_to_delegate
  content = var.route53_ns_records[count.index]
  type    = "NS"
  ttl     = 3600
  comment = "NS delegation for ${var.subdomain_to_delegate} subdomain to Route53"
}

# ACM certificate DNS validation records
# Creates CNAME records required for AWS ACM certificate validation
resource "cloudflare_dns_record" "acm_validation" {
  for_each = {
    for opt in var.acm_domain_validation_options : opt.domain_name => {
      name   = trimsuffix(opt.resource_record_name, ".")  # Remove trailing dot
      record = trimsuffix(opt.resource_record_value, ".") # Remove trailing dot
      type   = opt.resource_record_type
    }
    if contains([var.zone_name, "*.${var.zone_name}"], opt.domain_name) ||
    startswith(opt.domain_name, var.zone_name)
  }

  zone_id = local.zone_id
  name    = each.value.name
  content = each.value.record
  type    = each.value.type
  ttl     = 60 # Low TTL for faster validation
  proxied = false
  comment = "ACM certificate validation for ${each.key}"
}
