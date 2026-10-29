# SES domain identity used by Cognito to send sign-in codes. DNS lives in Cloudflare, so the
# DKIM records are outputs for you to add (DNS only). Verification takes a few minutes.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "domain" {
  description = "Sending domain, e.g. sanskrit.identifyragas.com"
  type        = string
}

data "aws_caller_identity" "me" {}

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain
}

# Let Cognito send from this identity on our behalf.
resource "aws_sesv2_email_identity_policy" "cognito" {
  email_identity = aws_sesv2_email_identity.domain.email_identity
  policy_name    = "cognito-send"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CognitoSendSignInCodes"
      Effect    = "Allow"
      Principal = { Service = "email.cognito-idp.amazonaws.com" }
      Action    = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource  = aws_sesv2_email_identity.domain.arn
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.me.account_id } }
    }]
  })
}

output "identity_arn" {
  value = aws_sesv2_email_identity.domain.arn
}

output "verified" {
  value = aws_sesv2_email_identity.domain.verified_for_sending_status
}

output "dkim_records" {
  description = "Add each as a CNAME in Cloudflare (DNS only)"
  value = [
    for t in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens : {
      name  = "${t}._domainkey.${var.domain}"
      type  = "CNAME"
      value = "${t}.dkim.amazonses.com"
    }
  ]
}
