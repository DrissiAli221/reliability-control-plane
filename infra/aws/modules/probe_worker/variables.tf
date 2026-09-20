variable "name" {
  description = "Regional Lambda function and IAM role name."
  type        = string
}

variable "probe_region" {
  description = "Region the worker must report in every probe result."
  type        = string
}

variable "job_queue_arn" {
  description = "ARN of the same-region probe-job queue consumed by this worker."
  type        = string
}

variable "result_queue_arn" {
  description = "ARN of the central result queue this worker may publish to."
  type        = string
}

variable "result_queue_url" {
  description = "URL of the central result queue supplied to the worker adapter."
  type        = string
}

variable "result_queue_region" {
  description = "AWS region used to construct the result SQS client."
  type        = string
}

variable "artifact_bucket" {
  description = "Existing S3 bucket containing the immutable Lambda deployment artifact."
  type        = string
}

variable "artifact_key" {
  description = "Versioned S3 key of the Lambda deployment artifact."
  type        = string
}

variable "artifact_object_version" {
  description = "Optional S3 object version pin. Required for an authorized deployment."
  type        = string
  default     = null
}

variable "handler" {
  description = "Java Lambda handler implemented by the probe-worker artifact."
  type        = string
  default     = "dev.ali.rcp.lambda.ProbeLambdaHandler::handleRequest"
}

variable "timeout_seconds" {
  description = "Hard Lambda invocation timeout. Queue visibility must retain a safety margin above this."
  type        = number
  default     = 30
}

variable "reserved_concurrency" {
  description = "Regional upper bound that prevents probe amplification during backlog or retry storms."
  type        = number
  default     = 10
}

variable "maximum_event_source_concurrency" {
  description = "Maximum concurrency allocated to this SQS event source."
  type        = number
  default     = 10
}
