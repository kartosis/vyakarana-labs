# Static site: private S3 bucket → CloudFront (OAC), clean URLs, strict security headers,
# optional custom domain (ACM, two-phase because DNS lives in Cloudflare), optional API origin.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

data "aws_caller_identity" "me" {}
data "aws_region" "current" {}

data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }

locals {
  bucket_name   = "${var.name}-site-${data.aws_caller_identity.me.account_id}"
  use_domain    = var.domain_name != ""
  attach_domain = local.use_domain && var.acm_validated
  csp = join("; ", [
    "default-src 'self'",
    join(" ", concat(["script-src 'self' 'wasm-unsafe-eval'"], var.csp_script_hashes, var.csp_extra_script_src)),
    join(" ", concat(["style-src 'self'"], var.csp_style_hashes)),
    "img-src 'self' data:",
    "font-src 'self'",
    join(" ", concat(["connect-src 'self'"], var.csp_extra_connect_src)),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ])
}

# ---------------------------------------------------------------- bucket
resource "aws_s3_bucket" "site" {
  bucket        = local.bucket_name
  force_destroy = true # content is rebuilt from git on every deploy
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "CloudFrontReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.site.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}

# ---------------------------------------------------------------- clean URLs
resource "aws_cloudfront_function" "rewrite" {
  name    = "${var.name}-index-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Map /path/ and /path to /path/index.html"
  publish = true
  code    = file("${path.module}/rewrite.js")
}

# ---------------------------------------------------------------- headers
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.name}-security"
  comment = "Strict security headers; CSP hashes are recomputed from the build on every deploy"

  security_headers_config {
    content_security_policy {
      content_security_policy = local.csp
      override                = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = false # identifyragas.com's other hosts are not ours to pin
      preload                    = false
      override                   = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
      override = true
    }
    items {
      header   = "Cross-Origin-Opener-Policy"
      value    = "same-origin"
      override = true
    }
  }

  lifecycle {
    precondition {
      condition     = length(local.csp) <= 1783
      error_message = "CloudFront limits the CSP header to 1783 characters; reduce inline scripts/styles."
    }
  }
}

# ---------------------------------------------------------------- certificate (custom domain)
resource "aws_acm_certificate" "site" {
  count             = local.use_domain ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
    precondition {
      condition     = data.aws_region.current.region == "us-east-1"
      error_message = "CloudFront certificates must be issued in us-east-1."
    }
  }
}

resource "aws_acm_certificate_validation" "site" {
  count           = local.attach_domain ? 1 : 0
  certificate_arn = aws_acm_certificate.site[0].arn
}

# ---------------------------------------------------------------- distribution
resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = var.price_class
  default_root_object = "index.html"
  comment             = "${var.name} site"
  aliases             = local.attach_domain ? [var.domain_name] : []

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  dynamic "origin" {
    for_each = var.api_origin == null ? [] : [var.api_origin]
    content {
      origin_id                = "api"
      domain_name              = origin.value.domain_name
      origin_access_control_id = origin.value.oac_id
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.api_origin == null ? [] : [var.api_origin]
    content {
      path_pattern               = "/api/*"
      target_origin_id           = "api"
      viewer_protocol_policy     = "https-only"
      allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id   = ordered_cache_behavior.value.origin_request_policy_id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    }
  }

  # S3 behind OAC answers 403 for a missing key; show the site's own 404 page.
  # Custom error responses apply to every origin, so only 403 is mapped and the API
  # never returns 403 (it uses 401 for auth failures and passes its own 404s through).
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.attach_domain
    acm_certificate_arn            = local.attach_domain ? aws_acm_certificate_validation.site[0].certificate_arn : null
    ssl_support_method             = local.attach_domain ? "sni-only" : null
    minimum_protocol_version       = local.attach_domain ? "TLSv1.2_2021" : null
  }
}
