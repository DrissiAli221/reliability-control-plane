resource "aws_s3_bucket" "dashboard" {
  bucket_prefix = "${substr(var.name, 0, 26)}-dashboard-"
}
resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket                  = aws_s3_bucket.dashboard.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "${var.name}-dashboard"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
resource "aws_cloudfront_function" "spa" {
  name    = "${var.name}-spa"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/spa.js")
}
resource "aws_cloudfront_cache_policy" "dashboard" {
  name        = "${var.name}-dashboard"
  min_ttl     = 0
  default_ttl = 60
  max_ttl     = 31536000
  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}
resource "aws_cloudfront_response_headers_policy" "dashboard" {
  name = "${var.name}-dashboard-security"
  security_headers_config {
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      override                   = true
    }
  }
}
resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  comment             = "${var.name} demo dashboard"

  origin {
    domain_name              = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_id                = "dashboard"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }
  default_cache_behavior {
    target_origin_id           = "dashboard"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.dashboard.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.dashboard.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  depends_on = [aws_s3_bucket_public_access_block.dashboard]
}
data "aws_iam_policy_document" "dashboard" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.dashboard.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.dashboard.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  policy = data.aws_iam_policy_document.dashboard.json
}
