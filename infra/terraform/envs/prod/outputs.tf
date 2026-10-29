output "site_bucket" {
  value = module.site.bucket_name
}

output "distribution_id" {
  value = module.site.distribution_id
}

output "site_url" {
  value = "https://${var.acm_validated && var.domain_name != "" ? var.domain_name : module.site.distribution_domain}/"
}

output "cname_target" {
  description = "Cloudflare: CNAME <your subdomain> → this value (DNS only)"
  value       = module.site.distribution_domain
}

output "acm_validation_records" {
  value = module.site.acm_validation_records
}

output "csp" {
  value = module.site.csp
}
