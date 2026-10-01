# Demo hosting integration handoff

Base: merged PR #2 at `775c51e874c2c8eb138d437754777d40f3c3c304`.
Branch: `codex/demo-hosting`. Changes are confined to `infra/aws-demo/` and
`deploy/demo/`; no application source, production infrastructure, root README,
or shared CI workflow was edited.

The infrastructure feature is commit `7d873ff`; server deployment is `17bf5e9`.
The compatibility commit aligns the contract with PR #4. Integrate this
hosting branch locally after merging the Phase 1–2 application work. It is not
pushed and no cloud deployment has been performed.

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

## Application startup fix confirmed (2026-10-01)

**Resolved in PR #4 commit `e561da2ea805af8f7c2a91d5a766759fee794ed6`, whose
Java, dashboard, and production Terraform CI checks are green.** PRs #3 and #4
are still open as of this check. The previously tested head `1513158` failed
to start under the `aws` profile with demo credentials configured: Spring reports
`CognitoDemoSessionIssuer: No default constructor found`. The component has both
its production constructor and a test constructor, but neither was annotated for
Spring injection. Local demo tests select a different issuer and miss this failure.

`patches/pr4-cognito-constructor.patch` contains the explicit `@Autowired` on the
production constructor plus a Spring-context regression test. This patch is a
review artifact for Claude's application branch; this hosting task did not edit
backend source in either Git checkout. A temporary test snapshot reproduced the failure before the
patch and passed the new context test after it. Claude has now applied the
constructor annotation and a context regression test in PR #4; the patch is
historical and should not be reapplied. Rebuild and run the `aws`-profile smoke
on the final merged application after local disk/Docker recovery.

## Phase 2 contract aligned with PR #4

Current application reference: PR #4 head `e561da2ea805af8f7c2a91d5a766759fee794ed6`.
The full local integration below tested the previous head `1513158` and a
temporary constructor fix; it has not been repeated on the new head.
PR #4 is stacked on PR #3; merge #3 first. This hosting branch stays based on
merged PR #2 and does not import or modify Claude's application commits.

1. Runtime JSON supplies `max-per-owner=3`, `min-interval-seconds=60`,
   `max-total=25`, `max-timeout-ms=5000` and `read-only-group=demo`. PR #4 now
   implements those limits, including the maximum timeout; the earlier unresolved
   30-second timeout concern is addressed by this configuration plus PR #4.
2. `rcp.demo.monitors` supplies Example Domain and Wikipedia for the shared demo;
   `rcp.demo.example-monitor-url=https://example.com` enables one-time onboarding.
   The previously proposed `seed-example-monitor` boolean is removed because the
   actual implementation uses the URL property.
3. The provisioning helper captures `User.Attributes[sub]` from the same
   `AdminCreateUser` response and saves the Cognito UUID to
   `secrets/demo_owner_subject`, not Terraform state. Compose mounts that file;
   the entrypoint exports `RCP_DEMO_OWNER_SUBJECT`. The UUID must match the token's
   subject; using the email would seed an unrelated owner and show an empty demo.
4. The helper still adds `demo` membership before enabling a permanent password.
   PR #4 seeds monitors internally on startup, so there is no need to remove
   read-only membership or grant the runtime key group-management privileges.
   Startup defaults create two monitors, matching Claude's implementation.
5. The existing `AdminInitiateAuth` permission and
   `ALLOW_ADMIN_USER_PASSWORD_AUTH` app-client flow already match PR #4.
   Shared user must have no MFA or forced password change. PR #4's demo endpoint
   returns no refresh token; it has a 30/minute limit for the single backend.
6. Keep Cognito callback `/auth/callback` and logout origin **without a slash**.
   Refresh rotation is enabled; `ALLOW_REFRESH_TOKEN_AUTH` is intentionally absent.
   Individual sign-up accounts are not placed in the `demo` group.
7. One probe job per invocation, no batching delay, SQS max concurrency 10/region,
   timeout 30 seconds, job visibility 180 seconds, result visibility 60 seconds.
   Reserved concurrency remains opt-in due to new-account regional quotas.
8. Define database history retention/disk alerts and choose off-host encrypted
   backups before long-running public use. VM-local backups do not survive disk
   loss. Confirm actual AWS probe deadlines and Cognito behavior after deployment.
9. Current CI validates only `infra/aws/`. Run `infra/aws-demo/validate.sh`
   explicitly, or add a separate CI step in a later workflow-authorized change.

## Initial verification against merged PR #2 (2026-09-30)

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

## Compatibility verification against PR #4 (2026-09-30)

- Immutable application snapshot: `1513158e1f8e0ae0e0fbe164966f8af4f6a4fc3c`.
  Application source was read from Git into a temporary directory; neither
  Claude's active checkout nor this branch's application source was changed.
