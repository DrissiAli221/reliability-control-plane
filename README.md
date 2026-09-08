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

In the first terminal, start Spring Boot with an ephemeral local JWT signing secret:

```bash
cd rcp-control-plane
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
export RCP_LOCAL_JWT_SECRET="$(openssl rand -base64 48)"
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

The `local` profile applies Flyway migrations, enables the control-plane processing loops, and starts local adapters for the two configured probe queues. The local token issuer exists only in this profile; AWS will use Cognito/OIDC instead.

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

Useful diagnostics:

```bash
curl -fsS http://localhost:8080/actuator/health | jq
curl -fsS http://localhost:8080/actuator/metrics \
  -H "Authorization: Bearer $RCP_TOKEN" | jq
docker compose logs -f elasticmq postgres
```

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
