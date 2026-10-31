# One-time bootstrap, run locally with your own AWS credentials (local state).
# Creates: the remote-state bucket, GitHub's OIDC identity provider, two roles that GitHub Actions
# assumes — "plan" (read-only, for pull requests) and "deploy" (main branch, environment "prod") — and the
# permissions boundary every app role must carry. No long-lived AWS keys are ever stored in GitHub.
# Policy checks: infra/terraform/tests/test_iam_policies.py (run in CI).

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

# Pull-request plans read the state and never change it (review #3); `terraform plan -lock=false` writes nothing.
data "aws_iam_policy_document" "state_ro" {
  statement {
    sid       = "ListState"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    sid    = "NeverWriteState"
    effect = "Deny"
    actions = [
      "s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObjectAcl", "s3:PutObjectVersionAcl",
      "s3:RestoreObject", "s3:PutObjectRetention", "s3:PutObjectLegalHold",
    ]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    sid       = "NeverChangeStateBucket"
    effect    = "Deny"
    actions   = ["s3:PutBucket*", "s3:DeleteBucket*", "s3:PutLifecycleConfiguration", "s3:PutEncryptionConfiguration"]
    resources = [aws_s3_bucket.state.arn]
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
  name   = "terraform-state-read"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.state_ro.json
}

# ReadOnlyAccess also reads data: learners' records, sign-in emails, log lines. A plan needs only resource
# descriptions (DescribeTable, DescribeUserPool, DescribeLogGroups …), never the data (P1 exit review X7).
data "aws_iam_policy_document" "plan_no_user_data" {
  statement {
    sid    = "NeverReadLearnerData"
    effect = "Deny"
    actions = [
      "dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:PartiQLSelect",
      "dynamodb:ExportTableToPointInTime", "dynamodb:GetRecords", "dynamodb:GetShardIterator",
      "cognito-idp:ListUsers", "cognito-idp:ListUsersInGroup", "cognito-idp:AdminGetUser",
      "cognito-idp:AdminListGroupsForUser", "cognito-idp:AdminListDevices", "cognito-idp:AdminListUserAuthEvents",
      "logs:GetLogEvents", "logs:FilterLogEvents", "logs:StartQuery", "logs:GetQueryResults", "logs:StartLiveTail",
      "logs:GetLogRecord",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "plan_no_user_data" {
  name   = "no-user-data"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_no_user_data.json
}

# ---------------------------------------------------------------- permissions boundary for app roles
# Every role the deploy role creates (named vl-app-*) must carry this boundary, so whatever policy is
# attached to it, the role can never do more than the app needs — and never anything in IAM or STS (review #2).
data "aws_iam_policy_document" "app_boundary" {
  statement {
    sid = "AppData"
    actions = [
      "dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:BatchWriteItem", "dynamodb:ConditionCheckItem",
    ]
    resources = [
      "arn:aws:dynamodb:*:${data.aws_caller_identity.me.account_id}:table/vl-*",
      "arn:aws:dynamodb:*:${data.aws_caller_identity.me.account_id}:table/vl-*/index/*",
    ]
  }
  statement {
    sid       = "AppUsers"
    actions   = ["cognito-idp:AdminDeleteUser", "cognito-idp:AdminGetUser", "cognito-idp:AdminUserGlobalSignOut"]
    resources = ["arn:aws:cognito-idp:*:${data.aws_caller_identity.me.account_id}:userpool/*"]
  }
  statement {
    sid       = "AppLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:${data.aws_caller_identity.me.account_id}:log-group:/aws/lambda/vl-*"]
  }
  statement {
    sid       = "AppTracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
  statement {
    sid       = "NeverIdentity"
    effect    = "Deny"
    actions   = ["iam:*", "sts:*", "organizations:*", "account:*"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "app_boundary" {
  name        = "vl-app-boundary"
  description = "Permissions boundary for roles the deploy pipeline creates (vl-app-*)"
  policy      = data.aws_iam_policy_document.app_boundary.json
}

# ---------------------------------------------------------------- deploy role (main → prod)
# Scoped to the services this project uses. In IAM it may manage only app roles (vl-app-*), each carrying the
# vl-app-boundary permissions boundary, and pass them only to Lambda. It can never change itself, the plan role
# or the boundary (explicit denies), so it cannot grant itself or anything else broader access (review #2).
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
    sid = "AppRolesRead"
    actions = [
      "iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole", "iam:ListRoleTags",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/vl-app-*"]
  }
  statement {
    sid = "AppRolesManage"
    actions = [
      "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:UpdateAssumeRolePolicy",
      "iam:TagRole", "iam:UntagRole",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/vl-app-*"]
  }
  statement {
    sid = "AppRolesOnlyWithBoundary"
    actions = [
      "iam:CreateRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy",
      "iam:DetachRolePolicy", "iam:PutRolePermissionsBoundary",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/vl-app-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.app_boundary.arn]
    }
  }
  statement {
    sid       = "PassAppRolesToLambda"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/vl-app-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
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
  statement {
    sid       = "NeverPipelineRoles"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/vl-github-*"]
  }
  statement {
    # Terraform needs the state objects and its lock file; never their history or the bucket's settings
    # (bootstrap owns the bucket). P1 exit review X6.
    sid    = "NeverRewriteState"
    effect = "Deny"
    actions = [
      "s3:DeleteObjectVersion", "s3:PutBucketVersioning", "s3:PutLifecycleConfiguration", "s3:DeleteBucket",
      "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketPublicAccessBlock", "s3:PutEncryptionConfiguration",
      "s3:PutBucketOwnershipControls", "s3:PutBucketAcl", "s3:PutObjectAcl", "s3:PutObjectVersionAcl",
    ]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    sid       = "NeverRemoveBoundary"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }
  statement {
    sid    = "NeverEditBoundary"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion",
      "iam:TagPolicy", "iam:UntagPolicy",
    ]
    resources = [aws_iam_policy.app_boundary.arn]
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
output "app_boundary_arn" { value = aws_iam_policy.app_boundary.arn }
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
