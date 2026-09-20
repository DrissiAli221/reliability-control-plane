# AWS Terraform

This directory incrementally declares the validated AWS architecture. The first slice creates no resources by itself: it models the central result queue and one probe-job queue plus DLQ in each of two explicit AWS regions.

Provider aliases are intentionally explicit. Terraform cannot dynamically create provider configurations, so adding a real probe region requires a reviewed provider alias and module instance. That friction makes geographic placement visible in code.

## Local validation without AWS access

The offline plan uses fake process-local credentials only to configure the provider. It skips AWS identity and region API calls and must never be used with `terraform apply`.

```bash
cd infra/aws
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
AWS_ACCESS_KEY_ID=offline \
AWS_SECRET_ACCESS_KEY=offline \
terraform plan \
  -refresh=false \
  -var-file=terraform.tfvars.example \
  -out=rcp-offline.tfplan
terraform show rcp-offline.tfplan
```

The expected first-slice plan is six Standard SQS queues—three source queues and three DLQs—plus three DLQ redrive-allow policies. A successful offline plan proves Terraform can construct the dependency graph and provider schemas. It does not prove AWS credentials, IAM authorization, quotas, service behavior, cost, or successful creation.

## State and secrets

Terraform state and saved plans can contain sensitive values. Local state, plans, and `.terraform/` are ignored by Git. A future authorized AWS environment must use a separately bootstrapped encrypted remote backend with locking, restricted IAM, versioning, and recovery—not hard-coded credentials or committed backend secrets.

Do not run `terraform apply` until the remaining infrastructure has been reviewed and an AWS account, budget, regions, remote-state bootstrap, and destroy procedure have been explicitly authorized.
