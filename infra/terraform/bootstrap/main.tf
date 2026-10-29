# One-time bootstrap, run locally with your own AWS credentials (local state).
# Creates: the remote-state bucket, GitHub's OIDC identity provider, and two roles that
# GitHub Actions assumes — "plan" (read-only, for pull requests) and "deploy" (main branch,
# environment "prod"). No long-lived AWS keys are ever stored in GitHub.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = "vyakarana-labs", managed_by = "terraform", stack = "bootstrap" }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "github_repo" {
  description = "owner/name of the GitHub repository allowed to deploy"
  type        = string
  default     = "kartosis/vyakarana-labs"
}

data "aws_caller_identity" "me" {}

locals {
  state_bucket = "vyakarana-labs-tfstate-${data.aws_caller_identity.me.account_id}"
}

# ---------------------------------------------------------------- state bucket
resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" } # AWS-managed key: free
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

# ---------------------------------------------------------------- GitHub OIDC
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS validates GitHub's certificate itself; thumbprints are kept for older tooling.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_policy_document" "trust_plan" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:pull_request",
        "repo:${var.github_repo}:ref:refs/heads/*",
      ]
    }
  }
}

data "aws_iam_policy_document" "trust_deploy" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only jobs running in the protected "prod" environment may deploy.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:prod"]
    }
  }
}

data "aws_iam_policy_document" "state_rw" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
}

# ---------------------------------------------------------------- plan role (PRs)
resource "aws_iam_role" "plan" {
  name                 = "vl-github-plan"
  assume_role_policy   = data.aws_iam_policy_document.trust_plan.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "terraform-state"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.state_rw.json
}

# ---------------------------------------------------------------- deploy role (main → prod)
# Scoped to the services this project uses. IAM is limited to roles/policies named vl-*,
# so the deploy role cannot grant itself or anything else broader access.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid = "ProjectServices"
    actions = [
      "s3:*", "cloudfront:*", "acm:*", "lambda:*", "dynamodb:*", "cognito-idp:*",
      "ses:*", "logs:*", "cloudwatch:*", "sns:*", "budgets:*", "scheduler:*",
      "xray:*", "ssm:GetParameter*", "ssm:PutParameter", "ssm:DeleteParameter", "ssm:AddTagsToResource",
      "ssm:ListTagsForResource", "ssm:DescribeParameters", "tag:GetResources", "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }
  statement {
    sid = "ProjectIam"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole", "iam:PassRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/vl-*"]
  }
  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["replicator.lambda.amazonaws.com", "logger.cloudfront.amazonaws.com", "email.cognito-idp.amazonaws.com"]
    }
  }
  statement {
    sid       = "ReadIam"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicies", "iam:GetOpenIDConnectProvider"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "vl-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.trust_deploy.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "deploy" {
  name   = "project-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role_policy" "deploy_state" {
  name   = "terraform-state"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.state_rw.json
}

# ---------------------------------------------------------------- outputs
output "state_bucket" { value = aws_s3_bucket.state.bucket }
output "plan_role_arn" { value = aws_iam_role.plan.arn }
output "deploy_role_arn" { value = aws_iam_role.deploy.arn }
output "next_steps" {
  value = <<-EOT
    Set these GitHub repository variables (Settings → Secrets and variables → Actions → Variables):
      AWS_REGION       = ${var.region}
      TF_STATE_BUCKET  = ${aws_s3_bucket.state.bucket}
      AWS_PLAN_ROLE    = ${aws_iam_role.plan.arn}
      AWS_DEPLOY_ROLE  = ${aws_iam_role.deploy.arn}
    Then create the GitHub environment "prod".
  EOT
}
