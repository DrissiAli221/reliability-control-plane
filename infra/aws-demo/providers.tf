provider "aws" {
  region                      = "us-east-1"
  skip_credentials_validation = var.offline_mode
  skip_metadata_api_check     = var.offline_mode
  skip_region_validation      = var.offline_mode
  skip_requesting_account_id  = var.offline_mode
  allowed_account_ids         = var.offline_mode ? null : [var.account_id]
  default_tags {
    tags = { Project = "RCP", Environment = "demo", ManagedBy = "Terraform" }
  }
}

provider "aws" {
  alias                       = "europe"
  region                      = "eu-west-1"
  skip_credentials_validation = var.offline_mode
  skip_metadata_api_check     = var.offline_mode
  skip_region_validation      = var.offline_mode
  skip_requesting_account_id  = var.offline_mode
  allowed_account_ids         = var.offline_mode ? null : [var.account_id]
  default_tags {
    tags = { Project = "RCP", Environment = "demo", ManagedBy = "Terraform" }
  }
}
