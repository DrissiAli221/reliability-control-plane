output "endpoint" {
  description = "Private PostgreSQL endpoint consumed by the control-plane task configuration."
  value       = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "database_name" {
  value = aws_db_instance.this.db_name
}

output "master_secret_arn" {
  description = "AWS-managed Secrets Manager secret for the master credentials."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
