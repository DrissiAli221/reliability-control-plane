# RCP threat model (local reference and proposed AWS deployment)

Status: design review, 2026-09-27. This document describes the current checkout, not a security certification. The AWS infrastructure is declared in Terraform but has not been deployed or penetration-tested. The [implementation status](implementation-status.md) is the authority for what is locally implemented.

## Assets, actors, and trust boundaries

The principal assets are monitor ownership and target URLs, probe jobs/results, incident and availability history, PostgreSQL credentials/data, queue messages, and the integrity of the public status projection. A customer who can create a monitor is **not** trusted to choose an arbitrary network destination. A remote HTTP target is untrusted and may respond with hostile DNS, redirects, headers, or bodies. A queued job/result is not an authorization decision merely because it came from a queue.

```text
Browser/user --OIDC bearer token--> public ALB --> Spring control plane --> PostgreSQL
                       |                         |                source of truth
                       |                         +--> regional SQS job queues
                       |                                   |
                       |                            Lambda probe worker
                       |                                   | untrusted HTTP(S) target
                       |                                   v
                       +<-- public status read <-- central SQS result queue
```

The local profile substitutes a generated test JWT, ElasticMQ, and in-process workers; local region names are simulation labels. In AWS, regional Lambda workers have SQS job-read/result-write and logging/tracing permissions, not RDS access. The central ECS service retains database and queue authority. The public `/status/{slug}` projection is a deliberate anonymous boundary; monitor mutations and owner reports require a validated JWT and owner checks.

Review starting points: [target policy](../rcp-probe-core/src/main/java/dev/ali/rcp/monitors/SafeTargetPolicy.java), [connection-time DNS resolver](../rcp-probe-core/src/main/java/dev/ali/rcp/probes/ValidatedDnsResolver.java), [HTTP adapter](../rcp-probe-core/src/main/java/dev/ali/rcp/probes/ValidatedProbeHttpClient.java), [security rules](../rcp-control-plane/src/main/java/dev/ali/rcp/identity/SecurityConfiguration.java), [monitor ownership and quota](../rcp-control-plane/src/main/java/dev/ali/rcp/monitors/MonitorService.java), [regional worker IAM](../infra/aws/modules/probe_worker/main.tf), and [central network rules](../infra/aws/modules/central_network/main.tf).

## Abuse cases and present controls

