output "bucket_name" {
  value = aws_s3_bucket.this.id
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}

output "dashboard_url" {
  value = "https://${aws_cloudfront_distribution.this.domain_name}"
}
