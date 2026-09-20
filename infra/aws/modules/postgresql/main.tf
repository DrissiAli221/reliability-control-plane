resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-postgresql"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.name}-postgresql"
  }
}

resource "aws_db_instance" "this" {
  identifier = "${var.name}-postgresql"

  engine         = "postgres"
  engine_version = "17.6"
  instance_class = var.instance_class

  db_name  = "rcp"
  username = "rcp_admin"
  port     = 5432

  manage_master_user_password = true
  storage_encrypted           = true
  storage_type                = "gp3"
  allocated_storage           = 20
  max_allocated_storage       = 100

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.security_group_id]
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period    = 7
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  apply_immediately          = false

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name}-postgresql-final"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  lifecycle {
    precondition {
      condition     = !var.deletion_protection || !var.skip_final_snapshot
      error_message = "A deletion-protected database must also require a final snapshot."
    }
  }
}