- Snapshot's Java 21 reactor `verify`: 164 tests (161 control plane, 3 Lambda),
  zero failures/errors/skips. Existing Dockerfile built that snapshot on ARM64.
- Updated Terraform validate/fake-variable plan: PASS, same 50-resource boundary.
- Eleven configuration/backup/provisioning tests plus one CloudFront routing test:
  PASS. Provisioning tests mock AWS CLI and verify group-before-password ordering,
  UUID capture, no password in arguments, private file modes, and failure handling.
- Unpatched PR #4 `aws`-profile Compose startup: FAIL, reproduced missing constructor
  injection. The supplied regression test fails before the patch and passes after it.
  A patched temporary image passed full `aws`-profile startup, private management,
  anonymous 401, CORS, backup and isolated restore, with no Cognito API calls.
- Phase 2 Compose integration with local JWTs and polling/workers disabled: PASS.
  Correct subject owns Example Domain and Wikipedia; `/api/me` reads the configured
  3-owner/25-global/60-second/10,000-ms limits; demo write/onboarding requests return
  403; ordinary accounts reject sub-60-second intervals and >10,000-ms timeouts;
  onboarding creates one monitor once. V10 migrations, private management, CORS,
  backup and isolated restore passed; temporary containers/volumes cleaned up.

The default smoke uses `aws` profile with fake identity and disabled polling;
`--phase2` uses local JWTs solely inside a temporary loopback project. Neither
mode verifies live Cognito/AWS probes, real HTTPS issuance, x86 execution, or
Oracle/EC2 deployment. Production Compose still uses the `aws` profile. Rebuild
and rerun the checks on the final merged application commit before deployment.

## Timeout update and lightweight verification (2026-10-01)

The demo probe timeout is reduced from 10,000 ms to 5,000 ms in Terraform's
runtime output, configuration validation, test fixtures, and the local smoke
contract. The smoke now checks rejection at 5,001 ms. Lambda's 30-second execution
timeout and SQS visibility remain unchanged: they cover invocation overhead and
queue redelivery, not the application's HTTP probe timeout.

Docker builds and container tests were not repeated: the Mac has only 2.3 GiB
free and Docker was reported to have metadata I/O errors. Non-Docker configuration,
provisioning, backup-failure and routing tests plus Terraform validation/offline
plan were rerun. Prior container evidence above used the 10,000 ms setting.
Recover disk/Docker and rerun the updated container smoke before deployment.

## Cache recovery and container verification (2026-10-01)

Disposable runtime download archives, this task's temporary application snapshot,
build outputs, cached Terraform provider binaries, Conda downloads/indexes, and
unused Docker build cache were cleared. The Mac's available disk space increased
from 2.1 GiB to 6.4 GiB. Docker Desktop was restarted without a data reset; all six
existing RCP containers restarted, PostgreSQL became healthy, and its original
named volume was retained. No live database volume, project source, download, or
document was removed. A protected database dump and archive listing succeeded.
Terraform providers will be downloaded again on the next initialization.

The updated 5-second Phase 2 smoke passed using the already-built temporary PR #4
constructor-fix image, without a new image build. It verified configured limits,
rejection at 5,001 ms, read-only writes, seeded ownership, one-time onboarding,
health/CORS/private management, backup, and isolated restore. This remains local
proof against that earlier image, not a build of the final merged application or
verification of live AWS/Cognito.

The restore helper now explicitly removes anonymous volumes when deleting its
own temporary container. A repeat restore of the recovered database succeeded,
and the exact set of existing volumes was unchanged after the test. The temporary
volume from the earlier smoke was removed individually; no global volume prune
was performed. The hosting checkout remains isolated from Claude's application
source.

## Cost correction

The documented model is illustrative and uses available account-wide free
allowances. At 512 MiB, one invocation/check, 60 seconds and two regions:

| Scenario (30 days) | Lambda + SQS estimate only |
|---|---:|
| 8 monitors, average billed duration 0.5 s, no retries | USD 1.83 |
| 25 monitors, average billed duration 0.5 s, no retries | USD 7.45 |
| 25 monitors, average billed duration 5 s, 10% retries | USD 80.01 |
| Previous 10 s scenario: 25 monitors, 10% retries | USD 159.22 |

The 5-second probe cap does not guarantee the fast-check estimate or cap total
Lambda billed duration; invocation overhead also counts.

Those totals exclude logs, storage, traffic, CloudFront, Cognito, VM, backups and
domain costs; they are not measured deployment bills. See the infrastructure
README for formulas and official sources. A USD1 budget is an alert, not a hard
cap. Create that initial alert before any application infrastructure deployment.
