output "function_arn" {
  description = "ARN of the regional probe worker."
  value       = aws_lambda_function.this.arn
}

output "execution_role_arn" {
  description = "IAM role whose permissions are limited to one input queue, one result queue, logs, and X-Ray."
  value       = aws_iam_role.this.arn
}
