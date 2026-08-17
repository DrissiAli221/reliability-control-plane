# Reliability Control Plane: validated architecture and decision plan

**Document status:** Proposed baseline for Ali's review<br>
**Validation date:** 2026-08-14<br>
**Implementation status:** Planning only<br>
**Project:** RCP (Reliability Control Plane)

## 1. Review scope and truth boundary

This document is the self-contained plan for the first RCP implementation. It records the product boundary, architecture, correctness model, security controls, technology choices, test evidence, three-day build order, and ADR backlog.

At the start of this assignment, <code>/Users/rini/Projects/RCP</code> was empty and was not a Git repository. This document is the only project artifact created by the assignment. No application code, infrastructure code, cloud resource, account, Git repository, remote, commit, or deployment is asserted to exist. No AWS operation was attempted.

The words “chosen” and “will” below describe the review baseline, not completed implementation. Any future AWS deployment or destructive exercise requires separate explicit authorization.

## 2. Product and learning goal

RCP will be an uptime and reliability control plane that:

- accepts authenticated users' HTTP(S) monitor definitions;
- schedules checks at defined intervals;
- dispatches probes to workers in actual geographic AWS regions;
- records regional probe facts;
- handles duplicates, retries, late and out-of-order results;
- deterministically opens and resolves incidents from a versioned policy;
- calculates measured availability separately from configured SLO targets;
- generates evidence-backed reliability reports for an authorized monitor and explicit time window;
- exposes a thin operator dashboard and an explicitly published public status page; and
- makes its own health, queue lag, scheduler lag, incident decisions, and telemetry observable.

This is both a serious portfolio system and an aggressive learning project. The three-day target is a sophisticated, tested reference implementation and a defensible concept map. It is not a claim of production scale, battle-tested operations, independent mastery, or a globally highly available service.

There should be no intellectual holding back: transactions, locks, leases, at-least-once delivery, idempotency, state machines, telemetry, threat modeling, infrastructure as code, load, failure injection, and recovery will be confronted directly. Scope must still remain coherent. Every component must solve a concrete problem in this system, produce testable evidence, and be removable if its problem does not exist.

### Success criteria for the reference implementation

The sprint is successful when the repository can demonstrate, locally and repeatably:

- authenticated ownership enforcement for monitor mutations;
- a safe monitor-target boundary with adversarial SSRF tests;
- concurrent database scheduling without duplicate logical executions;
- committed work surviving a failed queue publication;
- at-least-once queue processing without duplicate logical results or incident events;
- deterministic incident transitions under duplicate, late, missing, disagreeing, and out-of-order evidence;
- explicit availability and evidence-coverage calculations;
- deterministic report output whose availability, coverage, incidents, latency summaries, policy/calculation versions, and source window reconcile with stored facts;
- useful metrics, traces, structured logs, and dashboards;
- failure injection, load evidence, and a restore exercise;
- valid Terraform configuration and a reviewable plan without an apply; and
- documentation that separates measured proof from intended production behavior.

### 2.1 Decision review: is one large AI-assisted flagship project a good preparation plan?

**Yes, if it is treated as a high-density practice environment and evidence generator—not as a substitute for retained skill.**

A single coherent flagship project is unusually useful because the same business flow forces many concepts to meet: HTTP/API design, authentication, relational modeling, transactions, concurrency, messaging, retries, state machines, observability, security, infrastructure, failure recovery, and explanation. The concepts stop being disconnected tutorial fragments. Ali can point to one target-monitoring story and explain why each part exists.

AI assistance makes it possible to traverse that surface area quickly. It can accelerate architecture comparison, scaffolding, test-case generation, documentation, and diagnosis. That makes the reference implementation wider and more sophisticated than a three-day unaided build would likely be. The honest label is **AI-accelerated reference implementation**.

That label is not the same as **independently retained mastery**. Mastery requires Ali to be able to:

1. explain a mechanism without the repository or an AI answer open;
2. predict a failure before running the test;
3. reproduce a thin version from a blank workspace;
4. diagnose a deliberately broken version from evidence;
5. change a design when constraints change; and
6. defend trade-offs, limits, and rejected alternatives.

The preparation loop is therefore:

~~~mermaid
flowchart LR
    wide["Build wide with AI<br/>one coherent vertical system"]
    evidence["Attach proof<br/>tests, metrics, traces, failures"]
    explain["Explain from memory<br/>why and what fails"]
    rebuild["Rebuild critical slices<br/>without generated first attempt"]
    breakit["Break and diagnose<br/>duplicates, locks, SSRF, overload"]
    adapt["Change constraints<br/>redesign and defend"]

    wide --> evidence --> explain --> rebuild --> breakit --> adapt
    adapt --> explain
~~~

One flagship should not become the only preparation. After the wide build, deepen the highest-value slices—scheduler/outbox/idempotency, incident ordering, SSRF, database query behavior, and telemetry diagnosis—through small clean-room exercises and spaced retrieval. The project gives those exercises context.

### 2.2 Decision review: can the plan be done in three days?

**A coherent, sophisticated reference can be built in three intense days; production proof and durable mastery cannot.**

Three days can realistically produce:

- a complete concept map and reviewed architecture;
- a thin but connected backend vertical slice;
- real PostgreSQL migrations, constraints, locks, and concurrency tests;
- an outbox and at-least-once/idempotency experiments;
- a pure probe engine and Lambda-shaped adapter;
- deterministic incident/state-machine tests;
- an adversarial SafeTargetPolicy test suite;
- local queue, target, and telemetry integration;
- focused failure injection and a small k6 experiment;
- a local restore exercise;
- Terraform configuration that validates and produces a reviewable plan; and
- minimal UI proof after the backend flow works.

Three days cannot establish:

- production operation over time;
- a representative real-user workload;
- production or Internet scale;
- complete security or the absence of SSRF bypasses;
- mature on-call, recovery, or change-management practice;
- tested multi-region control-plane failover;
- stable cost/performance conclusions;
- a security review or compliance posture; or
- independent mastery of every concept touched.

The working strategy is **build wide and aggressively, deepen later**. It does not hide advanced topics to make the deadline look easy. By the end of a future sprint, every advanced topic must be in one of three explicit states: implemented with evidence, represented by a bounded experiment, or marked planned/unproven. Breadth comes from one end-to-end flow; depth comes later from retrieval, clean-room rebuilds, diagnosis, and redesign.

The deadline is a prioritization tool, not a reason to mislabel evidence. If a component has no passing proof by the end, the document should say “designed” or “experimented with,” not “implemented and reliable.”

## 3. Validated reference architecture

### 3.1 Architecture at a glance

~~~mermaid
flowchart LR
    operator["Operator browser"]
    publicuser["Public status viewer"]
    cloudfront["CloudFront"]
    s3["S3 static React/Vite site"]
    cognito["Cognito OIDC<br/>authorization code + PKCE"]
    alb["Application Load Balancer"]
    control["Java 21 / Spring Boot 4.1<br/>Spring Modulith control plane<br/>ECS Fargate, central region"]
    rds[("RDS PostgreSQL<br/>source of truth")]
    outbox["Outbox publisher"]
    joba["Standard SQS job queue<br/>probe region A + DLQ"]
    jobb["Standard SQS job queue<br/>probe region B + DLQ"]
    lambdaa["Java Lambda probe worker<br/>region A"]
    lambdab["Java Lambda probe worker<br/>region B"]
    target["Monitored public HTTP(S) target"]
    results["Central Standard SQS<br/>probe-results + DLQ"]
    telemetry["OpenTelemetry Collector<br/>metrics, traces, logs"]
    awsobs["CloudWatch / X-Ray"]

    operator --> cloudfront
    publicuser --> cloudfront
    cloudfront --> s3
    operator <--> cognito
    operator -->|"Bearer access token"| alb
    publicuser -->|"Anonymous published-status REST"| alb
    alb --> control
    control <--> rds
    control --> outbox
    outbox --> joba
    outbox --> jobb
    joba --> lambdaa
    jobb --> lambdab
    lambdaa --> target
    lambdab --> target
    lambdaa --> results
    lambdab --> results
    results --> control
    control --> telemetry
    lambdaa --> telemetry
    lambdab --> telemetry
    telemetry --> awsobs
~~~

### 3.2 Component choices and responsibilities

| Concern | Chosen component | Responsibility and boundary |
| --- | --- | --- |
| Operator and public UI | React, TypeScript, Vite; static assets in S3 behind CloudFront | Thin client for monitor management, incident history, availability, and explicitly published status. It does not own business rules. |
| Central API/control plane | Java 21, Spring Boot 4.1, Maven, Spring Modulith on ECS Fargate behind an ALB | Owns identity mapping, monitors, scheduling, outbox publication, result consumption, incidents, availability, status publication, REST/OpenAPI, and business telemetry. |
| Source of truth | Amazon RDS for PostgreSQL with Flyway | Owns all durable monitor, job, result, incident, outbox, idempotency, and audit state. |
| Ordinary persistence | JPA | Aggregate-oriented CRUD where ORM behavior is clear and concurrency is not hidden. |
| Concurrency/reporting persistence | Handwritten SQL through Spring JDBC | Due-work claiming, row locks, leases, outbox claiming, idempotent inserts, reporting, rollups, and deliberate concurrency experiments. |
| Due scheduler | Database-driven <code>next_check_at</code> scheduler | Selects due monitors in bounded batches with short transactions and <code>FOR UPDATE SKIP LOCKED</code>; creates durable work and advances schedules. |
| Reliable publication | Transactional outbox in PostgreSQL | Commits domain/scheduling changes and publication intent atomically; asynchronously publishes and tolerates duplicate sends. |
| Regional job transport | One Standard SQS probe-job queue per actual AWS probe region, each with a same-region DLQ | Routes jobs to the intended geographic region and exposes independent backlog/failure evidence. |
| Regional execution | Stateless Java Lambda in each probe region | Executes short, bounded, event-driven public HTTP(S) probes. It has no incident authority and no database access. |
| Probe core | Pure Java <code>ProbeEngine</code> | Contains URL safety enforcement, DNS/IP validation contract, HTTP execution limits, and fact classification; used by local/container and Lambda adapters. |
| Results transport | One central-region Standard SQS probe-results queue with a same-region DLQ | Carries immutable worker facts back to the central control plane. Regional workers explicitly send to this queue's region. |
| Result/incident processing | Modules inside the Spring control plane | Persists facts idempotently, orders evidence by scheduled time, derives global evaluations, and advances the incident state machine. |
| AWS identity | Cognito/OIDC authorization-code flow with PKCE | Authenticates browser users without a browser client secret. |
| API authorization | Spring Security OAuth2 resource-server JWT validation | Validates signature, issuer, audience, expiry, and scopes; maps trusted <code>issuer + subject</code> to a local subject. |
| Local identity | Generated test JWTs and mock JWKS | Tests the same resource-server validation path without requiring a full local identity provider. A real local IdP is added only if interactive identity flows become a learning goal. |
| Application observability | Spring Boot Actuator, Micrometer business metrics, structured logs, OpenTelemetry Java agent and Collector | Exposes health and operational evidence and exports vendor-neutral telemetry. |
| Local telemetry | Prometheus, Grafana, Tempo | Stores and visualizes local metrics/traces. Logs remain structured stdout initially unless a local log backend is justified. |
| AWS telemetry | CloudWatch and X-Ray through the collector/agent path | Receives AWS-side logs, metrics, alarms, and traces without making application instrumentation AWS-only. |
| Infrastructure | Terraform | Declares AWS infrastructure; validation and plan are part of the sprint, apply is not implicitly authorized. |
| Local environment | Docker Compose | Runs PostgreSQL, ElasticMQ, observability services, and supporting test fixtures repeatably. |
| Local SQS substitute | ElasticMQ | Free, SQS-compatible default for local integration. It is not treated as proof of AWS behavior. |

### 3.3 Regional and central boundaries

The control plane, result processor, source-of-truth PostgreSQL database, central results queue, and operator API are designed to remain in one AWS region. Probe job queues and Lambda workers will exist only in regions that a future explicitly authorized apply actually provisions; a local process labelled with a city or region is not geographic evidence.

For each enabled probe region:

1. The central scheduler creates one durable regional <code>probe_job</code> and one outbox event for the target regional queue.
2. The outbox publisher uses an AWS SDK SQS client configured for that queue's actual region.
3. The regional Lambda receives only its regional queue.
4. The worker probes the public target and sends an immutable result envelope to the central results queue using a client configured for the central region.
5. The central consumer persists and evaluates the result.

Workers will not connect to RDS, call private control-plane endpoints, or share a writable cache. Their only durable output is the result message. This keeps the geographic execution plane disposable and the decision plane authoritative.

### 3.4 Architecture honesty

Geographically distributed probe workers improve observation diversity; they do not make the whole RCP system multi-region highly available. The control plane and database remain central and single-region. A regional control-plane or database outage can stop scheduling, processing, API access, and status updates even if some probe Lambdas still exist.

