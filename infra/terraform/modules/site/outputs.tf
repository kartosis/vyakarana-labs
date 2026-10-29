output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.site.arn
}

output "distribution_domain" {
  description = "Point your CNAME here (DNS-only / grey cloud in Cloudflare)."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "acm_validation_records" {
  description = "Add these CNAMEs in Cloudflare (DNS-only) before setting acm_validated = true."
  value = local.use_domain ? [
    for o in aws_acm_certificate.site[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ] : []
}

output "csp" {
  value = local.csp
}
