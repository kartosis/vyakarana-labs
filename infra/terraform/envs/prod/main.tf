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

data "aws_caller_identity" "me" {}

locals {
  analytics = var.cf_beacon_token != ""
  accounts  = var.accounts_enabled
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

  api_origin = local.accounts ? module.api[0].origin : null
}

# ---------------------------------------------------------------- accounts (milestone M3)
module "email" {
  source = "../../modules/email"
  count  = var.ses_domain == "" ? 0 : 1
  domain = var.ses_domain
}

module "data" {
  source = "../../modules/data"
  count  = local.accounts ? 1 : 0
  name   = "vl"
}

module "auth" {
  source           = "../../modules/auth"
  count            = local.accounts ? 1 : 0
  name             = "vl"
  ses_identity_arn = module.email[0].identity_arn
  from_address     = "Vyakarana Labs <no-reply@${var.ses_domain}>"
}

module "api" {
  source           = "../../modules/api"
  count            = local.accounts ? 1 : 0
  name             = "vl"
  package_path     = "${path.root}/../../../../services/api/dist/vl-api.zip"
  table_arn        = module.data[0].table_arn
  table_name       = module.data[0].table_name
  user_pool_id     = module.auth[0].user_pool_id
  user_pool_arn    = module.auth[0].user_pool_arn
  client_id        = module.auth[0].client_id
  distribution_arn = module.site.distribution_arn
  alarm_topic_arn  = module.guardrails.alarm_topic_arn

  # created by ../../bootstrap; the deploy role can create the app role only with this boundary
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:policy/vl-app-boundary"
}

module "guardrails" {
  source      = "../../modules/guardrails"
  name        = "vl"
  alert_email = var.alert_email
}
