output "queue_url" {
  description = "URL used by producers and consumers."
  value       = aws_sqs_queue.this.url
}

output "queue_arn" {
  description = "ARN used in IAM and Lambda event-source mappings."
  value       = aws_sqs_queue.this.arn
}

output "dlq_url" {
  description = "URL of the dead-letter queue."
  value       = aws_sqs_queue.dead_letter.url
}

output "dlq_arn" {
  description = "ARN of the dead-letter queue."
  value       = aws_sqs_queue.dead_letter.arn
}
