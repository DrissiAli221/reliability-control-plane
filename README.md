# Reliability Control Plane

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

## Run locally

Requirements: Docker Desktop, Java 21, `curl`, and `jq`.

Start PostgreSQL and ElasticMQ from the repository root:

```bash
docker compose up -d
docker compose ps
```

The project uses host port `15432` for PostgreSQL to avoid common collisions with locally installed databases. ElasticMQ exposes its SQS-compatible API on `9324`.

In the first terminal, download the OpenTelemetry Java agent and start Spring Boot with tracing plus an ephemeral local JWT signing secret:

```bash
cd rcp-control-plane
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
./mvnw dependency:copy \
  -Dartifact=io.opentelemetry.javaagent:opentelemetry-javaagent:2.25.0 \
  -DoutputDirectory=target/otel \
  -Dmdep.stripVersion=true
export RCP_LOCAL_JWT_SECRET="$(openssl rand -base64 48)"
export OTEL_SERVICE_NAME=rcp-control-plane
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_METRICS_EXPORTER=none
export OTEL_LOGS_EXPORTER=none
./mvnw spring-boot:run \
  -Dspring-boot.run.profiles=local \
  -Dspring-boot.run.jvmArguments="-javaagent:target/otel/opentelemetry-javaagent.jar"
```

The `local` profile applies Flyway migrations, enables the control-plane processing loops, and starts local adapters for the two configured probe queues. The Java agent instruments supported libraries without coupling domain code to a tracing vendor. If `mvn clean` removes `target`, repeat the agent download command. The local token issuer exists only in this profile; AWS will use Cognito/OIDC instead.

In a second terminal, request a one-hour development JWT:

```bash
export RCP_TOKEN="$(curl -fsS -X POST http://localhost:8080/local/token | jq -r .accessToken)"
```

Create a monitor. Use a public endpoint you are authorized to probe; localhost and private/reserved addresses are intentionally rejected by the SSRF policy.

```bash
curl -fsS -X POST http://localhost:8080/api/monitors \
  -H "Authorization: Bearer $RCP_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Local proof",
    "targetUrl": "https://example.com/",
    "checkIntervalSeconds": 30,
    "timeoutMs": 5000
  }' | jq
```

After a few seconds, inspect the finalized regional verdict and incident state:

```bash
curl -fsS http://localhost:8080/api/monitors \
  -H "Authorization: Bearer $RCP_TOKEN" | jq
```

## Exercise incident opening and recovery

The local profile has an authenticated fault-injection control. It changes only the local HTTP adapter and is absent from non-local profiles. `HTTP_503` makes both simulated regional workers report a real HTTP 503 fact without weakening URL validation.

```bash
curl -fsS -X PUT http://localhost:8080/api/local/probe-fault \
  -H "Authorization: Bearer $RCP_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"mode":"HTTP_503"}' | jq
```

After two scheduled checks, the incident state becomes `OPEN`. Restore real network probing:

```bash
curl -fsS -X PUT http://localhost:8080/api/local/probe-fault \
  -H "Authorization: Bearer $RCP_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"mode":"PASS_THROUGH"}' | jq
```

Two subsequent `UP` checks resolve the incident. Other supported modes are `CONNECTION_FAILURE`, `REQUEST_TIMEOUT`, and `RESPONSE_TOO_LARGE`.

Useful diagnostics:

```bash
curl -fsS http://localhost:8080/actuator/health | jq
curl -fsS http://localhost:8080/actuator/metrics \
  -H "Authorization: Bearer $RCP_TOKEN" | jq
docker compose logs -f elasticmq postgres
```

## Observe the reliability pipeline

Compose also starts Prometheus, Grafana, an OpenTelemetry Collector, and Tempo. Prometheus scrapes the local-only `/actuator/prometheus` endpoint every five seconds, the collector receives OTLP traces from the Java agent and forwards them to Tempo, and Grafana provisions both data sources automatically.

- Grafana: <http://localhost:3000/d/rcp-overview>
- Grafana Explore for traces: <http://localhost:3000/explore>
- Prometheus targets: <http://localhost:9090/targets>
- Raw application metrics: <http://localhost:8080/actuator/prometheus>

The dashboard separates event counters from current-state gauges. Counters answer “how much work has passed through?” while gauges expose current pressure: pending outbox events, their oldest age, pending executions, unevaluated incident decisions, and open incidents. The snapshot-age panel turns red when the database-backed gauges stop refreshing, so a stale dashboard cannot silently look healthy.

The Prometheus endpoint is unauthenticated only in the `local` Spring profile so the container can scrape the host application. Non-local profiles continue to require authentication; production metrics should additionally be isolated through private networking.

Local application logs use Spring Boot's ECS JSON format. Lifecycle messages carry stable business correlation fields such as `executionId`, `jobId`, `eventId`, `monitorId`, region, verdict, and incident transition; agent-instrumented operations also carry `trace.id` and `span.id`. Search by `executionId` across queue boundaries, and use `trace.id` to inspect one instrumented runtime path in Grafana Explore. Choose the Tempo data source and run this TraceQL query:

```text
{ resource.service.name = "rcp-control-plane" }
```

Trace context is diagnostic metadata, not source-of-truth state. The durable execution/job/event IDs remain the reliable way to correlate asynchronous work after retries, duplicates, restarts, or trace retention expiry.

Stop Spring Boot with `Ctrl+C`. Stop the dependency containers without deleting PostgreSQL data:

```bash
docker compose down
```

## Delivery semantics

- PostgreSQL is the source of truth; queues transport work.
- A worker deletes a probe job only after its result has been published.
- The control plane deletes a result message only after PostgreSQL stores it or recognizes it as a duplicate.
- A crash between publication and acknowledgement can create duplicates, so database uniqueness and durable idempotency remain required.
- Every queue has a dead-letter queue with a five-receive redrive threshold.

ElasticMQ proves the local SQS-shaped flow, not AWS IAM, Lambda event-source mapping, cross-region routing, quotas, or redrive parity. Those require a separately authorized real-AWS smoke test.
