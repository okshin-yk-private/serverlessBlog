output "zone_id" {
  value       = aws_route53_zone.subdomain.zone_id
  description = "Route53 hosted zone ID"
}

output "zone_name" {
  value       = aws_route53_zone.subdomain.name
  description = "Route53 hosted zone name"
}

output "name_servers" {
  value       = aws_route53_zone.subdomain.name_servers
  description = "Route53 nameservers for NS delegation in Cloudflare"
}

output "apex_record_fqdn" {
  value       = var.cloudfront_domain_name != "" ? aws_route53_record.apex[0].fqdn : null
  description = "FQDN of the apex domain record"
}

output "acm_validation_record_fqdns" {
  value       = [for record in aws_route53_record.acm_validation : record.fqdn]
  description = "FQDNs of ACM validation records (for aws_acm_certificate_validation)"
}
