# RCP local operator runbook

Scope: the Docker Compose + Spring `local` profile only. This is a diagnostic guide for the reference implementation, not an AWS operations procedure. PostgreSQL is authoritative; SQS/ElasticMQ carries messages. Do not delete Compose volumes, purge queues, edit result/incident rows, or redrive a DLQ as a first response. Preserve evidence before attempting recovery.

## Establish what is running

From the repository root, check `docker compose ps`, `date -u`, and `docker compose exec -T postgres date -u`. The two clocks should be close; large Docker Desktop skew can make checks look late or expired. Check Spring's readiness endpoint with `curl -i http://localhost:8080/actuator/health/readiness`. The local Prometheus target at `http://localhost:9090/targets` and Grafana `RCP Overview` at `http://localhost:3000/d/rcp-overview` show whether telemetry is arriving. A green HTTP endpoint alone does not prove the scheduler, queues, or incident processor are keeping up.

The dashboard's snapshot-age panel matters: database-backed gauges retain their last values if refresh fails. Treat stale gauges as unknown, not zero backlog. Search structured application logs by `executionId`, then `jobId` and `eventId`; use `trace.id` only as supplemental correlation because traces can be absent or expired.

## Locate the stuck stage

Use the system gauges before drawing a target-health conclusion:

| Observation | Likely stage | Read-only next check |
| --- | --- | --- |
| Due monitors rise, but executions do not | Scheduler loop or database claim | Check Spring logs for scheduling failures and compare host/database clocks. |
| Pending/oldest outbox rise | Publisher or regional job queue | Inspect `outbox_events` attempts, claims, `last_error`, and queue/container health. Committed work has not vanished. |
| Pending executions rise | Job delivery, worker, result delivery, or deadline finalization | Follow one `execution_id` through `probe_jobs`, `probe_results`, and application logs. Missing results are not automatically target downtime. |
| Finalized executions awaiting incident evaluation rise | Incident processing | Inspect incident processor errors; do not manually open or resolve an incident. |
| Failed outbox or any DLQ grows | Bounded retries exhausted or poison message | Preserve message IDs/payload and error logs. Determine whether the cause is transient, a contract bug, or unsafe data before planning replay. |
| Public status is stale/unknown while backend health is green | Evidence freshness or publication projection | Compare latest finalized execution, open incident, behavior version, and database time. A known open incident should remain `OUTAGE`. |

For a direct read-only database snapshot, run `docker compose exec -T postgres psql -U rcp -d rcp` and then:

```sql
SELECT clock_timestamp() AS database_now;
SELECT COUNT(*) AS due_monitors FROM monitors
WHERE enabled AND next_check_at <= clock_timestamp();
SELECT COUNT(*) AS pending_executions FROM probe_executions WHERE status = 'PENDING';
SELECT COUNT(*) AS pending_outbox FROM outbox_events
WHERE published_at IS NULL AND failed_at IS NULL;
SELECT event_id, destination_region, attempt_count, next_attempt_at,
       claimed_until, failed_at, last_error
FROM outbox_events
WHERE published_at IS NULL
ORDER BY created_at DESC LIMIT 20;
```

Do not paste target URLs, queue payloads, JWTs, or database credentials into a public issue or postmortem. The local database uses development credentials only.

Before applying migration V9 to a persisted local database, this read-only preflight should return zero. A nonzero count means historical result identity disagrees with its execution snapshot; preserve a backup and investigate instead of deleting rows to force startup:

```sql
SELECT COUNT(*) AS mismatched_results
FROM probe_results results
JOIN probe_executions executions USING (execution_id)
WHERE results.monitor_id <> executions.monitor_id
   OR results.scheduled_at <> executions.scheduled_at
   OR results.monitor_behavior_version <> executions.monitor_behavior_version;
```

## Recovery boundaries

1. If dependencies are down, inspect `docker compose logs --tail=100 postgres elasticmq` and restore the failed service without removing its volume. Restarting Spring after its dependencies recover is reversible; verify that outbox and pending-execution gauges begin draining.
2. If the publisher is failing, fix the cause and let the existing retry/lease logic work. A published outbox event may be delivered twice; consumers must remain idempotent. Do not mark a row published by hand.
3. If a DLQ contains messages, capture the count, message IDs, relevant logs, and reason first. There is no tested operator redrive workflow in this repository. Replay or purge needs a reviewed procedure and an idempotency check, not an improvised command.
   A result with a mismatched job, region, monitor, scheduled time, or behavior version fails a database constraint and remains unacknowledged for bounded retries; inspect the structured `sqsMessageId`/error type, not the raw payload in shared logs.
4. If the source database is suspect, stop writes before recovery decisions. The [local restore exercise](../README.md#exercise-local-backup-and-restore) restores into a separate temporary database and does not overwrite the live Compose volume. It is not an RDS restore or an RPO/RTO guarantee.
5. If probes report `UNSAFE_TARGET`, investigate the URL and DNS answers. This is observer/security evidence, not a proof that the target is down. Never bypass SafeTargetPolicy to make a dashboard green.

For a reproducible local incident drill, use the authenticated fault-injection steps in the [README](../README.md#exercise-incident-opening-and-recovery). Record the start/end times, monitor and execution IDs, expected and actual transitions, and whether metrics/logs showed the cause. The local region names are simulated; this drill does not prove geographic execution or AWS resilience.
