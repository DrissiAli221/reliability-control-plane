data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 14
}

data "aws_iam_policy_document" "worker" {
  statement {
    sid    = "ConsumeRegionalProbeJobs"
    effect = "Allow"
    actions = [
      "sqs:ChangeMessageVisibility",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ReceiveMessage"
    ]
    resources = [var.job_queue_arn]
  }

  statement {
    sid       = "PublishCentralProbeResults"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [var.result_queue_arn]
  }

  statement {
    sid    = "WriteOwnLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }

  statement {
    sid    = "PublishXRaySegments"
    effect = "Allow"
    actions = [
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "${var.name}-least-privilege"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.worker.json
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  role          = aws_iam_role.this.arn
  runtime       = "java21"
  architectures = ["arm64"]
  handler       = var.handler

  s3_bucket         = var.artifact_bucket
  s3_key            = var.artifact_key
  s3_object_version = var.artifact_object_version

  memory_size                    = 512
  timeout                        = var.timeout_seconds
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      PROBE_REGION        = var.probe_region
      RESULT_QUEUE_URL    = var.result_queue_url
      RESULT_QUEUE_REGION = var.result_queue_region
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_cloudwatch_log_group.this,
    aws_iam_role_policy.worker
  ]
}

resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn                   = var.job_queue_arn
  function_name                      = aws_lambda_function.this.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 1
  function_response_types            = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = var.maximum_event_source_concurrency
  }
}
