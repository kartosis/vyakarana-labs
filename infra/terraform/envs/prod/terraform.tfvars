# Non-secret settings for production. CSP hashes are generated into csp.auto.tfvars.json by CI.
# alert_email comes from the GitHub variable ALERT_EMAIL (TF_VAR_alert_email), not from this file.

# Phase 1: leave domain empty → site on https://dxxxx.cloudfront.net
# Phase 2: set the domain → apply → add the ACM CNAME in Cloudflare
# Phase 3: set acm_validated = true → apply → add the site CNAME in Cloudflare
domain_name   = ""
acm_validated = false

# Accounts (milestone M3)
# Step 1: ses_domain = "sanskrit.identifyragas.com" → apply → add the 3 DKIM CNAMEs in Cloudflare
# Step 2: once SES shows verified, accounts_enabled = true → apply
ses_domain       = ""
accounts_enabled = false
