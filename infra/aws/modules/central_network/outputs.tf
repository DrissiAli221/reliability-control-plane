output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = [for zone in var.availability_zones : aws_subnet.public[zone].id]
}

output "application_subnet_ids" {
  value = [for zone in var.availability_zones : aws_subnet.application[zone].id]
}

output "database_subnet_ids" {
  value = [for zone in var.availability_zones : aws_subnet.database[zone].id]
}

output "load_balancer_security_group_id" {
  value = aws_security_group.load_balancer.id
}

output "control_plane_security_group_id" {
  value = aws_security_group.control_plane.id
}

output "database_security_group_id" {
  value = aws_security_group.database.id
}