RDS Multi-AZ, if selected for a later AWS environment, is intra-region resilience and must not be described as multi-region HA. True multi-region control-plane HA requires, before implementation:

- explicit recovery point objective (RPO) and recovery time objective (RTO);
- a tested replicated or failover database strategy;
- regional ingress, job, result, and routing ownership;
- a decision about active/passive versus active/active processing;
- leader election or conflict-free ownership for scheduling;
- duplicate and conflict handling across regions;
- status-page behavior during partition or failover;
- secrets, identity, and telemetry continuity; and
- regular failover and recovery tests proving the design.

### 3.5 What the project does, step by step

The easiest way to understand RCP is to follow one monitor, for example a user who wants to check <code>https://example.com/health</code> every minute from two real AWS regions.

~~~mermaid
sequenceDiagram
    actor Ali as Operator
    participant UI as React dashboard
    participant C as MonitorController
    participant S as MonitorService
    participant R as MonitorRepository
    participant DB as PostgreSQL
    participant Sch as Due scheduler
    participant O as Outbox publisher
    participant JQ as Regional job SQS
    participant W as Regional Lambda worker
    participant T as Target
    participant RQ as Central result SQS
    participant P as Result processor
    participant I as Incident engine
    participant Read as Availability/status reads

    Ali->>UI: Sign in and create monitor
    UI->>C: POST monitor + access token
    C->>S: Validated command + trusted subject
    S->>S: Ownership, limits, SafeTargetPolicy
    S->>R: Save aggregate/version
    R->>DB: INSERT monitor and next_check_at
    Sch->>DB: Claim due monitor with SKIP LOCKED
    Sch->>DB: Create execution, regional jobs, outbox; advance due time
    O->>DB: Lease unpublished outbox rows
    O->>JQ: Send job to each actual region
    JQ->>W: At-least-once batch delivery
    W->>W: Revalidate target and enforce limits
    W->>T: Bounded HTTP(S) request
    T-->>W: Status/timing or failure
    W->>RQ: Immutable regional fact
    RQ->>P: Duplicate/out-of-order possible
    P->>DB: Idempotent result transaction
    P->>I: Finalized execution evidence
    I->>DB: Deterministic incident transition/events
    Read->>DB: Availability, coverage, incidents
    UI->>Read: Operator/public read requests
~~~

#### Step 1 — creation enters through Controller → Service → Repository → PostgreSQL

The React dashboard authenticates with Cognito in AWS, receives an access token through authorization code + PKCE, and sends a monitor request to the REST API.

The <code>MonitorController</code> is the HTTP adapter. It parses the request, applies syntax/size validation, obtains the trusted subject from Spring Security, and calls an application use case. It does not decide SQL, incident policy, or target safety on its own.

The <code>MonitorService</code> is the use-case coordinator. It enforces ownership, account limits, interval/region/timeout policy, and <code>SafeTargetPolicy</code>; creates the monitor aggregate and immutable behavior version; and asks a repository port to persist it. A controller cannot supply an arbitrary owner ID.

The <code>MonitorRepository</code> maps the domain operation to persistence. JPA is appropriate for this ordinary aggregate write. PostgreSQL enforces the durable uniqueness, ownership reference, check constraints, and initial <code>next_check_at</code>. Flyway—not ORM auto-DDL—defines the schema.

The response returns the monitor representation and identifiers only after the database transaction commits.

#### Step 2 — the database scheduler turns due time into durable regional work

At the due time, any running control-plane scheduler replica can look for work. It claims a bounded ordered batch with <code>FOR UPDATE SKIP LOCKED</code>. Inside one short transaction it creates a logical execution, one job for each configured actual region, matching outbox events, and the next due time. Unique constraints are the final defense if two schedulers race.

Nothing has been sent to SQS yet. The database now contains the complete committed intention. That separation is what lets a queue outage occur without losing the monitor execution.

#### Step 3 — the outbox publishes to regional queues

An outbox publisher leases committed unpublished rows. Each row identifies the destination AWS region and job queue. The publisher sends outside the database transaction, then conditionally marks success. A crash after send but before marking success can publish twice; this is expected and downstream code is idempotent.

Locally the same port targets ElasticMQ. In AWS it targets one real Standard SQS queue in each probe region, each with a DLQ. Local queue names do not pretend to create geographic measurement.

#### Step 4 — a regional worker performs one bounded probe

Lambda's SQS event-source mapping delivers the job at least once. The regional adapter validates schema/deadline and invokes the pure Java <code>ProbeEngine</code>.

The engine reapplies <code>SafeTargetPolicy</code>, resolves every IPv4/IPv6 answer, pins the connection to a validated public address, verifies TLS, applies time/body/content/method limits, and performs a safe HTTP(S) request. It records facts such as timestamps, region, status, latency, byte count, and stable error category. It does not decide that the target is globally down.

The Lambda sends that immutable fact to the central result queue. If send fails, it returns failure for that SQS item and the job can run again. Partial batch response prevents unrelated successes from being retried.

#### Step 5 — central ingestion turns delivery into one logical fact

The result queue can deliver duplicates and can reorder regions. The result consumer validates the message, inserts a durable consumer-message idempotency record, inserts the unique job result, and applies any resulting domain effects in one PostgreSQL transaction.

A crash before commit causes a retry. A crash after commit but before SQS acknowledgement also causes a retry, but the uniqueness records make it a no-op. A second message ID for the same job is still stopped by job-result uniqueness. A conflicting payload is quarantined as evidence rather than overwriting the accepted fact.

#### Step 6 — the incident engine evaluates time-ordered regional evidence

The result processor groups facts under the scheduled execution and waits until quorum or the explicit result deadline. It finalizes <code>UP</code>, <code>DOWN</code>, <code>DISAGREEMENT</code>, or <code>NO_DATA</code> using the policy version attached to that execution.

Finalized executions enter the incident state machine in <code>scheduled_at</code> order. The initial policy opens on two consecutive quorum-DOWN executions and resolves on two consecutive quorum-UP executions. Disagreement is visible and cannot silently resolve an incident. Unique transition keys prevent duplicate incident events.

#### Step 7 — read models power the operator dashboard and public status page

The operator API reads monitor state, regional evidence, incidents, queue/scheduler health, measured availability, SLO target, and evidence coverage. The frontend remains thin: it renders server-owned truth and does not recompute incident logic in TypeScript.

A status page is anonymous only for an explicitly published projection. Private monitor configuration and owner details never leak into that projection. CloudFront serves the same static React application or a dedicated public route; REST supplies the current data.

#### Step 8 — availability is calculated without confusing objective and measurement

Each scheduled execution is one SLI opportunity, regardless of the number of regions. Quorum <code>UP</code> is good; quorum <code>DOWN</code> is bad. <code>DISAGREEMENT</code> and <code>NO_DATA</code> reduce evidence coverage and cannot make the SLO appear to pass when coverage is below threshold. The SLO target remains a configuration, not measured uptime.

#### Step 9 — reports package verified evidence, not invented conclusions

An owner can request a reliability report for an explicit monitor and time window. The reporting module reads published monitor, incident, and availability projections and produces a versioned report model containing the measurement window, measured availability, SLO target/result, evidence coverage, error-budget consumption, regional disagreement/missing-data summary, latency percentiles when sample coverage is sufficient, and an incident timeline. Every report includes its generation time, calculation/policy version, and source-data watermark so later corrections are explainable.

The first implementation returns deterministic JSON and HTML from the same report model. PDF is a final rendering adapter, not a second calculation path. A PDF must display insufficient evidence and missing checks explicitly and must never turn absent data into uptime. Manual owner-authorized generation comes first; scheduled delivery/email is deferred until report correctness, authorization, storage, retention, and notification abuse controls are proven.

#### Step 10 — RCP monitors the monitoring system

Actuator, Micrometer, structured logs, and OpenTelemetry expose API latency, scheduler lag, outbox age, queue age/depth, duplicates, result lateness, probe outcomes, incident decision delay, database pressure, DLQ depth, and telemetry-export failure. These signals distinguish “target failed” from “RCP failed to observe the target.”

Dashboards and alarms are part of correctness evidence: a reliability control plane that cannot explain its own missing checks is not trustworthy.

## 4. Local reference environment

Docker Compose will provide:

- PostgreSQL for application state;
- ElasticMQ with the same logical job queues, result queue, and DLQs used by adapters;
- the OpenTelemetry Collector;
- Prometheus;
- Grafana;
- Tempo; and
- optional WireMock fixtures for deterministic target behavior and mock JWKS.

The control plane and local probe adapter may run from Maven during development or as containers when container behavior is under test. Queue endpoint URLs, credentials, and regions are configuration, never business logic.

ElasticMQ is the default because the current Testcontainers LocalStack documentation states that the <code>localstack/localstack</code> image requires <code>LOCALSTACK_AUTH_TOKEN</code> from 2026-03-23. RCP should not require a commercial/login token for its default local learning loop. ElasticMQ implements a subset of SQS and cannot prove AWS IAM, cross-region endpoints, Lambda event-source mapping, quotas, service redrive behavior, or all timing semantics. After local correctness is stable, add a small, separately authorized real-SQS smoke test that creates uniquely named temporary queues, exercises send/receive/visibility/redrive behavior, and removes them.

Testcontainers PostgreSQL remains required for database integration and concurrency tests. ElasticMQ can run under Testcontainers or Compose. No test should silently fall back to a developer's AWS credentials.

### 4.1 Local-to-AWS responsibility mapping

Local-first and AWS are two adapters/environments for the same responsibilities. They are not claimed to have perfect behavioral parity.

| Responsibility | Local implementation/evidence | AWS implementation | What local does not prove |
| --- | --- | --- | --- |
| Static dashboard/status UI | Vite development server or static build | S3 origin behind CloudFront, TLS/domain through AWS edge services | CloudFront cache behavior, origin access, WAF, certificates, or real edge latency |
| Browser authentication | Generated test JWT or dev flow against mock issuer/JWKS | Cognito managed login, authorization code + S256 PKCE | Hosted-login configuration, callback mistakes, key rotation, federation, or Cognito availability |
| API/control plane | Spring Boot process or container | ECS Fargate service behind ALB in central region | ALB health/routing, ECS deployment/rollback, task IAM, service autoscaling, or AZ failure |
| Source-of-truth database | PostgreSQL container/Testcontainers + Flyway | RDS PostgreSQL in central region | RDS backup/failover/maintenance, network paths, connection limits, storage latency, or real RPO/RTO |
| Due scheduler/result processor | Threads/processes in the Spring control plane | Replicated Fargate tasks using the same PostgreSQL coordination | ECS termination timing and production task concurrency |
| Regional job transport | Separate logical ElasticMQ queues named for test adapters only | One real Standard SQS queue + DLQ in each actual probe region | Geographic placement, AWS service durability, IAM, quotas, cross-region clients, Lambda poller behavior |
| Probe worker | Pure ProbeEngine through a local/container adapter | Java Lambda in each actual probe region, driven by regional SQS | Lambda cold starts, event-source scaling, partial-batch service behavior, regional Internet path |
| Target simulation | WireMock and controlled local HTTP/TLS fixtures | Real public targets only under authorized safe test scope | Internet DNS/routing/TLS diversity and hostile target behavior |
| Central result transport | ElasticMQ result queue + DLQ | Standard SQS result queue + DLQ in the central region | Cross-region sends, real visibility/redrive timing, IAM/KMS failures |
| Observability | OTel Collector, Prometheus, Grafana, Tempo, structured stdout | OTel path plus CloudWatch/X-Ray and alarms | AWS ingestion limits/cost, alarm routing, retention, service correlation |
| Worker egress isolation | Fake resolver/connector tests and container network experiments | Dedicated regional probe network/egress controls with no control-plane/RDS path | Actual VPC routes, DNS resolver behavior, NAT/firewall enforcement, metadata denial |
| Secrets | Test-only generated keys and local environment injection | Secrets Manager/SSM-approved path, scoped IAM, encryption | Rotation, recovery, access audit, accidental state/log exposure |
| Infrastructure | Terraform files, validation, static checks, saved plan | Terraform apply only when separately authorized | Resource creation, provider/account policies, quotas, cost, teardown completeness |

Local adapters preserve message schemas, ports, domain logic, database semantics, and tests. AWS adapters introduce the service-specific behavior that must be tested separately. An emulator green test is never relabelled as an AWS integration test.

### 4.2 Control plane versus probe worker/data plane

Use this compact boundary:

