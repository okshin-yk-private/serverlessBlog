output "zone_id" {
  value       = local.zone_id
  description = "Cloudflare zone ID"
}

output "zone_name" {
  value       = var.zone_name
  description = "Cloudflare zone name"
}

output "apex_record_id" {
  value       = var.create_apex_record ? cloudflare_dns_record.apex[0].id : null
  description = "ID of the apex domain DNS record"
}

output "www_record_id" {
  value       = var.create_www_record ? cloudflare_dns_record.www[0].id : null
  description = "ID of the www subdomain DNS record"
}

output "subdomain_ns_record_ids" {
  value       = cloudflare_dns_record.subdomain_ns[*].id
  description = "IDs of the NS delegation records for subdomain"
}

output "acm_validation_record_fqdns" {
  value       = [for record in cloudflare_dns_record.acm_validation : record.name]
  description = "FQDNs of ACM validation records (for aws_acm_certificate_validation)"
}
