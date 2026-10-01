# Demo hosting integration handoff

Base: merged application `main` at `4eea1eacdeea24acbf82c08884bdb1d3e85f11c6`.
Originally created from merged PR #2; rebased locally after phases 1–2 merged.
Branch: `codex/demo-hosting`. Changes are confined to `infra/aws-demo/` and
`deploy/demo/`; no application source, production infrastructure, root README,
or shared CI workflow was edited.

After rebase, the infrastructure feature is `29bfb58`; server deployment is
`c9a0e4c`, compatibility is `e9a74f4`, five-second timeout is `df6c487`, and restore
cleanup is `6337fa3`. This branch is ready for review and integration. It is not
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

**Resolved in the merged application at `4eea1ea`, with the annotation and
Spring-context regression test present.** The attribution-free fix was `8b9d6d6`
on PR #4; phases 1–2 ultimately reached main through PRs #3 and #5. All main CI
checks are green. The previously tested head `1513158` failed
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

Current application reference: main `4eea1eacdeea24acbf82c08884bdb1d3e85f11c6`.
The historical checks below tested `1513158` and a temporary constructor fix.
The hosting branch now includes merged main as its base, with no application
source modifications; final-main checks are recorded separately below.

1. Runtime JSON supplies `max-per-owner=3`, `min-interval-seconds=60`,
   `max-total=8`, `max-timeout-ms=5000` and `read-only-group=demo`. PR #4 now
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

## Final merged-main integration verification (2026-10-01)

- Application reference: `4eea1eacdeea24acbf82c08884bdb1d3e85f11c6` on main.
  Phase 1 merged via PR #3; Phase 2 reached main via PR #5 after PR #4 merged into
  its original base. Main's Java, dashboard and production Terraform CI passed.
- This local hosting branch was rebased onto that main commit without conflicts.
  The application directories exactly match main; the review diff contains only
  `infra/aws-demo/` and `deploy/demo/`. Commit messages have no attribution lines.
- Existing Dockerfile built a fresh ARM64 image from the merged application.
  Image `rcp-control-plane:demo-main-4eea1ea` records the source revision as a label.
- Eleven deployment-helper tests and one CloudFront routing test passed.
  Terraform fmt/init/validate and the fake-credential offline plan passed with
  50 resources and unchanged scope/IAM/region checks. Initialization reused the
  existing local provider binary rather than downloading a duplicate.
- Fresh-image `aws`-profile Compose smoke passed: demo issuer constructs through
  Spring, Flyway/readiness works, anonymous API returns 401, management routes
  remain private, expected CORS works, backup and isolated restore preserve the
  synthetic marker. Credentials are fake; no Cognito or AWS API was called.
- Fresh-image Phase 2 smoke passed: correct demo owner and two seeded monitors,
  read-only write/onboarding rejection, 60-second minimum/5,000-ms maximum limits,
  rejection at 5,001 ms, and one-time onboarding for an ordinary local account.
  Test projects and temporary database volumes were removed; the original six
  RCP containers and live database volume were retained.

Next: review, publish and merge the hosting branch with explicit publication
approval; provision the selected Oracle host, confirm the eight-monitor cap,
choose an API hostname and off-host backup destination; establish the AWS
account-wide USD1 alert before
application resources; then perform a separately authorized deployment and live
Cognito/probe/HTTPS verification. No cloud resources were created by these checks.

## Launch defaults (2026-10-01)

Oracle Always Free ARM is the selected host. Start with the two seeded monitors,
an eight-monitor global cap, and 256 MiB regional Java 21/ARM64 Lambda workers.
No backend source change is needed: the cap is passed in `server_application_json`.
The five-second check timeout and three-monitor owner quota remain configured.
Measure live Lambda peak memory, cold starts and deadline misses before deciding
whether 512 MiB is needed; CPU allocation also scales with Lambda memory.

The cost model now defaults to 256 MiB and accepts `--memory-mb` for comparisons.
With monthly allowances available, the Lambda/SQS subtotal is USD 0.58 for two
fast monitors or USD 1.83 for eight (0.5 s average billed duration, no retries).
Eight monitors averaging 5 s billed duration with 10% retries give USD 9.33 at
256 MiB. These exclude the additional services listed below and are not bill caps.
Record the AWS account signup date and set a month-five reminder to review the
Free plan expiry; continuing beyond six months requires a Paid plan upgrade.

Verification of these defaults: the 11 deployment tests and CloudFront routing
test pass; Terraform format/init/validate and the fake-credential, empty-state
plan pass with 50 resources, including two 256 MiB workers. The estimator reports
the subtotals above. After disk recovery and restarting Docker Desktop, the
Phase 2 container smoke passes using the existing image built from main at
`4eea1ea`: `/api/me` reports the eight-monitor cap; both demo monitors are seeded
under the correct subject; demo mutations/onboarding return 403; interval and
timeout restrictions, one-time onboarding, health, CORS and private management
routes pass. A backup marker survives the isolated restore. No image rebuild was
needed. Temporary smoke/restore volumes were removed, the volume inventory is
unchanged, and the original `rcp_rcp-postgres-data` database is healthy. Live AWS
validation of the 256 MiB workers is still pending.

## Historical cost correction (previous 512 MiB configuration)

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
