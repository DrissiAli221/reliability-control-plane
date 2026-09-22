variable "name" {
  type        = string
  description = "Name prefix for dashboard hosting resources."
}

variable "force_destroy" {
  type        = bool
  description = "Whether a development bucket may be destroyed while it still contains objects."
  default     = false
}