~~~mermaid
flowchart TB
    subgraph CP["Central control plane: decides and remembers"]
        API["Identity + monitor API"]
        POLICY["Scheduling + policy"]
        DB2[("PostgreSQL source of truth")]
        RESULT["Result processor + incident engine"]
        READS["Availability + status projections"]
    end

    subgraph BRIDGE["Transport bridge: moves, duplicates, delays"]
        JQ2["Regional Standard SQS job queues"]
        RQ2["Central Standard SQS results"]
    end

    subgraph DP["Regional probe data/worker plane: executes and reports facts"]
        WA["Lambda worker region A"]
        WB["Lambda worker region B"]
        WEB["Public targets"]
    end

    API --> DB2
    POLICY <--> DB2
    POLICY --> JQ2
    JQ2 --> WA
    JQ2 --> WB
    WA --> WEB
    WB --> WEB
    WA --> RQ2
    WB --> RQ2
    RQ2 --> RESULT
    RESULT <--> DB2
    DB2 --> READS
~~~

The **control plane** defines desired monitoring behavior, authorizes changes, schedules work, owns durable truth, evaluates incidents, and serves read models. It answers “what should be monitored, when, under which policy, and what does the evidence mean?”

The **probe worker/data plane** carries out bounded regional HTTP work and reports facts. It answers “what did this region observe for this exact job?” It must remain stateless and unable to change monitor policy or incidents.

Queues bridge the planes but own neither truth nor policy. PostgreSQL owns truth. This separation is why a worker can be retried or replaced without becoming an incident authority.

### 4.3 Why AWS is meaningful, while local-first remains necessary

AWS is meaningful here because it supplies capabilities that are part of the actual problem:

- real compute placement in distinct regions, making geographic observation factual;
- regional SQS queues and cross-region result delivery;
- Lambda's event-source mapping, concurrency, partial-batch, retry, visibility, and DLQ behavior;
- Fargate/ALB operation for a long-running Java control plane;
- RDS networking, backup/failover options, and managed PostgreSQL operations;
- Cognito issuer/JWKS/PKCE behavior;
- IAM isolation between workers, queues, telemetry, and the control-plane database;
- VPC and egress controls for SSRF defense in depth;
- CloudWatch/X-Ray service telemetry and alarms; and
- S3/CloudFront static delivery.

Using AWS names only in diagrams would be decorative. The project becomes meaningfully AWS-backed when Terraform expresses those boundaries, IAM prevents forbidden paths, actual regions execute probes, real SQS/Lambda failure semantics are smoke-tested, and AWS telemetry can explain the flow.

Local-first is still necessary because the fastest, safest learning loop must be deterministic, inexpensive, repeatable, and aggressively breakable. PostgreSQL concurrency, state-machine permutations, duplicate delivery, target timeouts, malicious URLs, process crashes, load, and restore tests should run without an AWS account or cost. Local proof builds the domain's correctness; bounded AWS proof checks the adapters and platform assumptions.

The sequence is therefore:

1. prove pure logic and database invariants locally;
2. prove adapter contracts against ElasticMQ/WireMock;
3. validate Terraform without creating resources;
4. only with explicit authorization, smoke-test the smallest real AWS surface;
5. compare observed AWS behavior with local assumptions; and
6. retain mismatches as tests, ADR consequences, and learning evidence.

### 4.4 Why the architecture changed after validation

The earlier planning direction considered ECS-based probe workers and LocalStack. Validation changed both choices for concrete reasons.

#### ECS probe workers → regional Lambda workers

ECS remains the right fit for the central Spring control plane because it is a long-running HTTP application, scheduler, publisher, and result consumer with stable process-level telemetry and connection pools.

Probes have a different shape: they are short, stateless, independently retryable, bursty, and triggered by queue messages. Lambda maps directly to those properties, can be deployed in each actual probe region without maintaining an always-running worker service, and exposes SQS batch/retry/DLQ behavior worth learning.

The change is not “serverless is always better.” Lambda introduces Java cold starts, duration/concurrency constraints, event-source scaling behavior, and per-region networking/egress design. Reconsider ECS workers if measured probes become continuously busy, long-running, connection-heavy, require unusual runtimes/network control, or cost less as steady containers. The pure <code>ProbeEngine</code> keeps that exit open.

#### LocalStack → ElasticMQ

The local requirement is specifically SQS-compatible messaging, not a simulated copy of every AWS service. The current Testcontainers LocalStack documentation states that the LocalStack image requires <code>LOCALSTACK_AUTH_TOKEN</code> from 2026-03-23. Requiring that token would make the default learning loop depend on external authentication and would still not turn emulation into AWS proof.

ElasticMQ is free, focused, Compose/Testcontainers-friendly, and implements the SQS subset needed for duplicates, visibility, polling, and adapter integration. Its narrower scope makes the honesty boundary clearer. Real IAM, Lambda mappings, cross-region endpoints, service quotas, and redrive behavior remain subjects for an authorized real-SQS/Lambda smoke test.

### 4.5 Glossary and mental models

| Term | Plain-language responsibility | Mental model in RCP | It must not become |
| --- | --- | --- | --- |
| Controller | Translates HTTP into a use-case call and translates the result back | Reception desk: validate the envelope, identify the caller, hand off | Business-policy owner or SQL layer |
| Service/application use case | Coordinates one business action and transaction | Conductor: asks domain objects and ports to perform a coherent action | Grab bag of unrelated helpers |
| Repository | Loads/saves domain state through a persistence abstraction | Librarian: retrieve and store the right aggregate | Permission bypass or universal query API |
| Scheduler | Finds durable work whose due time has arrived | Alarm clock plus fair claimant | Network-calling task runner inside a DB lock |
| Queue | Durable transport that buffers and redelivers messages | Conveyor belt that can duplicate or reorder boxes | Source of truth or exactly-once promise |
| Worker | Executes one bounded regional probe and reports facts | Disposable field sensor | Incident decision-maker or database client |
| Result processor | Validates/deduplicates facts and orders evidence | Evidence intake desk | Blind “message means command” executor |
| Incident engine | Applies a versioned deterministic state machine | Judge applying published rules to finalized evidence | A collection of arrival-order if-statements |
| Transactional outbox | Stores publication intent with the business change | Durable mail tray committed with the record | Guarantee of one physical publication |
| Idempotency | Repeating an input has one logical effect | Duplicate-safe door with durable keys | In-memory “seen it” set or queue setting |
| DLQ | Isolates messages that exceeded bounded processing attempts | Evidence quarantine for diagnosis and controlled redrive | Trash can or automatic infinite replay loop |
| SLI | Measured reliability behavior | What fraction of eligible executions were good | Goal or marketing number |
| SLO | Chosen reliability objective for an SLI/window | The target line and error budget | Observed uptime |
| Observability | Ability to explain internal state from telemetry | Metrics show shape, traces show path, logs show detail | “We have logs” or high-cardinality metrics |
| Control plane | Decides, authorizes, schedules, remembers, evaluates | Central brain and ledger | Claimed multi-region because workers are regional |
| Probe data/worker plane | Performs regional measurements and reports immutable facts | Distributed senses | Owner of policy, identity, or incidents |
| Lease | Time-bounded right to work on a durable row | Claim ticket that expires after a crash | Permanent lock or proof work completed |
| Watermark/result deadline | Boundary for finalizing event-time evidence despite late arrival | Close-of-evidence checkpoint | Claim that late messages cannot exist |
| Evidence coverage | Fraction of expected monitoring opportunities with conclusive data | Health of the measurement process | Hidden denominator adjustment that inflates uptime |

## 5. Core correctness and failure semantics

### 5.1 Non-negotiable model

- PostgreSQL is the source of truth. SQS queues are transport, not the system of record.
- Standard SQS provides at-least-once delivery and can deliver duplicates or messages out of order.
- “Exactly once” is a logical effect produced by durable uniqueness and idempotent state transitions, not a queue promise.
- Every job, execution, event, result message, incident event, and trace has a globally unique identifier, preferably UUIDv7 or another time-sortable globally unique ID.
- Every message envelope has a schema version, message ID, causation ID, correlation/execution ID, producer, occurred-at timestamp, and payload.
- Worker clocks are evidence, not ordering authority. The control plane uses the scheduler's <code>scheduled_at</code>, persisted receive time, and explicit result deadline/watermark.
- The worker reports facts. Only the incident module decides whether evidence means an outage.
- Retries must never perform an unbounded operation or create an unbounded multiplicative load on a monitored target.

### 5.2 Scheduling transaction

Each enabled monitor owns <code>next_check_at</code>. A scheduler instance repeatedly claims a small due batch ordered by <code>next_check_at, monitor_id</code>.

The intended transaction is:

1. Begin a short database transaction.
2. Select enabled monitors whose <code>next_check_at &lt;= database_now</code>, ordered deterministically, limited to a bounded batch, using <code>FOR UPDATE SKIP LOCKED</code>.
3. For each selected monitor, derive a stable <code>scheduled_at</code> from the existing due time and create one <code>execution_id</code>.
4. Insert one <code>probe_job</code> per enabled actual region with a globally unique <code>job_id</code>. A unique constraint on <code>(monitor_id, scheduled_at, region)</code> prevents two logical jobs for the same regional execution.
5. Insert one outbox event per job in the same transaction.
6. Advance <code>next_check_at</code> from the prior due time, not from the process wall clock, so processing delay does not cause schedule drift.
7. Apply an explicit bounded catch-up policy: skip excessive missed intervals after a configured maximum, record a scheduler-gap metric/audit event, and never produce an unbounded backlog.
8. Commit, releasing row locks. No network call occurs inside this transaction.

Two scheduler instances can work concurrently because locked rows are skipped, but row locking alone is not the complete proof. The unique execution constraint is the durable backstop. Database time avoids scheduler-host clock skew. Batch size and transaction latency are measured.

If a scheduler dies before commit, no job exists and <code>next_check_at</code> is unchanged. If it dies after commit, jobs and outbox events remain durable. A later scheduler must not recreate the same execution because both the advanced due time and uniqueness constraint protect it.

### 5.3 Outbox claiming and publication

An outbox row records event ID, aggregate identity, aggregate sequence, destination region/queue, event type, schema version, payload, creation time, attempt count, next attempt time, claim token, lease expiry, and publication time.

Publishers claim bounded batches with <code>FOR UPDATE SKIP LOCKED</code>, set a short lease in a transaction, then perform SQS calls outside that transaction. A successful send is followed by a conditional update using the claim token. A failed send increments attempts and schedules exponential backoff with jitter. Expired leases can be reclaimed.

Failure outcomes are explicit:

| Failure point | Required outcome |
| --- | --- |
| Domain/job transaction rolls back | No outbox event is visible and no message should be sent. |
| Commit succeeds; publisher dies before send | Unpublished row remains and is retried. |
| Send fails | Committed work remains; row is retried after bounded backoff. |
| Send succeeds; publisher dies before marking published | Row can be sent again. Consumers must deduplicate. |
| Publisher loses lease | Conditional completion fails; another publisher owns retry. |
| Permanent malformed event | Stop infinite retry, quarantine with reason, alarm, and preserve payload for diagnosis. |

The outbox closes the database/SQS dual-write loss window. It does not guarantee a single publication and does not remove the need for idempotent consumers.

### 5.4 Probe-job delivery and worker behavior

Each job queue is Standard SQS with a same-region DLQ. Initial queue settings must be derived from measured probe limits, not copied blindly:

- Lambda timeout is greater than the worker's total bounded HTTP/DNS processing budget.
- SQS visibility timeout is greater than the maximum normal Lambda batch processing time, including a deliberate safety margin.
- Event-source batch size starts small because each message causes an external HTTP request.
- Reserved concurrency and queue scaling caps limit target amplification and account-wide impact.
- <code>ReportBatchItemFailures</code> partial batch responses ensure a failed record does not force successful records in the batch to retry.
- Retry count is bounded through the redrive policy. The DLQ retention period is longer than the source queue's.
- Transient outbound failures use a small number of in-invocation retries with exponential backoff and full jitter only when the remaining deadline permits it.
- Poison messages fail with a stable classification, reach the DLQ, trigger an alarm, and are redriven only after diagnosis or schema repair.

The worker first validates the message schema and deadline, then applies <code>SafeTargetPolicy</code>, executes one bounded probe, creates one immutable fact result, and sends it to the central result queue. If sending the result fails, the job is not acknowledged and may run again. The same <code>job_id</code> therefore can produce multiple delivered messages but at most one logical persisted result.

### 5.5 Result idempotency and ordering

The central consumer processes a result in one database transaction:

1. Validate envelope and result schema.
2. Attempt to insert <code>(consumer_name, message_id)</code> into <code>processed_messages</code>.
3. If already present, acknowledge without side effects.
4. Insert the probe result with a unique constraint on <code>job_id</code>. If a second delivery for the same job differs, retain an audit/conflict record and alert; do not silently overwrite the first accepted fact.
5. Update execution evidence and append any deterministic incident event using unique transition keys.
6. Commit before acknowledging the SQS message.

If the process dies before commit, the message is retried. If it dies after commit but before acknowledgement, uniqueness turns the retry into a no-op. Message deduplication and result uniqueness are both kept: one protects the transport envelope; the other protects the domain fact.

