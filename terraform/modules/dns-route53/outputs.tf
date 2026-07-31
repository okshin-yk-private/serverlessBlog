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

output "acm_validation_record_fqdns" {
  value       = [for record in aws_route53_record.acm_validation : record.fqdn]
  description = "FQDNs of ACM validation records (for aws_acm_certificate_validation)"
}
