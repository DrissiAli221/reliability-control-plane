# AWS Terraform

This directory incrementally declares the validated AWS architecture. It currently models the regional queue/worker plane, central network and PostgreSQL source-of-truth boundary, and Cognito operator identity.

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

The queue slice contains six Standard SQS queues—three source queues and three DLQs—plus three DLQ redrive-allow policies. The worker slice adds two Lambda functions, event-source mappings, execution roles, inline least-privilege policies, and retained log groups. A successful offline plan proves Terraform can construct the dependency graph and provider schemas. It does not prove the not-yet-built artifact, AWS credentials, IAM authorization, quotas, service behavior, cost, or successful creation.

Each worker can consume only its own regional job queue and send only to the central result queue. It has no RDS permissions and no VPC attachment to control-plane private subnets. Reserved concurrency and event-source concurrency are both capped at 10 so a backlog or retry storm cannot create unbounded probing. Partial batch responses are enabled; the Java handler must return the failed SQS item identifiers.

The artifact bucket is deliberately external to this stack. Terraform consumes the shaded JAR produced at `rcp-probe-lambda/target/rcp-probe-lambda.jar`; it does not compile or upload mutable local source during planning. The placeholder in `terraform.tfvars.example` is sufficient only for offline planning and cannot support an apply.

The central VPC spans two availability zones. Public subnets contain only edge/NAT resources; future Fargate tasks use private application subnets; RDS uses isolated subnets with no default Internet route. Security groups allow PostgreSQL only from the control-plane task group. Two NAT gateways preserve AZ-local egress for cross-region SQS publication and OIDC/telemetry calls, but they carry meaningful hourly and data-processing cost—another reason this plan must not be applied casually.

The reference database is private and encrypted, exports PostgreSQL logs, keeps seven days of automated backups, enables Performance Insights, and asks RDS to manage the master password in Secrets Manager. The example deliberately uses a small Single-AZ instance and development teardown settings; this is not a production-HA claim. Before durable use, enable Multi-AZ, deletion protection, and final snapshots, then perform a restore/failover exercise with explicit RPO/RTO.

The Cognito user pool is for human operators. Its dashboard app client is public—there is deliberately no browser-exposed client secret—and allows only the authorization-code grant. The React client must add PKCE (S256) to that flow. Cognito access tokens identify this app in the `client_id` claim and use `token_use=access`; the Spring resource server validates both in addition to signature, issuer, expiry, and not-before checks. Callback and logout URLs are exact allowlists. The example localhost values and globally unique domain placeholder must be replaced before any authorized apply. No user account is created by this stack.

## State and secrets

Terraform state and saved plans can contain sensitive values. Local state, plans, and `.terraform/` are ignored by Git. A future authorized AWS environment must use a separately bootstrapped encrypted remote backend with locking, restricted IAM, versioning, and recovery—not hard-coded credentials or committed backend secrets.

Do not run `terraform apply` until the remaining infrastructure has been reviewed and an AWS account, budget, regions, remote-state bootstrap, and destroy procedure have been explicitly authorized.