Results are grouped by <code>execution_id</code> and evaluated in <code>scheduled_at</code> order after an explicit collection deadline. A per-monitor evaluation cursor/watermark prevents arrival order from becoming incident order. Late results are stored and marked late. They trigger an auditable correction/re-evaluation path rather than silently rewriting history. The exact late-evidence correction policy must be finalized in ADR-008 before public status history is considered stable.

### 5.6 Worker fact contract

A result reports facts only:

- identifiers and schema version;
- monitor version, job, execution, scheduled time, region, attempt, worker build, and receive/start/finish times;
- normalized target authority and path with secrets/query values redacted from telemetry;
- safe DNS resolution outcome and selected public address class without exposing sensitive resolver internals;
- connection, TLS, time-to-first-byte, and total duration where available;
- HTTP method and status;
- bytes read up to the configured cap;
- redirect attempt, if any;
- stable error category such as DNS, policy rejection, connect timeout, TLS, request timeout, protocol, response-too-large, or worker-internal; and
- trace context.

It does not say “open incident”, “target down globally”, or “SLO violated”. Response bodies, cookies, authorization material, and arbitrary headers are never put on the queue.

### 5.7 Deterministic incident evidence and state machine

Each scheduled execution expects the monitor's versioned set of regions. Each regional result is classified as <code>SUCCESS</code> or <code>FAILURE</code> according to the monitor version that created the job. A missing result is not silently converted into a target failure.

The initial global evidence policy is:

- Require at least two configured probe regions for automatic incident decisions.
- Quorum is <code>floor(expected_regions / 2) + 1</code>.
- <code>UP</code>: successful regional facts meet quorum.
- <code>DOWN</code>: failed regional facts meet quorum.
- <code>DISAGREEMENT</code>: at least one success and one failure are present and neither conclusion has quorum, or a quorum conclusion exists with material contrary regional evidence; retain both the conclusion and a disagreement flag.
- <code>NO_DATA</code>: fewer than quorum conclusive facts exist at the result deadline.

Thus one failed region does not automatically prove a target outage. With two regions, one success and one failure is disagreement. With three regions, two failures can produce <code>DOWN</code>, but the successful dissenting region remains visible as disagreement evidence.

The initial versioned lifecycle policy is deliberately simple:

~~~mermaid
stateDiagram-v2
    [*] --> HEALTHY
    HEALTHY --> SUSPECT_DOWN: first finalized DOWN
    SUSPECT_DOWN --> OPEN: second consecutive finalized DOWN
    SUSPECT_DOWN --> HEALTHY: UP, DISAGREEMENT, or NO_DATA
    OPEN --> SUSPECT_RECOVERY: first finalized UP
    SUSPECT_RECOVERY --> HEALTHY: second consecutive finalized UP / resolve
    SUSPECT_RECOVERY --> OPEN: DOWN, DISAGREEMENT, or NO_DATA
    OPEN --> OPEN: DOWN, DISAGREEMENT, or NO_DATA
~~~

Rules:

- Decisions consume finalized executions in scheduled-time order, never queue-arrival order.
- <code>DISAGREEMENT</code> and <code>NO_DATA</code> break a pending open/recovery streak. They do not resolve an open incident.
- Opening on the second consecutive <code>DOWN</code> creates one incident with <code>opened_at</code> equal to the first failing execution's scheduled time and <code>detected_at</code> equal to processing time.
- Resolving on the second consecutive <code>UP</code> sets <code>resolved_at</code> to the first recovery execution's scheduled time and records detection time separately.
- <code>resolved_at</code> can never precede <code>opened_at</code>.
- A partial unique constraint permits at most one active incident per monitor.
- Every transition has a unique deterministic key based on monitor, policy version, prior state, triggering execution, and target state, so duplicates cannot append duplicate incident events.
- Policy changes are versioned and apply to new executions; past incidents retain the policy version that made each decision.
- Operator acknowledgement is metadata, not a replacement for measured state. Manual close, if added later, must be a separate audited transition and cannot erase probe history.

The default two-failure/two-recovery policy is a learning baseline, not a universal truth. Per-monitor thresholds can be introduced only after their semantics, limits, and migration behavior are explicit.

### 5.8 Availability, SLI, SLO, maintenance, and missing evidence

Measured availability is a historical SLI. The SLO is a configured target. The UI and API must never label the SLO target as measured uptime.

The initial monitor SLI is execution-based so adding a probe region does not inflate the denominator:

<code>measured_availability = finalized_UP_executions / eligible_conclusive_executions</code>

Where:

- one scheduled execution is one opportunity regardless of region count;
- <code>UP</code> is good and <code>DOWN</code> is bad;
- <code>DISAGREEMENT</code> and <code>NO_DATA</code> are not silently counted as good;
- inconclusive executions are excluded from the availability denominator but included in a separate evidence-coverage metric;
- if evidence coverage is below the configured reporting threshold, the SLO result is <code>INSUFFICIENT_DATA</code>, never “passing”;
- target DNS failures, timeouts, TLS failures, and configured bad HTTP statuses are target failures when supported by quorum;
- invalid monitor configuration or a SafeTargetPolicy rejection is a configuration/security error, not target downtime;
- planned maintenance is excluded only when the window was created before the affected execution, is authorized and audited, and its excluded duration/count is displayed;
- retroactive maintenance cannot improve an already reported SLI;
- late corrections create a new calculation version and audit record; and
- regional SLIs remain separately available for diagnosis.

The SLO record stores target percentage, rolling or calendar window, policy version, effective dates, and allowed maintenance behavior. Error budget is derived from the SLO and measured bad eligible executions. Reporting queries must state the time zone and use UTC storage.

## 6. Security architecture

### 6.1 Threat model summary

Primary assets are user identity, monitor ownership, unpublished target URLs, operational history, incident integrity, queue messages, AWS credentials, Terraform state, and the control plane/database network. Principal threats include:

- SSRF and internal network/cloud metadata access through user-controlled targets;
- using workers as a scanning or denial-of-service platform;
- cross-tenant monitor access;
- forged, replayed, duplicated, or schema-confused queue messages;
- leaked JWTs, secrets, target data, or Terraform state;
- excessive probe concurrency against one target;
- SQL injection and unsafe dynamic reporting queries;
- privilege escalation through broad worker IAM;
- telemetry leaking query strings, tokens, headers, or response bodies; and
- a control-plane failure being misreported as target downtime.

A dedicated threat model will enumerate actors, trust boundaries, assets, abuse cases, mitigations, residual risks, and test evidence. SSRF is a Day-1 architecture requirement, not a later input-validation task.

### 6.2 SafeTargetPolicy: initial explicit policy

<code>SafeTargetPolicy</code> is a pure, centrally specified contract used at monitor creation/update and again immediately before every worker connection. Passing API validation does not grant a permanent trust decision.

Initial policy:

1. Parse with a standards-based URI parser and reject ambiguous, malformed, non-canonical, or parser-disagreeing input.
2. Permit only lowercase-equivalent <code>http</code> and <code>https</code>. Reject every other scheme, including file, ftp, gopher, data, jar, and protocol-relative URLs.
3. Require an absolute host. Reject user-info/credentials, fragments, empty hosts, control characters, encoded-host ambiguity, alternate numeric IP notations, and IPv4-mapped IPv6 bypasses.
4. Initially allow only default ports: 80 for HTTP and 443 for HTTPS. A wider explicit port allowlist requires a reviewed policy change.
5. Allow paths. Initially reject query strings because they commonly carry credentials and are easily leaked through logs or redirects. Supporting redacted, non-secret queries later requires its own threat-model update.
6. Normalize internationalized domain names before validation and retain the canonical form used for all later checks.
7. For literal IP targets and every A/AAAA DNS answer, validate IPv4 and IPv6. Reject loopback, private, carrier-grade NAT/shared, link-local, unique-local, multicast, unspecified, reserved/documentation/benchmark ranges, broadcast, cloud metadata addresses, and any address not confidently classified as globally routable public unicast.
8. Reject the target if any returned address is disallowed. Do not select a convenient public answer while ignoring a private answer.
9. Resolve and validate at creation/update and again for each attempt. Bind the connection to an address from that validated resolution set while retaining the original hostname for Host and TLS SNI/certificate verification. Validate the actual connected peer when the client/runtime permits it.
10. Disable redirects initially. If redirects are later enabled, cap the count and repeat the full parse, scheme, port, DNS, IP, credential, and peer validation for every hop. Never forward credentials or sensitive headers across an authority change.
11. Permit only safe methods required by the product, initially GET and optionally HEAD. No user-supplied request body, Authorization, Proxy-Authorization, Cookie, client certificate, or arbitrary header is forwarded.
12. Require TLS certificate and hostname verification for HTTPS; there is no “ignore TLS errors” production option.
13. Enforce separate DNS, connect, TLS, first-byte, and total request deadlines under one hard job deadline.
14. Limit bytes read, header sizes/count, decompression expansion, and content processing. Do not store response bodies; read only enough to verify the configured condition.
15. Use a fixed, honest User-Agent and bounded connection pools. Do not execute active content, parse XML entities, or invoke content-specific helpers that can initiate secondary fetches.
16. Reapply policy on every retry, because DNS and configuration can change between attempts.

### 6.3 DNS rebinding/pinning and residual risk

A vulnerable pattern is “resolve, validate, then let a generic HTTP client resolve again.” RCP's HTTP adapter must use a resolver/connection mechanism that connects to the validated address set while preserving hostname verification. Tests must include DNS answers that change from public to private, mixed public/private answers, IPv6, IPv4-mapped IPv6, redirects, alternate numeric encodings, and a connected peer that differs from the validated address.

Residual risk remains in resolver caches, proxies, NAT64, HTTP client behavior, platform DNS changes, and future redirect/query/header features. Therefore URL checks alone are insufficient. Until both application and network controls are demonstrated, the system must not be opened to untrusted public target registration.

### 6.4 Network egress defense in depth

Probe workers must be isolated from control-plane private resources:

- no RDS credentials, Secrets Manager permission for control-plane secrets, VPC peering, database security-group path, or private control-plane route;
- a dedicated probe-network design per region, with public egress through a controlled path that denies private, link-local, reserved, metadata, control-plane, and organization CIDRs;
- egress rules or a proxy/firewall that allow only required DNS and HTTP(S) behavior and make deny events observable;
- no inbound listener on workers;
- explicit denial tests from the worker environment; and
- a documented cost-aware AWS implementation choice before deployment, because NAT/firewall design in every region is consequential.

If the three-day sprint proves only application-layer SSRF defenses locally, the honest claim is “application policy tested”; it is not “SSRF eliminated” or “safe for hostile multi-tenant Internet use.”

### 6.5 Identity, authorization, and tenant isolation

AWS uses Cognito as an OIDC provider. The browser uses authorization code with S256 PKCE, state, exact HTTPS redirect URIs, and no client secret. The API accepts access tokens, not an ID token as authorization proof.

Spring Security resource-server validation must verify:

- cryptographic signature through trusted JWKS;
- exact issuer;
- intended audience/resource;
- expiry and not-before with a small documented clock-skew allowance;
- allowed algorithms; and
- required scopes/authorities.

The local subject key is <code>(issuer, subject)</code>; email is profile data, not a stable authorization key. Controllers never accept an owner ID from the client. Repository queries and service methods require the authenticated subject, and negative tests prove one user cannot read or mutate another user's private monitor.

Public status endpoints expose only monitors/incidents explicitly attached to a published status page and return a purpose-built projection, never the private monitor entity.

Local tests use generated asymmetric signing keys, signed test JWTs, and a mock JWKS/issuer. A dev-only token fixture must be impossible to activate in an AWS profile. Keycloak is reconsidered only if interactive local login, federation administration, or identity-provider failure behavior becomes a direct learning objective.

### 6.6 Abuse controls, secrets, and audit

- Rate-limit monitor creation/update, API reads, and probe frequency by subject and target authority.
- Cap monitors per subject, enabled regions, minimum interval, timeout, response bytes, and concurrent probes per target/authority.
- Validate request/body sizes and use strict JSON schemas with unknown-field policy.
- Never put credentials, tokens, query values, response bodies, or Terraform state in source, logs, metrics labels, traces, queue attributes, or public status output.
- Store runtime secrets in an approved secrets service/environment injection path; rotate and scope them.
- Use least-privilege IAM. A regional worker may receive/delete only from its job queue, send only to the central result queue, write its telemetry, and use only specifically required KMS keys. It cannot access RDS or control-plane secrets.
- Give the control plane only the queue, database secret, telemetry, and infrastructure permissions it needs. Separate task execution role from task role.
- Record append-only audit events for monitor/status-page/policy changes, ownership-sensitive actions, authentication/authorization failures, DLQ redrive, manual incident action, maintenance windows, and administrative changes.
- Apply API CORS only to the CloudFront origin and explicit local development origins. Use security headers and avoid tokens in browser persistent storage where practical.
- Review dependency and container vulnerabilities, pin images by version/digest for repeatability, and generate an SBOM.

