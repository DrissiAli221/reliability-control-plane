# RCP accepted architecture decisions

These records promote the candidates in [the architecture plan](architecture-decisions.md#13-adr-backlog) into decisions for the **local reference implementation**. “Accepted” describes the design choice, not proof that its AWS deployment or production safeguards exist. [Implementation status](implementation-status.md) remains the evidence ledger. Reopen a decision when its listed trigger occurs; do not silently add another platform component.

## ADR-001 — Java runtime and distribution

- **Status:** Accepted, local proof.
- **Context/decision:** Use Java 21 on a permissive OpenJDK distribution such as Eclipse Temurin. It aligns with intended Java/Spring backend roles and gives a stable LTS baseline. Maven compilation targets 21.
- **Alternatives:** Java 25 can be a compatibility experiment but is not the baseline; Java 17 would miss the chosen target baseline.
- **Consequences/proof:** Developers and CI need a Java 21 JDK. The Maven reactor passes with Temurin 21; Dockerfiles use Temurin 21 images. Revisit when target-role requirements or dependency support justify a newer LTS and both builds and runtime probes pass.

## ADR-002 — Spring Boot baseline

- **Status:** Accepted, local proof.
- **Context/decision:** Use Spring Boot 4.1 with the compatible Spring Modulith line declared in Maven, rather than a speculative downgrade to Boot 3.5.
- **Alternatives:** Boot 3.5 is a documented fallback only for a reproduced required-dependency incompatibility.
- **Consequences/proof:** The current reactor verifies under Boot 4.1 and `ModularityTest` checks module boundaries. Reopen with a named dependency, failing reproduction, and a verified 3.5 build—not a general concern that newer versions may be risky.

## ADR-003 — Modular monolith

- **Status:** Accepted, local proof.
- **Context/decision:** Keep one Spring control-plane deployable with explicit `identity`, `monitors`, `scheduling`, `probes`, `incidents`, `availability`, `statuspage`, and reporting responsibilities. Spring Modulith checks the package boundaries.
- **Alternatives:** Separate control-plane microservices would introduce network contracts, distributed transactions, independent operations, and harder debugging without a proven scaling or ownership need.
- **Consequences/proof:** Modules share one database transaction boundary but must avoid accidental cross-module coupling; `ModularityTest` verifies the current structure. Extract a module only when measured scaling, deployment cadence, data ownership, or team ownership requires it.

## ADR-004 — PostgreSQL source of truth and persistence split

- **Status:** Accepted, local proof; AWS RDS unverified.
- **Context/decision:** PostgreSQL owns monitors, execution snapshots, results, incident events, idempotency, and outbox state. Flyway versions schemas. JPA handles ordinary monitor aggregates; handwritten SQL/JDBC handles locking, claims, reports, and concurrency-sensitive queries.
- **Alternatives:** Pure JPA obscures key locking behavior; pure JDBC adds ceremony to simple aggregates; DynamoDB changes the consistency/query model; Aurora, TimescaleDB, and ClickHouse lack a demonstrated need at reference scale. jOOQ is a later option if handwritten SQL volume becomes hard to maintain.
- **Consequences/proof:** Relational constraints and Testcontainers PostgreSQL tests backstop queue duplicates and execution identity. RDS remains only a Terraform design. Reconsider specialized stores after measured query volume, retention cost, or access patterns exceed PostgreSQL's practical envelope.

## ADR-005 — Database due scheduler

- **Status:** Accepted, local proof.
- **Context/decision:** `next_check_at` in PostgreSQL defines due work. Short transactions claim with `FOR UPDATE SKIP LOCKED`, advance schedules using database time, and rely on uniqueness to reject duplicate logical executions.
- **Alternatives:** EventBridge Scheduler is a valid managed choice at larger product scale; Quartz adds its own coordination model. Both reduce the transaction/concurrency learning value and local portability of this reference.
- **Consequences/proof:** `DueMonitorScheduler`, `SchedulingRepository`, and `SchedulingConcurrencyTest` cover the claim boundary and catch-up policy. Reconsider EventBridge when schedule count or database claim pressure is measured as a bottleneck, after defining migration and missed-fire semantics.

## ADR-006 — Transactional outbox

- **Status:** Accepted, local proof.
- **Context/decision:** Write a queue-publication intent in the same PostgreSQL transaction that creates a regional job. A separate leased publisher retries transport. This closes the database-committed/SQS-not-published loss window.
- **Alternatives:** Direct database-plus-SQS dual writes lose work on a crash between the two. Change-data capture is possible later but adds operational machinery now.
- **Consequences/proof:** Publication can duplicate after a send-before-ack crash, so consumers retain durable idempotency. `OutboxPublisherTest` and integration tests exercise retry and failure windows. Revisit relay/CDC design if backlog age, throughput, or operational complexity is measured to exceed this simple relay.

## ADR-007 — Standard SQS transport and topology

- **Status:** Accepted for AWS architecture; local SQS-shaped proof via ElasticMQ only.
- **Context/decision:** One Standard job queue and DLQ per actual worker region, plus a central Standard result queue and DLQ. IDs, database constraints, visibility timeouts, bounded retries, partial Lambda batch responses, and poison-message handling address at-least-once, duplicate, and out-of-order delivery.
- **Alternatives:** FIFO's ordering/deduplication scope is insufficient to replace domain idempotency; RabbitMQ adds broker operations; Kafka is disproportionate without replay/streaming needs.
- **Consequences/proof:** ElasticMQ tests exercise adapter contracts; real SQS semantics, IAM, regional routing, and redrive are unverified. Reconsider FIFO or a log only if a concrete ordered/replayable workflow emerges with quantified throughput and operations tradeoffs.

## ADR-008 — Lambda probe workers and ECS control plane

- **Status:** Accepted design; local core/adapters verified, AWS execution unverified.
- **Context/decision:** Probes are short, stateless, and event-driven, so use regional Lambda workers around a pure `ProbeEngine`; the long-running scheduler/result/incident control plane belongs on ECS Fargate behind an ALB.
- **Alternatives:** Long-running ECS probe workers add idle cost and scaling operations; EKS/EC2 add platform administration; App Runner is less explicit for this network/worker split.
- **Consequences/proof:** The Java Lambda adapter and local worker share the core and compile/test locally. Real Lambda deadlines, concurrency, cold starts, egress, and partial-batch behavior still need AWS smoke evidence. Late-result correction remains a documented product-policy gap, not a solved Lambda property. Revisit compute when probe duration, concurrency, network controls, or cost measurements change.

## ADR-009 — Central-region authority boundary

- **Status:** Accepted architectural limitation.
- **Context/decision:** Regional workers diversify **observations**, not the authority plane. PostgreSQL and incident decisions remain central in one region.
- **Alternatives:** Calling the system multi-region HA would be inaccurate; active-active control planes require replicated/failover data, queue/routing strategy, conflict resolution, and recovery proof.
- **Consequences/proof:** Terraform shows the single-region central stack, while local labels simulate regions. Set RPO/RTO and run regional failover tests before claiming control-plane HA. Reopen only with an explicit availability target and funded replication/operational plan.

## ADR-010 — OIDC operator identity

- **Status:** Accepted; local JWT tests verified, Cognito flow unverified.
- **Context/decision:** AWS dashboard uses Cognito authorization code with S256 PKCE; the Spring API validates issuer/signature/expiry and Cognito access-token audience/use. Resource ownership is checked at service/query boundaries. Local development uses a generated ephemeral JWT issuer.
- **Alternatives:** Custom passwords and JWT minting create avoidable security ownership; Keycloak is a legitimate self-hosted identity platform but adds operations not needed for this AWS-bound reference.
- **Consequences/proof:** Local resource-server and owner-isolation tests pass. Cognito callback, browser flow, token exchange, and user lifecycle require authorized AWS verification. Reconsider provider only for concrete federation/portability requirements.

## ADR-011 — SSRF and abuse boundary

- **Status:** Accepted application policy; public hostile-user exposure is **not** accepted.
- **Context/decision:** `SafeTargetPolicy` allows constrained HTTP(S) only; rejects credentials, queries, fragments, non-default ports, special/private IPv4/IPv6 destinations, and unsafe DNS. The worker revalidates DNS at connection time, disables redirects, bounds response bodies and total request time, and sends no user credentials.
- **Alternatives:** Registration-only URL validation is bypassable after DNS changes; allowing arbitrary redirects/ports/headers dramatically widens attack surface.
- **Consequences/proof:** Adversarial address and rebinding tests give application-level evidence. Network egress isolation, peer/timing proof, rate limits, target authorization, and audit controls remain gates before public untrusted registration. Reopen restrictions only with a threat-model update and both application and network deny tests.

## ADR-012 — Vendor-neutral observability

- **Status:** Accepted, local pipeline observed; AWS backend unverified.
- **Context/decision:** Actuator/Micrometer expose health and business counters/gauges; OpenTelemetry Java agent and Collector carry traces. Local Prometheus/Grafana/Tempo observe the pipeline; CloudWatch/X-Ray is the AWS destination design.
- **Alternatives:** AWS-only instrumentation would weaken local portability and vendor independence; log-only monitoring would hide backlogs and stale processing.
- **Consequences/proof:** The 2026-09-29 local run showed Prometheus scrape `up`, Tempo search traces, and nonzero scheduling/result deltas during k6. IDs belong in controlled logs/traces, not high-cardinality metric labels. Revisit if telemetry overhead or cost is measured to violate the reliability budget.

## ADR-013 — Terraform infrastructure and state

- **Status:** Accepted infrastructure-as-code choice; no apply performed.
- **Context/decision:** Terraform describes reviewed central/regional AWS resources and provider aliases. State, plans, and secrets require an encrypted locked remote backend and restricted access before an authorized apply.
- **Alternatives:** CDK/CloudFormation can model AWS well but are less transparent for this cross-service declarative learning goal; manual console changes are not reproducible.
- **Consequences/proof:** Offline format, validation, and fake-credential plan pass. That proves graph construction, not AWS permissions or operability. Revisit tool choice if organizational standards or genuinely unsupported resources require it; never promote the offline plan to apply without state/budget/domain/teardown review.

## ADR-014 — Local SQS emulation

- **Status:** Accepted for local tests, explicitly not AWS parity.
- **Context/decision:** ElasticMQ supplies the narrow free SQS-compatible contract needed by Compose and integration tests. At the project's validation point, the relevant LocalStack/Testcontainers setup required a `LOCALSTACK_AUTH_TOKEN`; recheck that condition before changing emulators.
- **Alternatives:** LocalStack is broader but adds auth/setup not justified by the narrow queue need; mocks alone miss adapter serialization and receive/delete behavior.
- **Consequences/proof:** ElasticMQ integration tests pass locally. An explicitly authorized real-SQS smoke test is still required before claiming AWS queue behavior. Reconsider emulation when another AWS API must be tested locally and its license, auth, and parity tradeoffs are reviewed.
