# Low-cost AWS demo infrastructure

This is a separate Terraform root and state from `../aws/`. It builds the AWS half
of a demo; the control plane and PostgreSQL run on one external VM using
[`deploy/demo`](../../deploy/demo/README.md). It creates no VPC, NAT gateway,
ALB, ECS service, RDS instance, EC2 instance, or paid DNS zone.

```mermaid
flowchart LR
  Browser --> CF[CloudFront + private S3 dashboard]
  Browser --> Cognito[Cognito us-east-1]
  Browser --> HTTPS[Caddy HTTPS on demo VM]
  subgraph VM[Single VM]
    HTTPS --> CP[Control plane]
    CP --> PG[(PostgreSQL 17.6)]
  end
  CP --> EUQ[SQS jobs eu-west-1]
  CP --> USQ[SQS jobs us-east-1]
  EUQ --> EU[Lambda eu-west-1]
  USQ --> US[Lambda us-east-1]
  EU --> RQ[SQS results us-east-1]
  US --> RQ
  RQ --> CP
```

Production retains its separate multi-AZ network, NAT gateways, ALB, ECS, and RDS.
The demo gives up database HA and managed VM operations to avoid those fixed
costs. Local validation proves configuration, not AWS deployment or availability.

## Contract

- Cognito is in **us-east-1**; self sign-up and email-code verification are enabled.
  Lite tier, the production password policy, and optional TOTP are explicit.
- A public OAuth client uses authorization code flow; the browser supplies PKCE.
  The backend may use `ADMIN_USER_PASSWORD_AUTH` via its IAM user for the demo
  button. Refresh-token rotation is enabled; the incompatible
  `ALLOW_REFRESH_TOKEN_AUTH` flow is omitted.
- Group `demo` is a label. Backend enforcement of read-only access is required;
  Terraform does not grant application permissions.
- Cognito callback is the generated CloudFront origin plus `/auth/callback`.
  Logout uses the origin **without a trailing slash**, matching the current SPA.
- The shared demo user and server IAM access key are created by an operator outside
  Terraform. No password, access-key secret, or demo account goes into its state.
- Probes run in **eu-west-1** and **us-east-1**, with central results in us-east-1.
  Source queues and workers share a region. Each queue has a restricted DLQ.
- Runtime IAM: send only to two job queues; receive/delete/change visibility/read
  attributes only on the result queue; `AdminInitiateAuth` only on this user pool.
- The output `server_application_json` preserves the region keys exactly. It also
  wires 3 monitors/owner, 60-second minimum interval, 25 monitors globally, demo
  group enforcement, and a 5,000 ms maximum timeout. `rcp.demo.monitors` seeds
  Example Domain and Wikipedia for the shared account, and
  `rcp.demo.example-monitor-url=https://example.com` enables one-time onboarding.
  Provisioning captures the Cognito UUID `sub` in a host file supplied through
  `RCP_DEMO_OWNER_SUBJECT`; an email/username is not a valid substitute. The earlier
  `seed-example-monitor` flag is removed because PR #4 does not implement it.
  Merge PRs #3 then #4 before deploying the application.
- Lambda uses Java 21/ARM64/512 MiB, 30-second timeout, one job per invocation,
  a maximum of ten SQS invocations per region, and partial failures.
  The current handler is sequential, and scheduled jobs have a 30-second result
  grace period. Larger batches can consume that grace while later records wait.
  The concurrency limit provides burst capacity for the full 25-monitor cap; measure
  cold starts and end-to-end lateness after deployment. Reserved concurrency is off
  by default: new AWS accounts can have reduced regional quotas, and AWS requires
  100 slots to remain unreserved. Verify each region's capacity before opting into
  `reserve_probe_concurrency=true` (ten reserved slots/region). The SQS maximum of
  ten remains enforced without reservation; there is no function URL or second
  event source. Account contention can still throttle workers.
- Job visibility is 180 seconds (6 × Lambda timeout), result visibility 60 seconds,
  long polling 20 seconds, max receives 5, Lambda logs retained 3 days. No active
  X-Ray sampling or provisioned Lambda/SQS polling capacity is configured.
- CloudFront rewrites SPA routes to `index.html` at viewer request time. Missing
  `/assets/` objects keep their error instead of returning HTML. Private S3 access
  uses OAC; a zero minimum cache TTL allows `index.html` to be uploaded uncached.

## Validate without AWS credentials or resources

Run from the repository root:

```sh
./infra/aws-demo/validate.sh
```

This runs format checks, provider initialization with the committed lockfile,
validation, and a plan using fake variables and fake credentials. It isolates the
plan from deployed state, disables provider identity lookups, and checks the plan
for excluded resource types, region placement, IAM actions, and runtime settings.
Provider downloads contact the Terraform registry; AWS APIs are not needed.
Never apply a plan made with `offline_mode=true`.

The existing repository CI validates `infra/aws/` only. Until a separately approved
workflow change adds this folder, run this validation explicitly. The lockfile
includes provider checksums for Linux and both Mac architectures.

## Later deployment sequence (requires account and deployment authorization)

