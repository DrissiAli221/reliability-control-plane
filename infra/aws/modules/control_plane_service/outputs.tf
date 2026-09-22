output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "service_name" {
  value = aws_ecs_service.this.name
}

output "load_balancer_dns_name" {
  value = aws_lb.this.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.this.repository_url
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}
