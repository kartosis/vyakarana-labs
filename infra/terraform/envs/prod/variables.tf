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