## 7. Proposed modules and data model

### 7.1 Spring Modulith modules

| Module | Owns | May depend on |
| --- | --- | --- |
| <code>identity</code> | Trusted issuer/subject mapping, authorization vocabulary, current-subject port | Nothing except minimal shared primitives |
| <code>monitors</code> | Monitor aggregate, versions, regions, SLO configuration, ownership policy, SafeTargetPolicy at write time | identity |
| <code>scheduling</code> | Due selection, executions/jobs, schedule advancement, catch-up policy, outbox intent | monitors |
| <code>probes</code> | Job/result contracts, SQS ports/adapters, pure ProbeEngine, result ingestion/idempotency | monitors contract; scheduling job identity |
| <code>incidents</code> | Global evidence evaluation, state machine, incidents/events, policy versions | probe facts and monitor policy snapshots |
| <code>availability</code> | SLI/SLO calculations, coverage, maintenance exclusion, rollups/read models | probe/incident facts and monitor SLO snapshots |
| <code>statuspage</code> | Explicit publication aggregate and anonymous read projection | monitors, incidents, availability read contracts |
| <code>reporting</code> | Owner-authorized, time-bounded reliability report model and JSON/HTML/PDF renderers; no independent metric calculations | published monitor, incident, and availability read contracts |
| <code>shared</code> | Only unavoidable technical primitives such as typed IDs, clock, pagination, and message metadata | No business logic |

Modules communicate through published interfaces and domain events, not another module's repository or entity. Spring Modulith verification tests enforce allowed dependencies, absence of cycles, and module boundaries. “Shared” is not a dumping ground; a primitive remains in its owning module until at least two modules genuinely need a stable abstraction.

The <code>ProbeEngine</code> can be a separate Maven module because the Lambda and local/container adapters need the same pure core. That physical build module does not turn the system into a microservice.

### 7.2 Core tables and invariants

Exact columns will be finalized through Flyway migrations, but invariants are fixed before schema design.

| Table/entity | Purpose | Required invariants |
| --- | --- | --- |
| <code>subjects</code> | Local identity projection | Unique <code>(issuer, subject)</code>; email is mutable/non-authoritative; no password storage. |
| <code>monitors</code> | Owner-controlled monitor and current schedule | Owner required; normalized target and policy valid; interval/timeout/region count bounded; version increases on behavior-changing edits; disabled monitors create no new jobs; <code>next_check_at</code> is non-null only when schedulable. |
| <code>monitor_versions</code> or immutable snapshot | Reproduce the policy used by a job | A job points to an immutable monitor/policy version; old result meaning cannot change when a monitor is edited. |
| <code>probe_executions</code> | One scheduled logical opportunity across regions | Unique <code>(monitor_id, scheduled_at)</code>; expected regions and result deadline fixed at creation. |
| <code>probe_jobs</code> | One regional unit of probe work | Globally unique job ID; unique <code>(monitor_id, scheduled_at, region)</code>; belongs to exactly one execution/version; terminal logical result at most once. |
| <code>probe_results</code> | Accepted immutable regional fact | Unique job ID; region and monitor version match the job; timestamps sane within explicit tolerances; original accepted fact not overwritten. |
| <code>result_conflicts</code> | Diagnose two differing payloads for one job | References original and conflicting message hashes; append-only; alerts rather than changing truth silently. |
| <code>incidents</code> | Monitor incident lifecycle | At most one active incident per monitor; opened time required; resolved time null while active and never before opened; policy version retained. |
| <code>incident_events</code> | Append-only transition/audit history | Unique deterministic transition key; event times monotonic in scheduled evidence order; no duplicate open/resolve event. |
| <code>outbox_events</code> | Durable publication intent | Globally unique event ID; created in same transaction as state change; publication marker conditional on active claim; attempts bounded/observable. |
| <code>processed_messages</code> | Durable consumer idempotency | Unique <code>(consumer_name, message_id)</code>; inserted in same transaction as effects; retention exceeds maximum replay/redrive horizon or is safely archived. |
| <code>maintenance_windows</code> | Prospective authorized SLI exclusion | Owner/actor and reason required; created before affected sample; bounded interval; edits audited. |
| <code>audit_events</code> | Security/administrative evidence | Append-only; actor, action, resource, time, outcome, correlation ID; sensitive values redacted. |
| Optional <code>worker_region_health</code> | Separate platform health from target health | Derived from heartbeats/synthetic evidence; cannot be used to fabricate target success; region and time window explicit. |
| Optional availability rollups | Efficient reporting after raw correctness | Rebuildable from immutable facts; calculation version/window/policy retained; never the only copy of evidence. |
| Optional <code>generated_reports</code> metadata | Reproduce or audit persisted report artifacts | Owner/monitor/window, generation time, calculation/policy version, source watermark and content hash required; artifact reference never grants authorization; raw facts remain canonical. |

Database constraints enforce what can be enforced structurally. Service-level checks are not substitutes for unique, foreign-key, check, and partial indexes. Flyway migrations own schema evolution; ORM auto-DDL is disabled outside disposable tests.

## 8. Decision matrix

### 8.1 Chosen technologies and rejected alternatives

| Decision | Chosen | Why it fits RCP | Why not the alternatives now / fallback |
| --- | --- | --- | --- |
| Java runtime | Java 21 on a permissive OpenJDK distribution such as Eclipse Temurin | Modern LTS, target-role alignment, broad library/runtime maturity, and still within Spring Boot 4.1's supported Java range. | Java 25 is also LTS and is valuable for compatibility CI, but it is not needed to prove the core concepts. Optionally test on 25. Do not depend on Oracle JDK licensing; verify the selected distribution/license. |
| Spring Boot line | Current Spring Boot 4.1 baseline | The current official system-requirements page identifies 4.1.0; it keeps the project current and compatible with Java 21. | Fall back to the current 3.5 patch only if a named required dependency has a reproduced incompatibility with 4.1. Record the dependency, failing test/build, chosen 3.5 version, and ADR amendment; do not fall back from vague caution. |
| Build tool | Maven | Transparent lifecycle, explicit dependency management, enterprise familiarity, strong Spring ecosystem support, and one readable multi-module build. | Gradle is capable and often more programmable, but its DSL/build-cache learning is not the target problem. |
| Application shape | Modular monolith with Spring Modulith | One deployable control plane and transaction boundary while making business boundaries executable and testable. It permits later extraction based on evidence. | Premature microservices add network contracts, distributed transactions, deployment/telemetry overhead, and failure modes before scale/team ownership justifies them. |
| Primary data store | PostgreSQL on RDS | Relational invariants, transactions, partial/unique indexes, row locking, SKIP LOCKED, rich SQL, and one source of truth match the correctness problems. | DynamoDB changes the transaction/query model and is unnecessary. Aurora adds cost/operational choices without a proven scale/HA need. TimescaleDB or ClickHouse may help high-volume analytics later, but raw probe scale and query pain must first justify another store. |
| Persistence access | JPA for ordinary aggregates plus handwritten SQL/Spring JDBC for concurrency/reporting | Keeps CRUD concise while making locks, claims, uniqueness, and reporting SQL visible and teachable. | Pure JPA can obscure lock/claim behavior and produce poor reporting queries. Pure JDBC adds mapping boilerplate to ordinary aggregates. jOOQ is attractive for type-safe SQL; reconsider when query volume/schema stability makes generated SQL types worth another tool. |
| Schema migration | Flyway | Ordered SQL migrations keep the actual PostgreSQL schema and constraints visible; integrates directly with Spring Boot. | Liquibase's cross-format changelog/rollback features are not needed here and can hide the SQL Ali is meant to learn. |
| Scheduling | Database due-date scheduler using <code>next_check_at</code>, short transactions, leases, and SKIP LOCKED | Teaches transactions/concurrency, keeps local parity, makes schedule state queryable, and atomically creates jobs/outbox intent. | EventBridge Scheduler is a legitimate managed product-scale alternative and supports large-scale schedules, retries, and DLQs; reconsider when managed scale/operations outweigh this learning goal. Quartz is powerful but adds its own scheduler model/tables and hides the precise claim algorithm under study. |
| Reliable publication | Transactional outbox in the same PostgreSQL transaction as state changes | Prevents committed work from being lost in a database/SQS dual write and exposes duplicate-publication reality. | Direct DB-then-SQS writes have an unclosable crash window. Distributed transactions are not available/useful here. CDC may become attractive at larger scale but adds infrastructure before needed. |
| Queue semantics | Standard SQS | Fits independent probe/result work, high throughput, managed delivery, regional queues, and intentional learning about duplicates/out-of-order events. | FIFO ordering/deduplication does not remove consumer idempotency and may serialize unrelated work. RabbitMQ adds broker operations and a different AWS path. Kafka is unjustified without replay/streaming/partition throughput requirements. |
| Probe compute | Java Lambda per actual probe region | Probes are short, stateless, bursty, event-driven, and naturally invoked from regional SQS queues. Pure core limits Lambda coupling. | ECS workers are better for continuously busy, long-running, connection-heavy, or runtime-specialized probes; reconsider on measured duration/cost/cold-start/concurrency evidence. |
| Control-plane compute | ECS Fargate behind ALB | Long-running Spring service, predictable HTTP/consumer/scheduler processes, containers without EC2 node management, and simpler than Kubernetes. | EKS adds cluster/Kubernetes operations without a need. EC2 adds host patching/capacity management. App Runner is simpler for HTTP but offers less explicit fit/control for long-running consumers, private networking, and multi-process operational experiments. |
| Identity | Cognito OIDC, authorization code + S256 PKCE; Spring resource-server JWT | Uses standards, hosted identity, no custom password handling, and real issuer/JWKS/audience validation. | Custom password/JWT code is a security liability and wrong learning target. Keycloak is useful for local IdP study but adds a stateful service not needed for resource-server tests. |
| Frontend | React + TypeScript + Vite static site | Thin, fast client with no server runtime; S3/CloudFront hosting matches operator/status UI needs. | Next.js SSR/server features are unnecessary. Angular provides a larger framework than this intentionally thin UI needs. |
| API | REST with OpenAPI and problem details | Resource-oriented monitor/incident/status operations, easy browser/client use, explicit contracts, and generated schema/client options. | GraphQL adds schema/resolver/cache/authorization complexity without varied client query needs. gRPC is a poor browser/public API default and unnecessary internally while modules are in-process. |
| Observability | Actuator + Micrometer business metrics + OpenTelemetry Java agent/Collector | Vendor-neutral instrumentation and context propagation while exporting to local Prometheus/Grafana/Tempo and AWS CloudWatch/X-Ray. | AWS-only instrumentation creates lock-in and weak local parity. OTel does not replace carefully named business metrics or structured logs. |
| Infrastructure as code | Terraform | Explicit plans, broad ecosystem, reviewable AWS graph, and transferable platform skill. | CDK adds a second application-language codebase and can hide resource details. CloudFormation is native but more verbose. Manual console changes are irreproducible and unauditable. |
| Local AWS queue emulation | ElasticMQ by default | Free SQS-compatible endpoint, simple Compose/Testcontainers use, and no current LocalStack auth token requirement. | Current LocalStack/Testcontainers usage requires <code>LOCALSTACK_AUTH_TOKEN</code>. ElasticMQ is not full AWS parity, so retain a later authorized real-SQS smoke test. |
| Result processing location | Spring control-plane module | Incident decisions need the central transaction boundary, database state, policy versions, and ordered evidence; keeping them together avoids a distributed consistency problem. | A separate result microservice adds another deployable/database ownership question without an independent scale or team boundary. |
| Queue topology | Per-region job queue plus one central result queue | Makes geographic routing explicit, isolates regional backlog/DLQ health, and centralizes decision ingestion. | One global-looking job queue cannot place Lambda execution geographically. Per-region result queues add polling/routing complexity before central ingestion is a bottleneck. |

### 8.2 Explicit exclusions and reconsideration triggers

