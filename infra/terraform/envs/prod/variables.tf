variable "domain_name" {
  description = "Custom host. Leave empty for the first deploy; set after creating DNS records."
  type        = string
  default     = ""
}

variable "acm_validated" {
  description = "Set true after the ACM validation CNAME is in Cloudflare DNS."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Budget and alarm notifications"
  type        = string
}

variable "cf_beacon_token" {
  description = "Cloudflare Web Analytics token; empty disables analytics"
  type        = string
  default     = ""
}

variable "csp_script_hashes" {
  type    = list(string)
  default = []
}

variable "csp_style_hashes" {
  type    = list(string)
  default = []
}

variable "ses_domain" {
  description = "Domain that sends sign-in codes (SES identity). Set first, add DKIM records, then enable accounts."
  type        = string
  default     = ""
}

variable "accounts_enabled" {
  description = "Create Cognito, DynamoDB and the API, and route /api/* to it. Needs a verified ses_domain."
  type        = bool
  default     = false

  validation {
    condition     = !var.accounts_enabled || var.ses_domain != ""
    error_message = "Set ses_domain (and add its DKIM records) before enabling accounts."
  }
}
