# Production stack. State lives in the bucket created by ../../bootstrap.
#   terraform init -backend-config="bucket=<TF_STATE_BUCKET>"
#   terraform apply

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true # native S3 locking, no DynamoDB lock table
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { project = "vyakarana-labs", managed_by = "terraform", env = "prod" }
  }
}

locals {
  analytics = var.cf_beacon_token != ""
}

module "site" {
  source            = "../../modules/site"
  name              = "vl"
  domain_name       = var.domain_name
  acm_validated     = var.acm_validated
  csp_script_hashes = var.csp_script_hashes
  csp_style_hashes  = var.csp_style_hashes

  csp_extra_script_src  = local.analytics ? ["https://static.cloudflareinsights.com"] : []
  csp_extra_connect_src = concat(["https://cognito-idp.us-east-1.amazonaws.com"], local.analytics ? ["https://cloudflareinsights.com"] : [])
}

module "guardrails" {
  source      = "../../modules/guardrails"
  name        = "vl"
  alert_email = var.alert_email
}