| Excluded now | Problem it would add | Reconsider only when |
| --- | --- | --- |
| Kubernetes/EKS | Cluster, ingress, autoscaling, security, upgrades, and service operations unrelated to current proof | Multiple independently operated services/teams, workload portability, or scheduling requirements make ECS insufficient and the operational cost is accepted. |
| Kafka | Brokers/partitions/schema/replay operations and a second persistence model | Sustained event throughput, ordered partition replay, multiple independent consumers, or long retention cannot be met economically by SQS + PostgreSQL. |
| Redis | Cache invalidation, durability ambiguity, and another operational dependency | Measured database/cache latency or distributed rate-limit/coordination needs cannot be met safely in PostgreSQL and stale-data semantics are explicit. |
| DynamoDB | Different access/invariant/transaction model and duplicated source of truth | A bounded workload has a key-value access pattern, independent ownership, and measured scale/latency that PostgreSQL cannot meet. |
| Aurora | More cost and engine/operational choices without evidence | RPO/RTO, scaling, failover, or connection requirements are explicit and RDS PostgreSQL is proven insufficient. |
| TimescaleDB/ClickHouse | Another data engine and consistency/retention pipeline | Probe volume and analytical queries are measured, retention/rollup requirements are stable, and PostgreSQL reporting is the demonstrated bottleneck. |
| Service mesh | Sidecars, certificates, policy, telemetry, and failure surface | Multiple network services require consistent mTLS, traffic policy, and observability that platform-native controls cannot provide. |
| Elasticsearch/OpenSearch | Indexing pipeline, eventual consistency, cluster cost | Operators need full-text/high-cardinality search over a volume PostgreSQL indexes cannot serve. |
| GraphQL | Resolver authorization, N+1/cache/schema complexity | Multiple clients need genuinely flexible graph-shaped queries and REST causes measured over/under-fetching pain. |
| WebSockets | Stateful connections, reconnect/fan-out/backpressure complexity | Polling/SSE cannot meet a defined real-time operator requirement. Server-Sent Events should be evaluated first for one-way updates. |
| Premature microservices | Distributed transactions, contracts, deployment, observability, and failure modes | A module has independent scaling, data ownership, release cadence, or team ownership proven by metrics and operations. |

### 8.3 Explicit non-goals for the three-day reference

These exclusions keep the system coherent without pretending the adjacent problems do not exist:

- production launch, an uptime commitment, real customers, or a public hostile multi-tenant service;
- production-scale capacity, cost optimization, or a benchmark presented without its local environment;
- highly available multi-region control plane/database or proven RPO/RTO;
- billing, subscriptions, organization/team administration, invitations, or enterprise RBAC;
- custom password storage, custom authorization server, or arbitrary identity federation;
- email/SMS/PagerDuty/Slack notification delivery and escalation policy;
- browser journey monitoring, JavaScript execution, screenshots, TCP/ICMP/DNS-specific monitors, or private-agent monitoring;
- authenticated target probes, user-supplied headers/cookies/client certificates, request bodies, query-string secrets, non-default ports, or redirects in the initial security policy;
- arbitrary user code/plugins in workers;
- automatic domain-ownership verification beyond resource ownership; high-frequency/public use would require stronger abuse/target-authorization controls;
- long-term analytical warehouse/search engine, indefinite raw-result retention, or machine-learning anomaly detection;
- Kubernetes, Kafka, Redis, DynamoDB, Aurora, service mesh, Elasticsearch, GraphQL, or WebSockets without the triggers in Section 8.2;
- exactly-once transport, global event order, or queue-as-database;
- full LocalStack/AWS emulation or a claim that ElasticMQ is AWS;
- complete penetration testing, compliance certification, DDoS protection, or supply-chain assurance;
- automatic Terraform apply, production credentials in local development, or any cloud write without explicit authorization; and
- a polished design system before the backend reliability story is proven.

These are sprint non-goals, not permanent prohibitions. A future feature enters only with a concrete user/operational problem, threat/failure analysis, ownership, proof plan, and reconsideration trigger.

## 9. Verification and test strategy

### 9.1 Test layers

- **Pure unit tests:** JUnit Jupiter from the chosen Spring Boot baseline, AssertJ, and selective Mockito only at true ports. Avoid mocking domain state machines and SQL behavior.
- **Architecture tests:** Spring Modulith verification for module boundaries, cycles, allowed dependencies, and module integration tests.
- **Database integration:** Testcontainers PostgreSQL with real Flyway migrations, constraints, isolation, locking, lease expiry, and reporting SQL.
- **Queue integration:** ElasticMQ tests for adapters, duplicate delivery, visibility, retry, partial failure, and DLQ-oriented behavior that the emulator supports.
- **HTTP target simulation:** WireMock endpoints for statuses, latency, disconnects, oversized/chunked/compressed bodies, TLS, and redirects.
- **Security/property tests:** Generated hosts/IPs/URI encodings and a fake changing DNS resolver exercise SafeTargetPolicy. Test both IPv4 and IPv6 and the validation-to-connect boundary.
- **State-machine/property tests:** A property-testing library such as jqwik, after compatibility verification, generates result orders, duplicates, missing regions, disagreement, late facts, and policy versions.
- **Spring/API tests:** Slice tests and full application tests for JWT validation, ownership, validation errors, transactions, and public/private projections.
- **Load tests:** k6 scenarios for monitor APIs, scheduler backlog, result ingestion, status reads, and controlled target traffic. Record hardware/configuration and do not extrapolate local results to AWS scale.
- **Failure injection:** Kill scheduler/outbox/consumer processes at named crash windows; inject SQS send failures, database latency, target timeouts, poison messages, telemetry outage, and clock skew.
- **Recovery:** Local <code>pg_dump</code>/<code>pg_restore</code> or equivalent backup/restore exercise with row counts, invariants, and a documented recovery time. A real RDS snapshot restore is later and requires authorization.
- **Infrastructure checks:** <code>terraform fmt -check</code>, <code>terraform validate</code>, static security/lint checks, and a reviewed plan. No apply is implied.

### 9.2 Highest-value invariants and proofs

| Invariant | Primary proof |
| --- | --- |
| One job creates at most one logical result | Unique <code>probe_results.job_id</code>; deliver same/equivalent and conflicting results concurrently; assert one accepted fact and an explicit conflict record for mismatch. |
| Duplicate result cannot duplicate incident events | Replay the same and new-message-ID/same-job payloads before and after commit/ack failure; assert deterministic transition-key uniqueness. |
| Only owner can mutate monitor | Two generated JWT subjects exercise every read/update/delete/enable/publish endpoint and service path; assert not-found/forbidden policy without data leakage. |
| Incident cannot resolve before opening | Database check constraints plus generated state-machine event sequences; assert no illegal state or timestamp. |
| Failed queue publication cannot lose committed work | Commit job/outbox, force SQS adapter failure and publisher crash, restart, then assert eventual publication and one logical downstream effect. |
| Two schedulers cannot claim the same execution | Run concurrent scheduler transactions against Testcontainers PostgreSQL with barriers; assert unique execution/jobs and correct next due time. |
| Redirects/DNS/IP tricks cannot bypass SafeTargetPolicy | Property/adversarial tests for redirects, rebinding, mixed A/AAAA, mapped IPv6, metadata/private/link-local/reserved ranges, numeric encodings, user-info, schemes, ports, and peer mismatch. |
| Out-of-order delivery cannot change deterministic incident history | Permute the same execution facts and compare final incident/event projection and calculation version. |
| One failed region is not automatically a global outage | Generate two- and three-region disagreement sequences; assert quorum rules and visible disagreement evidence. |
| Missing platform evidence is not reported as target success | Drop regional results; assert NO_DATA/coverage reduction and never a passing SLO below coverage threshold. |
| Maintenance cannot rewrite history | Attempt retroactive/unauthorized windows; assert rejection and stable previous calculation. |
| Disabled monitor produces no new work | Disable concurrently with due scheduling; assert transactionally defined cutoff and no jobs after the accepted monitor version. |
| Worker cannot reach control-plane private resources | Application policy tests plus later environment network-denial tests and IAM simulator/policy review. |
| Telemetry cannot leak secrets | Structured-log/trace/metric capture tests with credential-shaped inputs and redaction assertions. |

### 9.3 Operational metrics that prove behavior

At minimum:

- scheduler due lag, batch size, transaction duration, skipped catch-up intervals, and claimed monitors;
- unpublished outbox age/count, publish attempts/failures, lease expiry/reclaims, and destination region;
- job queue age/depth, Lambda duration/error/throttle/concurrency, result-send failures, and DLQ depth;
- result queue age/depth, consumer duration/errors, duplicate messages, duplicate jobs, result conflicts, and late results;
- probe latency/error category by bounded labels, never raw URL;
- finalized UP/DOWN/DISAGREEMENT/NO_DATA counts, incident transition counts, incident detection delay, and evidence coverage;
- HTTP API latency/error/rate limits and authorization failures;
- database pool usage, slow queries, lock wait/transaction duration; and
- telemetry export failures so observability loss is observable.

High-cardinality IDs and target URLs belong in trace/log fields with access control and redaction, not metric labels.

## 10. Three-day implementation order

The order prioritizes proof-bearing backend correctness. The UI is deliberately last.

### Day 1: secure modular core

1. Establish Maven/Java 21/Spring Boot 4.1 and verify the exact Spring Modulith compatible release. If a required dependency forces Boot 3.5, capture the reproduced evidence and amend ADR-002.
2. Create module boundaries and Spring Modulith verification tests.
3. Add PostgreSQL Compose/Testcontainers, Flyway baseline, core constraints, and disabled ORM auto-DDL.
4. Implement identity subject mapping and generated test JWT/mock JWKS resource-server tests.
5. Implement owner-scoped monitor REST API and OpenAPI contract.
6. Implement pure SafeTargetPolicy, resolver/connector ports, adversarial IPv4/IPv6/URI tests, hard limits, and explicit residual-risk documentation.
7. Implement immutable monitor policy snapshots and the pure incident evidence/state machine with property tests.

**Day-1 exit evidence:** module verification passes; migrations run on a clean database; cross-owner mutations fail; SafeTargetPolicy bypass corpus fails closed; generated incident sequences preserve invariants.

### Day 2: concurrency and messaging

1. Implement due scheduling with <code>next_check_at</code>, database time, short SKIP LOCKED transactions, deterministic schedule advancement, catch-up limits, and concurrency tests.
2. Insert regional jobs and outbox events atomically.
3. Implement leased outbox claiming, regional SQS clients, exponential backoff/jitter, and crash-window tests.
4. Add ElasticMQ queues/DLQs and SQS adapter integration tests.
5. Implement pure ProbeEngine plus local/container and Lambda adapters, hard HTTP limits, partial batch responses, and WireMock target simulations.
6. Implement result consumer, durable message/job idempotency, conflict evidence, ordered execution finalization, and incident transitions.
7. Test retries, duplicates, out-of-order results, poison messages, late evidence, and DLQ paths.

**Day-2 exit evidence:** two concurrent schedulers create one logical execution; a post-commit publish failure recovers; duplicate jobs/results cause one logical effect; region disagreement follows the documented policy.

### Day 3: operation, load, infrastructure, and explanation

1. Add Actuator exposure policy, structured logs, Micrometer business metrics, OpenTelemetry Java agent/Collector, Prometheus/Grafana/Tempo, trace propagation through message envelopes, and redaction tests.
2. Build a focused Grafana dashboard for scheduler/outbox/queue/probe/incident/coverage behavior.
3. Run failure-injection scenarios and write one evidence-based postmortem.
4. Run k6 load scenarios, publish exact environment/results, identify the first bottleneck, and avoid production-scale extrapolation.
5. Perform and time a local backup/restore with invariant checks.
6. Write Terraform for the reviewed AWS topology; run formatting, validation, lint/security checks, and a plan that uses no apply.
7. Finish ADRs, threat model, runbook, recovery notes, and learning concept records.
8. Add only the minimum React/Vite operator/status UI needed to demonstrate proven backend behavior.
9. Add owner-authorized, time-bounded JSON/HTML reliability reports from the availability/incident read contracts; add PDF only as a renderer over the exact same tested report model.
10. Optionally, and only with explicit authorization, run a bounded AWS deploy/smoke/destroy exercise with a cost/cleanup checklist. Without authorization, stop at local evidence and Terraform plan.

**Day-3 exit evidence:** the system's failure modes are visible; the plan is reproducible; a restore works locally; infrastructure is reviewable; every portfolio claim points to a test, metric, trace, plan, or documented limitation.

### 10.1 Honest claims after the sprint

If all local work succeeds, Ali may honestly claim:

- designed and implemented a modular Java reliability-control-plane reference;
- used PostgreSQL transactions, row locking, leases, uniqueness, and a transactional outbox to handle concrete concurrency/failure windows;
- designed for Standard SQS at-least-once, duplicate, and out-of-order delivery and tested those logical semantics with an emulator;
- built a pure Java probe engine with explicit SSRF defenses and adversarial tests;
- implemented and property-tested a deterministic multi-region incident policy;
- instrumented the system with business metrics and vendor-neutral traces;
- ran documented load/failure/recovery experiments; and
- authored validated Terraform for the intended AWS topology.

Ali may not claim, without additional evidence:

- production operation, production scale, or a real user workload;
- complete mastery after three days;
- exactly-once delivery from SQS;
- full AWS parity from ElasticMQ;
- a deployed AWS system if no authorized deployment occurred;
- multi-region control-plane/database HA;
- zero downtime, a proven RPO/RTO, or tested regional failover;
- complete SSRF prevention if network egress controls were not deployed and tested;
- security certification, penetration testing, or compliance; or
- cost/performance characteristics not measured in the stated environment.

