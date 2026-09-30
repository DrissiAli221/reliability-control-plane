resource "aws_s3_bucket" "artifact" {
  bucket_prefix = "${substr(var.name, 0, 27)}-artifact-"
}
resource "aws_s3_bucket_public_access_block" "artifact" {
  bucket                  = aws_s3_bucket.artifact.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_versioning" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "artifact" {
  bucket = aws_s3_bucket.artifact.id
  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
  depends_on = [aws_s3_bucket_versioning.artifact]
}
resource "aws_s3_object" "artifact" {
  bucket       = aws_s3_bucket.artifact.id
  key          = "rcp-probe-lambda.jar"
  source       = var.offline_mode ? null : var.artifact_path
  source_hash  = var.offline_mode ? "offline-placeholder" : filebase64sha256(var.artifact_path)
  content_type = "application/java-archive"
  depends_on   = [aws_s3_bucket_versioning.artifact, aws_s3_bucket_public_access_block.artifact]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "probe" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.trust.json
}
resource "aws_cloudwatch_log_group" "probe" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 3
}

data "aws_iam_policy_document" "probe" {
  statement {
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
    resources = [var.job_queue_arn]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [var.result_queue_arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.probe.arn}:*"]
  }
}
resource "aws_iam_role_policy" "probe" {
  name   = "${var.name}-runtime"
  role   = aws_iam_role.probe.id
  policy = data.aws_iam_policy_document.probe.json
}
resource "aws_lambda_function" "probe" {
  function_name                  = var.name
  role                           = aws_iam_role.probe.arn
  runtime                        = "java21"
  architectures                  = ["arm64"]
  handler                        = "dev.ali.rcp.lambda.ProbeLambdaHandler"
  memory_size                    = 512
  timeout                        = 30
  reserved_concurrent_executions = var.reserve_concurrency ? 10 : -1
  s3_bucket                      = aws_s3_bucket.artifact.id
  s3_key                         = aws_s3_object.artifact.key
  s3_object_version              = aws_s3_object.artifact.version_id
  source_code_hash               = var.offline_mode ? null : filebase64sha256(var.artifact_path)
  environment {
    variables = {
      PROBE_REGION        = var.region
      RESULT_QUEUE_URL    = var.result_queue_url
      RESULT_QUEUE_REGION = "us-east-1"
    }
  }
  tracing_config { mode = "PassThrough" }
  depends_on = [aws_cloudwatch_log_group.probe, aws_iam_role_policy.probe]
}
resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn = var.job_queue_arn
  function_name    = aws_lambda_function.probe.arn
  # One job per invocation avoids sequential batch head-of-line blocking.
  # Ten slots also handle bursts before the scheduler's 30-second result grace expires.
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0
  function_response_types            = ["ReportBatchItemFailures"]
  scaling_config { maximum_concurrency = 10 }
}
