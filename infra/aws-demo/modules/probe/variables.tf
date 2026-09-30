variable "name" { type = string }
variable "region" { type = string }
variable "job_queue_arn" { type = string }
variable "result_queue_arn" { type = string }
variable "result_queue_url" { type = string }
variable "artifact_path" { type = string }
variable "offline_mode" { type = bool }

variable "reserve_concurrency" { type = bool }
