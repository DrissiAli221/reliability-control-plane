variable "name" {
  description = "Name prefix for PostgreSQL resources."
  type        = string
}

variable "subnet_ids" {
  description = "Isolated database subnet IDs spanning two availability zones."
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group permitting PostgreSQL only from control-plane tasks."
  type        = string
}

variable "instance_class" {
  description = "RDS instance class; deliberately small for a non-production reference environment."
  type        = string
}

variable "multi_az" {
  description = "Whether RDS maintains a synchronous standby in another AZ. This is intra-region resilience, not multi-region HA."
  type        = bool
}

variable "deletion_protection" {
  description = "Protect the database from accidental Terraform deletion."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Whether deletion may occur without a final snapshot. Must be false for durable environments."
  type        = bool
}
