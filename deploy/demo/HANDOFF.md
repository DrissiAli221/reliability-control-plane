# Demo hosting integration handoff

Base: merged PR #2 at `775c51e874c2c8eb138d437754777d40f3c3c304`.
Branch: `codex/demo-hosting`. Changes are confined to `infra/aws-demo/` and
`deploy/demo/`; no application source, production infrastructure, root README,
or shared CI workflow was edited.

The infrastructure feature is commit `7d873ff`; the following commit adds the
server deployment, local verification and this handoff. Integrate both commits
locally after finishing the Phase 1–2 application work. They are not pushed and
no cloud deployment has been performed.

## What is ready

- Independent AWS root: Cognito us-east-1, self-sign-up/email confirmation,
  public code-flow client plus admin password flow, read-only group label `demo`,
  regional Java 21/ARM64 probe Lambdas, three source queues and DLQs, separate
  same-region artifact buckets, private S3/CloudFront dashboard and SPA routing,
  least-privilege runtime IAM user, account-wide budget alerts.
- No Terraform-managed passwords, demo users or IAM access keys. Operator helpers
  create credentials outside state when deployment is explicitly authorized.
- Runtime JSON preserves `eu-west-1` and `us-east-1` map keys. Results and identity
  are central in us-east-1. Dashboard output variables match the current SPA.
- Compose: existing control plane, PostgreSQL 17.6 and Caddy; only Caddy publishes
  ports; file-mounted secrets; read-only unprivileged JVM; bounded CPU/memory/logs;
  private actuator routes; consistent dumps, daily systemd timer and isolated restore.
- Deployment/build/configuration runbooks and a parameterized illustrative cost model.

## Points to preserve in the application integration

1. Implement and test the supplied Phase 2 property contract. The earlier backend
   silently ignores new unknown guardrail properties; wiring values is not proof
   of enforcement. `max-per-owner=3`, `min-interval-seconds=60`, `max-total=25`,
   `read-only-group=demo`, and `seed-example-monitor=true` are supplied in JSON.
2. The merged base still allows `timeoutMs` up to **30,000** in `CreateMonitorRequest`.
   The proposed demo limit is **10,000**. Enforce the 10-second maximum server-side
   before enabling public registration; there is no maximum-timeout property in
   the agreed contract. Do not assume Terraform enforces individual monitor timeouts.
3. `/api/demo/session` must authenticate via `AdminInitiateAuth`, keep the shared
   password on the server, enforce demo-group writes on every mutation, and avoid
   unbounded public login traffic. Stock Caddy does not add a login rate limiter.
4. Provide a trusted bootstrap path for the shared demo's three running monitors.
   Group membership is established before the demo user's permanent password is
   enabled. Do not remove read-only membership from an accessible shared account
   to seed it. Self-sign-up accounts must not be automatically placed in `demo`.
5. Cognito logout URL is the CloudFront origin **without a slash**, matching current
   `window.location.origin`. Callback is `/auth/callback`. Keep both ends aligned.
6. Refresh rotation is on, so `ALLOW_REFRESH_TOKEN_AUTH` is intentionally absent.
   Access/ID tokens expire after 15 minutes. Optional TOTP is for individual users;
   do not enroll the shared demo identity unless the button handles MFA challenges.
7. One probe job per Lambda invocation, no batching delay, SQS max concurrency 10
   per region, timeout 30 seconds, job visibility 180 seconds, result visibility
   60 seconds. Sequential larger batches threaten the scheduler's result grace.
   Reserved concurrency is opt-in because new accounts may not have capacity to
   leave AWS's required 100 slots unreserved; confirm actual regional quotas.
8. Before a long-running public demo, define database history retention/disk alerts
   and choose an off-host encrypted backup destination. VM-local backups alone do
   not survive instance/disk loss. Actual AWS polling/deadline behavior needs live
   verification after an authorized deployment.
9. Current CI validates only `infra/aws/`. Run `infra/aws-demo/validate.sh` explicitly,
   or add a separate CI step in a later change permitted to edit the workflow.

## Verification completed (2026-09-30)

- Terraform format/init with readonly provider lockfile/validate: PASS.
- Fake-variable/fake-credential plan against isolated empty state: 50 resources;
  no AWS API data source, production networking/compute, managed access-key secret,
  or managed Cognito user. Plan scope/IAM/region checks: PASS. Checks also rejected
  simulated NAT inclusion, wildcard runtime grants and a sequential batch of ten.
- One CloudFront routing test and seven configuration/backup-failure tests: PASS.
- Java 21 reactor `verify`: 145 tests, zero failures/errors/skips.
- Shaded Lambda artifact build and direct packaged worker constructor: PASS.
- Existing control-plane Dockerfile build on local ARM64: PASS.
- Isolated Compose smoke: healthy app/PostgreSQL; Flyway applied; anonymous API 401;
  public management 404; expected CORS origin; backup and isolated PostgreSQL restore;
  synthetic marker queried successfully in the restored database; temporary project/volumes cleaned up.

The local smoke deliberately disables SQS runtime and uses a fake Cognito issuer
with loopback HTTP Caddy. It proves packaging and server wiring, not live Cognito,
AWS Lambda/SQS operation, real HTTPS issuance, x86 execution, Phase 2 features,
or deployment to Oracle/EC2. Rebuild/retest the final merged application image.

## Cost correction

The documented model is illustrative and uses available account-wide free
allowances. At 512 MiB, one invocation/check, 60 seconds and two regions:

| Scenario (30 days) | Lambda + SQS estimate only |
|---|---:|
| 8 monitors, average billed duration 0.5 s, no retries | USD 1.83 |
| 25 monitors, average billed duration 0.5 s, no retries | USD 7.45 |
| 25 monitors, average billed duration 10 s, 10% retries | USD 159.22 |

Those totals exclude logs, storage, traffic, CloudFront, Cognito, VM, backups and
domain costs; they are not measured deployment bills. See the infrastructure
README for formulas and official sources. A USD1 budget is an alert, not a hard
cap. Create that initial alert before any application infrastructure deployment.
