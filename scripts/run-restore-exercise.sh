#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
results_dir="$repo_root/artifacts/recovery-tests/$run_id"
temporary_dir="$(mktemp -d)"
restore_container=""

cleanup() {
    if [[ -n "$restore_container" ]]; then
        docker stop "$restore_container" >/dev/null 2>&1 || true
    fi
    rm -f "$temporary_dir/rcp.dump"
    rmdir "$temporary_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if curl -fsS --max-time 2 http://localhost:8080/actuator/health >/dev/null 2>&1; then
    echo "Stop the local Spring application before the exact-count restore exercise." >&2
    exit 1
fi

count_query='
SELECT
    (SELECT COUNT(*) FROM flyway_schema_history WHERE success),
    (SELECT COUNT(*) FROM monitors),
    (SELECT COUNT(*) FROM probe_executions),
    (SELECT COUNT(*) FROM probe_jobs),
    (SELECT COUNT(*) FROM probe_results),
    (SELECT COUNT(*) FROM incidents),
    (SELECT COUNT(*) FROM incident_events),
    (SELECT COUNT(*) FROM outbox_events);
'

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
start_seconds="$(date +%s)"
source_before="$(docker compose -f "$repo_root/compose.yaml" exec -T postgres \
    psql -U rcp -d rcp -Atc "$count_query")"
docker compose -f "$repo_root/compose.yaml" exec -T postgres \
    pg_dump -U rcp -d rcp -Fc > "$temporary_dir/rcp.dump"
source_after="$(docker compose -f "$repo_root/compose.yaml" exec -T postgres \
    psql -U rcp -d rcp -Atc "$count_query")"

if [[ "$source_before" != "$source_after" ]]; then
    echo "Source row counts changed during backup; stop all writers and retry." >&2
    exit 1
fi

restore_container="$(docker run --rm -d \
    -e POSTGRES_USER=rcp \
    -e POSTGRES_PASSWORD=rcp-local-only \
    -e POSTGRES_DB=rcp \
    postgres:17.6)"

ready=false
for attempt in {1..30}; do
    if docker exec "$restore_container" pg_isready -U rcp -d rcp >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo "Temporary PostgreSQL did not become ready." >&2
    exit 1
fi

docker cp "$temporary_dir/rcp.dump" "$restore_container:/tmp/rcp.dump" >/dev/null
docker exec "$restore_container" pg_restore -U rcp -d rcp \
    --no-owner --no-acl /tmp/rcp.dump
restored_counts="$(docker exec "$restore_container" \
    psql -U rcp -d rcp -Atc "$count_query")"

if [[ "$source_before" != "$restored_counts" ]]; then
    echo "Restored row counts differ from the quiescent source snapshot." >&2
    echo "Source:   $source_before" >&2
    echo "Restored: $restored_counts" >&2
    exit 1
fi

orphan_count="$(docker exec "$restore_container" psql -U rcp -d rcp -Atc "
SELECT
    (SELECT COUNT(*) FROM probe_jobs jobs
     LEFT JOIN probe_executions executions ON executions.execution_id = jobs.execution_id
     WHERE executions.execution_id IS NULL)
  + (SELECT COUNT(*) FROM probe_results results
     LEFT JOIN probe_jobs jobs ON jobs.job_id = results.job_id
     WHERE jobs.job_id IS NULL)
  + (SELECT COUNT(*) FROM incidents incidents
     LEFT JOIN monitors monitors ON monitors.monitor_id = incidents.monitor_id
     WHERE monitors.monitor_id IS NULL);
")"
if [[ "$orphan_count" != "0" ]]; then
    echo "Restored database has $orphan_count orphaned core rows." >&2
    exit 1
fi

IFS='|' read -r migration_count monitor_count execution_count job_count result_count \
    incident_count event_count outbox_count <<< "$restored_counts"
duration_seconds="$(( $(date +%s) - start_seconds ))"
mkdir -p "$results_dir"
report="$results_dir/report.md"
{
    printf '# RCP isolated local restore exercise\n\n'
    printf 'Started: %s\n\n' "$started_at"
    printf '**PASS** — a PostgreSQL 17.6 custom-format backup restored into a fresh temporary container.\n\n'
    printf '| Restored table | Rows |\n|---|---:|\n'
    printf '| Successful Flyway migrations | %s |\n' "$migration_count"
    printf '| Monitors | %s |\n' "$monitor_count"
    printf '| Probe executions | %s |\n' "$execution_count"
    printf '| Probe jobs | %s |\n' "$job_count"
    printf '| Probe results | %s |\n' "$result_count"
    printf '| Incidents | %s |\n' "$incident_count"
    printf '| Incident events | %s |\n' "$event_count"
    printf '| Outbox events | %s |\n' "$outbox_count"
    printf '\nSource counts remained stable during backup and matched restored counts. Core orphan checks returned zero.\n'
    printf 'Elapsed local exercise time: %s seconds. The temporary container and dump were removed.\n\n' "$duration_seconds"
    printf 'This does not prove an RDS snapshot restore, production RPO/RTO, failover, or application startup against the restored database.\n'
} > "$report"

printf 'Restore exercise PASS; report: %s\n' "$report"
