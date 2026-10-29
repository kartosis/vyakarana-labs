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

output "ses_dkim_records" {
  description = "Cloudflare: add each as a CNAME, DNS only"
  value       = var.ses_domain == "" ? [] : module.email[0].dkim_records
}

output "ses_verified" {
  value = var.ses_domain == "" ? false : module.email[0].verified
}

output "web_config" {
  description = "Written to /config.json at deploy time; the browser reads it to find Cognito"
  value = {
    accounts   = local.accounts
    region     = "us-east-1"
    userPoolId = local.accounts ? module.auth[0].user_pool_id : null
    clientId   = local.accounts ? module.auth[0].client_id : null
  }
}