| Abuse path | Present control/evidence | Residual risk and release gate |
| --- | --- | --- |
| SSRF to private/loopback/metadata services through a monitor URL or DNS rebinding | `SafeTargetPolicy` permits only HTTP(S) on default ports, rejects user-info/query/fragment, validates all resolved addresses at API acceptance and again in the worker's connection-time resolver. It uses a conservative [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry) special-purpose policy, including translation prefixes. Redirects, cookies, retries, and credential forwarding are disabled. Local tests cover an adversarial address corpus and rebinding at connection. | Application checks are not a network boundary. Regional Lambda egress isolation and denied-private/metadata-path tests do not exist. Do not accept arbitrary untrusted registrations in AWS until egress is constrained and verified; validate the actual socket peer and DNS/TLS timeout behavior in that environment. |
| Slow or oversized target consumes worker capacity | A total-request cancellation timer, connect/response timeouts, 64 KiB body cap, Lambda timeout and reserved concurrency are configured; a local slow-trickle test exists. | A blocked DNS resolver may outlive cancellation, and AWS runtime timing has not been measured. Bound concurrency and test DNS, TLS, first-byte, and body trickle cases in the deployed worker. |
| Fake/duplicate/out-of-order queue results corrupt incidents | PostgreSQL is source of truth; jobs, results, and processed messages have durable uniqueness. Composite foreign keys bind a result to its job/region and execution snapshot (monitor, scheduled time, behavior version); rejected inserts roll back the processed-message marker. Incident evaluation uses scheduled time and explicit transitions. Standard SQS duplicates are expected. | IAM limits publishers but the message is not cryptographically authenticated end-to-end. A publisher with result-queue access and knowledge of valid job fields remains trusted to report probe facts. Test real-SQS retries and redrive before production. |
| Queue or control-plane outage silently loses scheduled work | Scheduler writes jobs and outbox intent in one PostgreSQL transaction; publisher retries; DLQs retain exhausted messages; metrics expose pending/failed outbox and pending executions. | The outbox can publish duplicates; DLQ handling is not an automated recovery workflow. Alert on backlog age and drill reviewed redrive with idempotency proof. |
| User reads or changes another owner's monitors/reports/status configuration | Spring validates JWTs; owner-scoped repository/service queries and 404-style non-disclosure are tested for monitor mutations and reports. Check traces and incident state are owner-only, and a trace is looked up by monitor *and* execution so an owned monitor cannot reach another monitor's execution (tested). The pipeline snapshot counts only the caller's monitors, so it does not reveal other tenants' volume; traces do show the owner their own outbox publish errors. CORS is restricted to configured origins. | Authentication is not rate limiting. Review every future endpoint for object ownership, tenant isolation, and response leakage. Local generated JWTs must never be enabled in AWS. |
| Legitimate account abuses probe volume or uses many accounts to target one host | A configurable 25-registered-monitor cap per owner, including paused monitors, is enforced under a PostgreSQL transaction lock. Minimum interval is 30 seconds. | No per-subject request-rate limit, per-target/domain aggregate cap, signup-abuse protection, or cost/egress budget exists. The quota is a local reference guardrail, not DDoS prevention. |
| Public status page discloses private state or displays false green | Only an explicit published projection is public; anonymous API disables caching; unresolved open incidents outrank stale/paused evidence and stale data is not shown as healthy. The projection adds 45 days of daily verdict counts and a measured uptime per component, computed in one batched query; it still omits monitor IDs and target URLs (tested). | Slugs are public identifiers, not secrets. Review projection fields and metadata for leakage; exercise CDN/browser caching and stale-while-failed behavior in AWS. |
| Compromised control-plane task or database credential gains excessive database authority | RDS is private and security-group limited to ECS tasks; Secrets Manager injects a managed credential; storage encryption and backups are declared. | The current ECS runtime uses the RDS master credential. Create least-privilege application/migration roles and an audited rotation/recovery design before durable deployment. Terraform state and CI artifacts also require protected storage/access. |
| A region or the central database fails while probes elsewhere still run | Regional workers are independent, while the central control plane and RDS remain single-region in the design. | Geographic probes are not multi-region HA. Set explicit RPO/RTO, database failover/restore, queue routing and replay behavior, and recovery drills before making an HA claim. |

## Security invariants to keep testing

- A blocked URL, redirect, DNS answer, or socket peer cannot reach private, reserved, loopback, link-local, or cloud metadata addresses; an `UNSAFE_TARGET` fact must not count as target downtime.
- Only the monitor owner may mutate it or obtain private reports. An anonymous caller may read only the explicit public status projection and the narrow health endpoints.
- One logical job cannot create two logical results; duplicate or older evidence cannot duplicate an incident event or reverse its timeline.
- Failed SQS publication cannot erase a committed outbox event. A recovered publisher may send it more than once without changing the logical outcome.
- Pausing/resuming does not make old evidence look fresh; an open incident remains unresolved until fresh recovery evidence satisfies policy.
- Secret values, complete target URLs, JWTs, and private queue payloads must not be copied into public logs, traces, issues, or reports.

## Before any AWS/public deployment

1. Obtain Ali's explicit authorization and a cost/budget boundary; this document authorizes no AWS changes.
2. Design and test regional egress restrictions with explicit private/metadata deny probes, including DNS rebinding, IPv4/IPv6 literals, alternate encodings, redirects, and TLS/SNI behavior.
3. Replace master-login runtime DB use with least-privilege roles; protect Terraform state, secrets, image artifacts, and access paths.
4. Add request/target rate controls, audit events, alerting, and a reviewed DLQ redrive procedure; exercise overload and poison messages.
5. Run real-SQS/Lambda/Cognito/ALB/RDS smoke and failure tests; verify JWT issuer, access-token `token_use`, expected `client_id`, owner isolation, readiness, queue routing, observability, backups and restore. Keep local tests and emulation evidence distinct from AWS proof.