## 11. Learning evidence map

Every concept should get a compact record in code comments, tests, or an ADR. “Code location” below is a planned destination, not an existing path.

| Concept | Problem it solves here | Planned code location | What breaks without it | Chosen solution | Rejected alternative | Proof/test | Later search terms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Modular monolith | Business boundaries without distributed deployment | control-plane/src/main/java/.../identity, monitors, scheduling, probes, incidents, availability, statuspage | Shared entities/repositories couple everything and make extraction/ownership unclear | Spring Modulith modules and published interfaces | Premature microservices | ApplicationModules.verify and module integration tests | Spring Modulith allowed dependencies, application module canvas |
| Database due scheduling | Safely create recurring work across control-plane replicas | scheduling/.../DueMonitorClaimer | Duplicate/missed executions, drift, long locks | DB time, next_check_at, SKIP LOCKED, unique execution | Quartz/EventBridge for this learning phase | Concurrent barrier test with real PostgreSQL | PostgreSQL SKIP LOCKED work queue, scheduler drift |
| Lease | Recover work after a claimer dies outside a transaction | scheduling/.../OutboxClaimer | Permanent stuck rows or two active publishers | Claim token + locked_until + conditional completion | Hold DB transaction during network call | Expiry/reclaim/crash tests | lease fencing token, compare-and-set |
| Transactional outbox | Remove DB/SQS dual-write loss | scheduling/.../outbox | Committed job can have no message, or message can exist for rolled-back job | Same-transaction outbox + async publisher | Direct send, distributed transaction | Inject failure at every commit/send boundary | transactional outbox relay duplicate publish |
| At-least-once idempotency | Neutralize duplicate queue delivery | probes/.../ResultConsumer; processed_messages | Duplicate facts/incidents/notifications | Durable message and job uniqueness in effect transaction | In-memory dedupe, FIFO reliance | Commit/ack crash and concurrent duplicate tests | idempotent consumer inbox pattern |
| Out-of-order evidence | Keep incident decisions independent of arrival order | incidents/.../ExecutionFinalizer | Late result can incorrectly open/resolve incidents | scheduled_at ordering, deadline, watermark, correction version | Process immediately on arrival | Permutation/property tests | event time vs processing time, watermarks |
| Multi-region quorum | Avoid treating one regional fault as target outage | incidents/.../EvidencePolicy | False incidents and hidden disagreement | Versioned UP/DOWN/DISAGREEMENT/NO_DATA policy | Any-failure-is-down | Generated region combinations | quorum monitoring, split-brain evidence |
| Incident state machine | Make lifecycle legal and explainable | incidents/.../IncidentStateMachine | Resolve-before-open, duplicate events, order-dependent behavior | Pure deterministic transitions + unique keys | Scattered if-statements | Model/property tests | state machine invariants, temporal testing |
| SafeTargetPolicy | Stop workers becoming an internal network proxy | probes-core/.../SafeTargetPolicy | Metadata/internal access, scanning, credential leak | Parse + scheme/port + all-address validation + connect pinning + hard limits | URL regex/blocklist only | DNS/URI/property corpus and peer validation | SSRF DNS rebinding, IPv4-mapped IPv6, RFC 6890 |
| JPA plus JDBC | Keep aggregate code readable while exposing critical SQL | module repositories and scheduling/.../jdbc | ORM hides locks/queries or all-JDBC creates boilerplate | JPA for aggregates; SQL/JDBC for claims/reports | Pure JPA, pure JDBC, early jOOQ | SQL integration and query-plan tests | Spring JdbcClient, JPA locking pitfalls |
| Availability vs SLO | Prevent a target objective being presented as measured uptime | availability/.../AvailabilityCalculator | Misleading dashboards and gamed missing data | Execution SLI + evidence coverage + versioned SLO | Raw success percentage over messages | Table/property tests for maintenance/missing | SLI denominator, error budget, missing data |
| OIDC resource server | Avoid custom credential/JWT security | identity/.../SecurityConfiguration | Forged tokens, unstable identity, tenant leak | Cognito code+PKCE; issuer/audience JWT validation | Custom JWT/passwords | Generated keys/JWKS and negative token matrix | OAuth BCP browser apps, JWT audience validation |
| Vendor-neutral telemetry | Correlate API, schedule, queue, probe, and incident work | runtime config + message trace context | Failure windows cannot be explained | OTel agent/Collector + Micrometer business metrics | AWS-only instrumentation | Trace/log/metric correlation and collector-outage test | OTLP, context propagation messaging |
| Infrastructure state | Make AWS changes reviewable and recoverable | infra/terraform (planned) | Console drift, leaked/lost state, unsafe concurrency | Terraform remote encrypted locked state design | Manual console, state in Git | fmt/validate/plan + backend threat review | Terraform state locking, sensitive state |
| Emulator boundary | Keep local loop free while preserving AWS honesty | compose + queue adapter tests (planned) | False claim that local behavior equals AWS | ElasticMQ plus later authorized real-SQS smoke | LocalStack token dependency or emulator-only confidence | Contract suite against both endpoints | SQS emulator parity, Lambda event source mapping |

### 11.1 Exact learning-note format

Ali's later notes must preserve the same eight fields and keep each field concrete:

> **Concept:** the mechanism, not a vague topic.<br>
> **Problem solved here:** the exact RCP failure, risk, or requirement.<br>
> **Code location:** the smallest owning module/class/migration/test.<br>
> **What breaks without it:** a reproducible scenario, not “best practice.”<br>
> **Chosen solution:** the actual algorithm/constraint/configuration.<br>
> **Rejected alternative:** the closest credible option and why it lost here.<br>
> **Proof/test:** the named test, failure injection, query, trace, metric, or measurement.<br>
> **Later search terms:** compact terms that reopen deeper study.

Do not write “Concept: SQS; used for queues.” A useful record should let Ali reconstruct why the mechanism exists and where to prove it.

#### Worked idempotency example

> **Concept:** Durable idempotent result consumption under at-least-once delivery.<br>
> **Problem solved here:** Lambda can run one job more than once, Standard SQS can redeliver a result, and the central consumer can commit then crash before acknowledgement. None of these should create a second logical result or incident transition.<br>
> **Code location:** planned <code>probes/.../ResultConsumer</code>; Flyway unique constraints for <code>processed_messages(consumer_name, message_id)</code>, <code>probe_results(job_id)</code>, and <code>incident_events(transition_key)</code>; duplicate-delivery integration test.<br>
> **What breaks without it:** message <code>m-1</code> for job <code>j-1</code> inserts a failed result and opens an incident, the consumer commits, then dies before deleting the SQS message. Redelivery repeats the inserts and could create a second result/open event or double notification. A worker retry could also emit new message <code>m-2</code> for the same <code>j-1</code>, bypassing message-ID-only dedupe.<br>
> **Chosen solution:** in one PostgreSQL transaction, claim the consumer message ID, insert the unique job result, derive a deterministic incident transition key, and commit before acknowledgement. Redelivered <code>m-1</code> is stopped by processed-message uniqueness. New <code>m-2</code> for the same job is stopped by result job uniqueness. The same fact becomes a no-op; a different fact is recorded as a conflict and alerted, never overwritten.<br>
> **Rejected alternative:** in-memory “seen IDs,” because restart loses it; Standard SQS/FIFO deduplication alone, because delivery and consumer crash semantics still require idempotent effects; message-ID-only dedupe, because a retried worker can create a new envelope for the same logical job.<br>
> **Proof/test:** force commit followed by simulated acknowledgement failure; redeliver the identical message; concurrently deliver a second message ID for the same job with equal payload and then conflicting payload; assert one accepted result, one legal transition, zero duplicated incident events, one explicit conflict for mismatch, and successful acknowledgement on replay.<br>
> **Later search terms:** idempotent consumer pattern; inbox table; exactly-once effect; commit-ack crash window; SQS at-least-once; natural idempotency key; deterministic event key.

The example also teaches an important distinction: a delivery ID answers “have I processed this envelope?” while a job ID answers “does this logical fact already exist?” Both are needed.

## 12. Interview-defense questions

Ali should be able to answer these without reciting framework slogans:

1. What precise failure window does the transactional outbox close, and why can it still publish duplicates?
2. Why do <code>processed_messages</code> and a unique <code>probe_results.job_id</code> solve different problems?
3. What happens if the result consumer commits and dies before SQS acknowledgement?
4. Why is Standard SQS appropriate, and what would FIFO not solve?
5. Why must the visibility timeout exceed normal processing time, and how do partial batch responses change retries?
6. How are poison messages identified, alarmed, retained, repaired, and safely redriven?
7. How does <code>FOR UPDATE SKIP LOCKED</code> let two schedulers share work, and why is a unique constraint still required?
8. Why must the scheduler transaction avoid network calls?
9. What prevents schedule drift and an unbounded catch-up storm?
10. What is a lease, how is it reclaimed, and why is a claim token/fencing check useful?
11. Which facts belong to the worker, and which decisions belong only to the incident engine?
12. How can two regional failures and one success be represented without hiding disagreement?
13. Why are event time, processing time, result deadline, and watermark separate?
14. How do duplicate and out-of-order results produce the same incident history?
15. Why is measured availability not the SLO, and exactly what enters the denominator?
16. How does missing monitoring evidence avoid making uptime look better?
17. Why are retroactive maintenance exclusions dangerous?
18. Why can a URL pass API validation and still be unsafe at connection time?
19. How are DNS rebinding, mixed A/AAAA answers, redirects, alternate IP encodings, and IPv4-mapped IPv6 handled?
20. What residual SSRF risks remain, and what does network egress isolation add?
21. Why must regional workers have no RDS path or control-plane secret permissions?
22. Why use Java 21 when Java 25 is also LTS?
23. What exact evidence would force Spring Boot 4.1 to fall back to 3.5?
24. Why combine JPA and handwritten SQL rather than selecting one universally?
25. What problem does Spring Modulith solve that packages alone do not prove?
26. What evidence would justify extracting a module into a service?
27. Why Lambda for probes and Fargate for the control plane?
28. What does ElasticMQ prove, and which AWS behaviors does it not prove?
29. Why does geographic probing not make the control plane multi-region HA?
30. What RPO/RTO and data-conflict decisions are missing for true multi-region operation?
31. How do OpenTelemetry traces and business metrics complement rather than replace each other?
32. What is stored in Terraform state, why can it be sensitive, and how will it be locked and protected?
33. Which test or measurement supports every performance, reliability, and security claim on the résumé?

### 12.1 Interview defense rubric

Ali's answer should cover more than the happy path. For any component he presents, use this checklist:

| Lens | What Ali should be able to state exactly | RCP example |
| --- | --- | --- |
| Responsibility | What the component owns, consumes, emits, and is forbidden to decide/access | Worker owns bounded probe facts; incident engine owns global decisions; worker cannot access RDS |
| Data flow | Identifier, transaction/ack boundary, source of truth, and next hop | execution_id/job_id created in DB transaction → outbox → regional SQS → result message → idempotent DB commit |
| Alternatives | Closest credible alternative, why it lost now, and trigger to revisit | EventBridge is managed-scale alternative; DB scheduler chosen for transactions/local learning |
| Failure | Named crash/timeout/duplicate/order/partial-failure window and expected state afterward | SQS send succeeds then outbox publisher dies; duplicate is allowed, job effect stays unique |
| Diagnosis | Metric/trace/log/query that distinguishes competing causes | Oldest-message age + outbox age + trace span distinguishes queue backlog from target latency |
| Correctness test | Durable invariant and test setup, not only unit-test count | Two scheduler transactions released together create one execution via lock + unique constraint |
| Concurrency | Contended resource, isolation/lock/lease, fencing/backstop, and starvation/fairness risk | SKIP LOCKED due rows, bounded batch, unique execution, measured due lag |
| Overload | Where backpressure appears, how concurrency/rate is capped, and degradation behavior | SQS absorbs burst; Lambda reserved concurrency and per-target cap prevent probe amplification |
| Security | Trust boundary, attacker input, least privilege, defense in depth, and residual risk | User URL crosses into worker egress; SafeTargetPolicy plus network denial; DNS/client residuals remain |
| Measurement | Exact workload/environment, signal, result, and inference limit | k6 on named laptop/container config finds first local bottleneck; no AWS-scale extrapolation |
| Redesign | Which changed constraint would invalidate the choice and the first design change | Long continuously busy probes may move Lambda adapter to ECS while retaining ProbeEngine |

A strong answer has the shape: “I owned X; input crossed boundary Y; failure Z leaves durable state Q; test/telemetry P proves it; alternative A lost because B; under changed constraint C I would redesign D.” If Ali cannot produce that chain, the topic needs a smaller rebuild or failure exercise.

## 13. ADR backlog

Each ADR will contain context, decision, alternatives, consequences, verification, rollback/reconsideration trigger, and status. These candidates are numbered now so implementation discussions have stable references.

