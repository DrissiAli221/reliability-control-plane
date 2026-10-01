# Reliability Control Plane

The [implementation status](docs/implementation-status.md) separates working code from architecture decisions and unverified AWS plans. Do not treat [the original architecture plan](docs/architecture-decisions.md) as a list of completed features.
For local failure triage, use the [operator runbook](docs/local-operator-runbook.md).
The [threat model](docs/threat-model.md) records the trust boundaries and deployment security gates; it does not claim those gates have been met.
The [OpenAPI contract](docs/openapi.yaml) covers the implemented HTTP endpoints; the [local fault-drill postmortem](docs/local-fault-drill-postmortem.md) records one simulated incident and its proof boundary.
The [accepted ADRs](docs/accepted-adrs.md) record the choices and reconsideration triggers separately from the original plan.

RCP accepts HTTP(S) monitors, schedules one probe job per configured region, transports work through SQS-compatible queues, evaluates regional evidence, and maintains availability and incident state in PostgreSQL.

The local profile runs the real control-plane pipeline with PostgreSQL and ElasticMQ. For convenience, local probe adapters run in the same JVM; the AWS design replaces them with isolated regional Lambda workers. Region names in local logs are simulation labels, not evidence of geographic execution.

```text
POST /api/monitors
        |
        v
   PostgreSQL <----- source of truth
        |
   due scheduler
        |
 transactional outbox
        |
        +----> probe-jobs-eu-west-1 ----> local worker ---+
        |                                                |
        +----> probe-jobs-us-east-1 ----> local worker ---+--> probe-results
                                                                  |
                                                                  v
                                                        idempotent ingestion
                                                                  |
                                                   verdict + incident policy
                                                                  |
                                                  dashboard/status queries
```

## Run it locally

The full local guide (dependencies, the pipeline end to end, fault drills, observability, load and restore exercises) is in [docs/local-development.md](docs/local-development.md).