1. Create the AWS account and an account-wide **$1 monthly budget alert before
   any application resources**. AWS Budgets alerts lag usage and do not cap
   spending. The budget resource here maintains matching alerts at 10% actual,
   100% actual, and 100% forecast; credits/refunds are excluded so credits do not
   hide consumption. An existing budget can be imported by an operator, or use
   the matching name when creating it. This root does not enforce resource
   creation ordering; a full apply is not a substitute for the initial alarm.
2. Finish and merge Claude's session fixes, read-only backend role, demo login,
   quotas, and seeding. PR #4 implements `rcp.monitors.max-timeout-ms`; this root
   supplies 5000. Verify the final merged backend actually reads those values.
3. Build and verify the shaded probe artifact with Java 21:

   ```sh
   JAVA_HOME=$(/usr/libexec/java_home -v 21) ./rcp-control-plane/mvnw -pl rcp-probe-lambda -am verify
   ```

   On Linux, set Java 21 using the server/CI runtime rather than the macOS helper.
   This creates `rcp-probe-lambda/target/rcp-probe-lambda.jar`. The same JAR is uploaded
   to separate private, versioned buckets in each region; Lambda's artifact bucket
   must be in its own region. Old artifact versions expire after 7 days.
4. Copy `terraform.tfvars.example` to the ignored `terraform.tfvars`, set the real
   account ID, notification email, API HTTPS origin, and a unique name. Keep the
   name distinct from production. Use deployment credentials, never the runtime
   IAM user. `offline_mode` must be false; the provider rejects other accounts.
5. Review a real plan with the operator, then deploy only after authorization.
   Do not reuse an offline plan. The central resources are us-east-1; the second
   provider handles only the Europe worker and job queues.
6. Export `terraform output -json` to a private file and follow the VM runbook.
   The outputs include identity, queues/DLQs, dashboard build variables, the
   runtime username, and nonsecret Spring JSON. Configure and smoke-test the
   final merged backend before publishing the dashboard.
7. Upload the dashboard's hashed assets with long immutable cache headers and
   `index.html` with `Cache-Control: no-cache,max-age=0,must-revalidate`; invalidate
   `/index.html` after a release. Do not upload credentials or `.env` files.

## Cost model and limits

**Low-cost does not mean always free.** Check the actual account's eligibility,
current regional prices, and usage shared with other projects. Credits are
finite; free-tier allowances are account-wide and not doubled by two regions.

The supplied request-only estimate misses Lambda GB-seconds. At 25 monitors,
60 seconds, two regions and 30 days, the configured one-job batches produce
2,160,000 checks/invocations before retries. Average billed duration must include
probe time, DNS/TLS setup, result publishing, cold starts, and failures.

`cost-estimate.py` is an explicit illustrative model, using 512 MiB, ARM duration
at $0.0000133334/GB-second, requests at $0.20/million, standard SQS at $0.40/million,
and available account-wide allowances of 1M Lambda requests, 400k GB-seconds and
1M SQS requests. It conservatively counts six SQS calls/check plus up to five idle
pollers per region and one result consumer at 20 seconds. Actual receive/delete
batching and busy/idle overlap change this; retries increase it.

```sh
python3 infra/aws-demo/cost-estimate.py --monitors 8 --seconds 0.5
python3 infra/aws-demo/cost-estimate.py --monitors 25 --seconds 0.5
python3 infra/aws-demo/cost-estimate.py --monitors 25 --seconds 5 --retry-percent 10
```

S3 storage/requests, CloudFront requests/transfer/functions, cross-region result
traffic, CloudWatch logs, Cognito users/email quotas, budget service charges, VM
storage/traffic, backups, and a domain are **additional**, not assumed to be cents.
At 25 monitors, an average billed duration of 0.5 seconds and no retries gives
about $7.45/month for Lambda and SQS in this model. An average of 5 seconds with
10% retries gives about $80.01/month. The 5-second probe timeout reduces the
worst case, but does not cap total Lambda billed duration: startup, DNS/TLS, and
result publishing also contribute. Sustained outages can still cost substantially
more than fast successful checks.
The $1 alarm is an early warning, not a promise to remain below $1.

Official references, checked 2026-09-30:
[Lambda pricing](https://aws.amazon.com/lambda/pricing/),
[SQS pricing](https://aws.amazon.com/sqs/pricing/),
[S3 pricing](https://aws.amazon.com/s3/pricing/),
[AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/),
[Budgets limitations](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html),
[SQS/Lambda timeout guidance](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html),
[refresh token rotation](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html),
[reserved concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html),
[new-account quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html).

## State and teardown

Use a separate protected state store with locking before an authorized deployment.
No production backend configuration is inherited. Even without passwords or keys,
state/output files contain account, email, and infrastructure identifiers: do not
commit or publish them. Deployment tfvars and plan files are ignored.

Cognito deletion protection is on and S3 force-destroy is off. Teardown therefore
requires explicit operator review, disabling pool protection, and emptying buckets
including object versions. Back up PostgreSQL and export required configuration
before deleting anything. Removing AWS resources does not remove the VM's volumes,
keys, backups, or DNS records; handle those separately.