1. **ADR-001 — Java runtime and distribution:** Java 21, Eclipse Temurin or equivalent permissive OpenJDK; optional Java 25 compatibility CI.
2. **ADR-002 — Spring Boot baseline:** Boot 4.1 current line; evidence-required fallback to current 3.5; record Spring Modulith compatibility.
3. **ADR-003 — Modular monolith:** one Spring control-plane deployable with Spring Modulith boundaries; extraction criteria.
4. **ADR-004 — PostgreSQL source of truth:** RDS PostgreSQL, relational invariants, JPA/SQL split, and analytics-store triggers.
5. **ADR-005 — Database due scheduler:** next_check_at, database time, SKIP LOCKED, unique executions, catch-up and fairness policy.
6. **ADR-006 — Transactional outbox:** atomic intent, leased relay, ordering scope, retries, quarantine, retention, and duplicate publication.
7. **ADR-007 — Standard SQS semantics and topology:** per-region job queues/DLQs, central result queue/DLQ, at-least-once contracts, visibility, partial batches, and redrive.
8. **ADR-008 — Lambda probes and ECS control plane:** compute split, time/concurrency limits, pure ProbeEngine adapters, and result deadline/late-correction policy.
9. **ADR-009 — Central-region boundary:** single-region authority, explicit non-HA claim, failure behavior, and prerequisites for multi-region control-plane work.
10. **ADR-010 — Cognito/OIDC authorization:** code + S256 PKCE, access-token validation, scopes, subject mapping, local JWKS, and public status boundary.
11. **ADR-011 — SSRF and abuse controls:** SafeTargetPolicy, port/query/redirect policy, DNS-to-connect pinning, egress network design, limits, and residual risk.
12. **ADR-012 — Observability:** Actuator/Micrometer signals, OTel agent/Collector, local and AWS backends, cardinality/redaction, and telemetry failure behavior.
13. **ADR-013 — Terraform and state:** module/environment layout, remote encrypted versioned/locked state, secrets, plans, provider pinning, apply authority, and teardown.
14. **ADR-014 — Local AWS emulation:** ElasticMQ default due current LocalStack auth requirement, parity limits, and authorized real-SQS contract smoke.

## 14. Open review gates before implementation

Ali should explicitly accept or amend these consequential policy choices:

- initial two-region minimum and majority quorum for automatic incidents;
- two consecutive finalized DOWN to open and two UP to resolve;
- result collection deadline and late-evidence correction behavior;
- initial default-port-only policy;
- initial query-string rejection;
- redirects disabled;
- GET/optional HEAD semantics and success-status configuration;
- evidence-coverage threshold for publishing an SLO result;
- minimum check interval and per-target concurrency/rate limits;
- retention periods for raw facts, idempotency records, audit events, and DLQs;
- exact AWS central and probe regions, if any deployment is later authorized;
- probe network egress design and cost;
- Terraform remote-state bootstrap and ownership; and
- whether an authorized real-SQS smoke test or AWS deploy/destroy is in scope after local proof.

Defaults can be changed during review, but they cannot remain implicit.

## 15. Traceability: question and decision coverage

This table is the review index. Ali can use it months later to verify that a planning question was answered with a decision, evidence boundary, and location rather than lost in a summary.

| Major question or required decision | Primary section(s) | Verification cue |
| --- | --- | --- |
| What is RCP and what problem does it solve? | Section 2, Product and learning goal; Section 3.5, step-by-step flow | Product capabilities and one concrete monitor story both exist |
| Is one large AI-assisted flagship a good preparation plan? | Section 2.1 | Separates AI-accelerated reference from retained mastery and gives the deepen-later loop |
| Can it be done in three days? | Sections 2.2, 10, and 10.1 | Lists producible evidence, impossible claims, daily exits, and claim boundaries |
| How is “build wide and aggressively, deepen later” kept honest? | Sections 2.1 and 2.2; Section 11 | Advanced topics remain attached to proof or an explicit unproven label, followed by clean-room/deepening work |
| What happens from monitor creation to persistence? | Section 3.5, Steps 1–2; Section 7 | Controller → Service → Repository → PostgreSQL responsibilities and invariants are explicit |
| How does due scheduling work under concurrency? | Sections 3.5 Step 2, 5.2, 9.2, ADR-005 | Short transaction, DB time, SKIP LOCKED, unique backstop, catch-up, and concurrent test |
| Why is an outbox needed and what does it not guarantee? | Sections 3.5 Step 3, 5.3, 9.2, ADR-006 | Dual-write crash table and duplicate-publication consequence |
| How do regional queue delivery and probe execution work? | Sections 3.3, 3.5 Steps 3–4, and 5.4 | Actual regional queues/Lambdas, bounded ProbeEngine, retry/partial-batch/DLQ semantics |
| How are results ingested despite duplicates and order changes? | Sections 3.5 Step 5, 5.5, 11.1 | Message and job uniqueness, commit/ack boundary, conflict handling, worked idempotency example |
| How are incidents opened/resolved? | Sections 3.5 Step 6 and 5.7 | Quorum, disagreement, deadline, ordered state diagram, transition keys, timestamps |
| How are dashboard and public status responsibilities separated? | Sections 3.5 Step 7, 3.2, 6.5, and 7 | Thin private operator UI and explicit anonymous projection |
| How are availability, SLO, maintenance, and missing checks defined? | Sections 3.5 Step 8 and 5.8 | Exact denominator, separate evidence coverage, prospective maintenance, versioned corrections |
| How are reliability reports produced without inventing measurements? | Sections 2, 3.5 Step 9, 7, and 10 Day 3 | One versioned report model, explicit window/coverage/policy/source watermark, JSON/HTML first, PDF rendering only |
| How does RCP monitor itself? | Sections 3.5 Step 10, 3.2, 9.3, and ADR-012 | Actuator/Micrometer/OTel signals and operational metrics |
| Which technologies run locally and which run on AWS? | Sections 3.2, 4, and 4.1 | Responsibility-by-responsibility mapping plus non-parity column |
| What is the control plane versus worker/data plane? | Sections 3.3, 4.2, and 5.6 | Decides/remembers versus executes/reports facts; queues are transport |
| Why is AWS meaningful rather than decorative? | Section 4.3 | Names platform behaviors/IAM/regions to prove, plus bounded real-AWS sequence |
| Why must development remain local-first? | Sections 4 and 4.3 | Deterministic, free, repeatable failure loop precedes platform adapter proof |
| Why did probes change from ECS workers to Lambda? | Sections 4.4 and 8.1 | Workload-shape argument, Lambda costs/limits, ECS reconsideration trigger, pure core exit |
| Why did local messaging change from LocalStack to ElasticMQ? | Sections 4, 4.4, 8.1, ADR-014 | Current auth-token fact, narrow SQS need, emulator limits, later real-SQS smoke |
| Why are geographic probes not multi-region control-plane HA? | Sections 3.4, 4.2, 10.1, ADR-009 | Central failure boundary and full RPO/RTO/replication/conflict/failover prerequisites |
| What are the core correctness/failure semantics? | All of Section 5 | Source of truth, IDs, scheduler, outbox, delivery, ingestion, facts, incident, availability |
| How are at-least-once delivery, retries, DLQs, visibility, and poison messages handled? | Sections 5.1, 5.3–5.5, and 9 | Bounded retry/visibility/partial batch/redrive/idempotency and failure tests |
| What is the Day-1 SSRF architecture? | All of Section 6, especially 6.2–6.4; ADR-011 | Exact SafeTargetPolicy, DNS-to-connect binding, network egress, abuse limits, residual risk |
| How are authentication, ownership, and secrets handled? | Sections 3.2, 6.5–6.6, and 9.2 | Cognito PKCE, JWT issuer/audience, trusted subject, negative ownership tests, least privilege |
| Which modules and data/invariants are proposed? | All of Section 7 | Seven business modules plus constrained tables/immutable versions |
| Why each chosen technology and why not alternatives? | Section 8.1 | Full chosen/why/rejected/fallback matrix, not a summary list |
| When should excluded technologies be reconsidered? | Section 8.2 | One explicit trigger row for every named excluded technology |
| What is explicitly not being built? | Section 8.3 | Product, security, scale, platform, and UX non-goals plus how a non-goal can re-enter |
| Which tests/invariants prove the design? | All of Section 9 | Test layers, required invariant table, metrics, load/failure/recovery/IaC checks |
| What is the exact three-day implementation order? | Section 10 | Day 1 secure core, Day 2 concurrency/messaging, Day 3 operations/evidence/UI last |
| What may and may not be claimed after the sprint? | Sections 2.2 and 10.1 | Explicit allowed and forbidden claims |
| What exact learning-note format should Ali use? | Section 11.1 | Eight labelled fields plus a fully worked idempotency record |
| What must Ali defend in interviews? | Sections 12 and 12.1 | Detailed questions plus responsibility/data-flow/failure/diagnosis/redesign rubric |
| What do the core terms mean? | Section 4.5 | Plain-language glossary and “must not become” guardrail |
| Which formal ADRs remain to write? | Section 13 | Numbered candidates cover runtime through local emulation |
| Which choices still require Ali's review? | Section 14 | Explicit gates for quorum, security policy, retention, AWS regions/network/state/authority |
| Which current primary references validate the plan? | Section 16 | Dated primary sources; source evidence is not implementation evidence |
| Does this document claim code or AWS already exists? | Section 1 and Section 10.1 | Planning-only status, empty initial workspace, no external action, explicit claim prohibitions |

## 16. Sources and validation notes

Primary references were checked on 2026-08-14. They support the architectural semantics; they do not prove an RCP implementation.

- [Oracle Java SE Support Roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html) — identifies Java 21 and 25 as LTS releases and documents support/licensing timelines.
- [Spring Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html) — current page identifies Spring Boot 4.1.0, Java 17 minimum and compatibility through Java 26, plus supported Maven/Gradle ranges.
- [Spring Modulith reference](https://docs.spring.io/spring-modulith/reference/) and [compatibility appendix](https://docs.spring.io/spring-modulith/reference/appendix.html#compatibility-matrix) — module verification, events/testing, and compatibility information. The exact compatible version will be verified through dependency resolution and tests on Day 1.
- [PostgreSQL SELECT and locking clauses](https://www.postgresql.org/docs/current/sql-select.html) — row-locking behavior and <code>SKIP LOCKED</code>; the documentation notes that skipping locked rows gives an inconsistent view appropriate to queue-like access, not general reads.
- [Amazon SQS Standard queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html) — at-least-once delivery, possible duplicates, and occasional out-of-order arrival.
- [AWS transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — dual-write motivation, same-transaction outbox, duplicate publication, ordering, and idempotent consumers.
- [Using AWS Lambda with Amazon SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html) — polling/batches, visibility, at-least-once processing, idempotency, and partial batch responses.
- [AWS Fargate or AWS Lambda decision guide](https://docs.aws.amazon.com/decision-guides/latest/fargate-or-lambda/fargate-or-lambda.html) — runtime, duration, event-driven scaling, networking, and cost trade-offs.
- [Amazon EventBridge Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html) — managed large-scale one-time/recurring schedules, retries, flexible windows, targets, and at-least-once delivery.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — application and network defense in depth, redirect risk, IPv4/IPv6/domain validation, DNS pinning, and the difficulty of arbitrary external URLs.
- [OpenTelemetry Java documentation](https://opentelemetry.io/docs/languages/java/) and [Java agent](https://opentelemetry.io/docs/zero-code/java/agent/) — Java instrumentation ecosystem and zero-code agent path.
- [Terraform state](https://developer.hashicorp.com/terraform/language/state) — state purpose, local-state risk, remote backend recommendation, locking/access control, and possible secret exposure.
- [Testcontainers LocalStack module](https://java.testcontainers.org/modules/localstack/) — states that starting 2026-03-23 the LocalStack image requires <code>LOCALSTACK_AUTH_TOKEN</code>.
- [ElasticMQ project](https://github.com/softwaremill/elasticmq) — documents its SQS-compatible interface, visibility behavior, possible duplicate delivery, Docker/embedded modes, and subset/emulator boundary.
- [AWS Well-Architected Reliability Pillar](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html) — resilient foundations, change management, failure recovery, and explicit architecture trade-offs.
- [Amazon Cognito authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html) — authorization-code recommendation, S256 PKCE, state, callback constraints, and audience/resource binding.
- [Spring Security OAuth2 Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) — issuer/JWKS discovery and JWT signature/issuer/time validation path.
- [Amazon SQS dead-letter queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html) — redrive count, diagnosis, alarms, and retention guidance.

### Final review principle

The architecture is valuable only if its claims remain attached to evidence. A green build proves compilation/tests, an emulator proves only the exercised contract, a Terraform plan proves only a proposed change graph, geographic workers prove only distributed observation, and a three-day sprint proves a focused reference implementation—not production reliability or mastery.
