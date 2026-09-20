variable "name" {
  description = "Prefix for central network resources."
  type        = string
}

variable "vpc_cidr" {
  description = "Private IPv4 range for the central control-plane VPC."
  type        = string
}

variable "availability_zones" {
  description = "Exactly two central-region availability zones."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) == 2 && length(distinct(var.availability_zones)) == 2
    error_message = "availability_zones must contain exactly two distinct zones."
  }
}

variable "control_plane_port" {
  description = "Container port accepted only from the ALB security group."
  type        = number
  default     = 8080
}
