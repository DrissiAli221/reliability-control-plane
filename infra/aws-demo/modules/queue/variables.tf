variable "name" {
  description = "Name of the Standard SQS source queue."
  type        = string
}

variable "purpose" {
  description = "Architectural responsibility recorded as a resource tag."
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Time granted to a consumer before an unacknowledged message becomes visible again."
  type        = number
}

variable "max_receive_count" {
  description = "Number of receives before the source queue moves a message to its DLQ."
  type        = number
}
