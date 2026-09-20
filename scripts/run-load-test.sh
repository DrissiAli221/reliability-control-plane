#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
local_base_url="${RCP_LOCAL_BASE_URL:-http://localhost:8080}"
container_base_url="${RCP_LOAD_BASE_URL:-http://host.docker.internal:8080}"
rate="${RCP_LOAD_RATE:-10}"
duration="${RCP_LOAD_DURATION:-40s}"
p95_limit_ms="${RCP_LOAD_P95_LIMIT_MS:-500}"
run_id="$(date -u +%Y%m%dT%H%M%SZ)"
results_dir="$repo_root/artifacts/load-tests/$run_id"

curl -fsS --max-time 5 "$local_base_url/actuator/health" >/dev/null || {
    echo "RCP is not healthy at $local_base_url" >&2
    echo "Start Docker Compose and the local Spring profile before running this script." >&2
    exit 1
}

token="$(curl -fsS -X POST "$local_base_url/local/token" | jq -r '.accessToken // empty')"
if [[ -z "$token" ]]; then
    echo "The local token endpoint did not return an access token." >&2
    exit 1
fi

monitors="$(curl -fsS "$local_base_url/api/monitors" -H "Authorization: Bearer $token")"
monitor_id="${RCP_MONITOR_ID:-$(jq -r '.[0].id // empty' <<<"$monitors")}" # Allow an explicit owned monitor.
if [[ -z "$monitor_id" ]]; then
    echo "No owned monitor exists. Create one before running the load test." >&2
    exit 1
fi

read_metric() {
    local metric_name="$1"
    local metrics_payload="$2"
    awk -v name="$metric_name" '
        $1 ~ ("^" name "(\\{|$)") { total += $2; found = 1 }
        END { if (found) print total; else print 0 }
    ' <<<"$metrics_payload"
}

before_metrics="$(curl -fsS "$local_base_url/actuator/prometheus")"
before_scheduled="$(read_metric rcp_scheduler_monitors_scheduled_total "$before_metrics")"
before_stored="$(read_metric rcp_probe_results_stored_total "$before_metrics")"
before_loop_failures="$(read_metric rcp_runtime_loop_failures_total "$before_metrics")"

mkdir -p "$results_dir"

set +e
docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    -v "$repo_root/load/k6:/scripts:ro" \
    -v "$results_dir:/results" \
    -e BASE_URL="$container_base_url" \
    -e RCP_TOKEN="$token" \
    -e MONITOR_ID="$monitor_id" \
    -e RATE="$rate" \
    -e DURATION="$duration" \
    -e P95_LIMIT_MS="$p95_limit_ms" \
    grafana/k6:1.1.0 run /scripts/operator-read.js
k6_status=$?
set -e

after_metrics="$(curl -fsS "$local_base_url/actuator/prometheus")"
after_scheduled="$(read_metric rcp_scheduler_monitors_scheduled_total "$after_metrics")"
after_stored="$(read_metric rcp_probe_results_stored_total "$after_metrics")"
after_loop_failures="$(read_metric rcp_runtime_loop_failures_total "$after_metrics")"

scheduled_delta="$(awk -v after="$after_scheduled" -v before="$before_scheduled" 'BEGIN { print after - before }')"
stored_delta="$(awk -v after="$after_stored" -v before="$before_stored" 'BEGIN { print after - before }')"
loop_failure_delta="$(awk -v after="$after_loop_failures" -v before="$before_loop_failures" 'BEGIN { print after - before }')"

report="$results_dir/report.md"
if [[ -f "$report" ]]; then
    {
        printf '\n## Background reliability pipeline during the workload\n\n'
        printf '| Control-plane signal | Change during run |\n'
        printf '|---|---:|\n'
        printf '| Monitors scheduled | %s |\n' "$scheduled_delta"
        printf '| Probe results stored | %s |\n' "$stored_delta"
        printf '| Runtime loop failures | %s |\n' "$loop_failure_delta"
        printf '\nThese deltas come from the application’s Micrometer counters. Nonzero scheduling/result deltas show that background reliability work continued while operator reads were under load. A zero delta can also mean no monitor became due inside the test window; it is evidence to interpret, not an automatic pass or failure.\n'
    } >>"$report"
fi

printf '\nReport: %s\n' "$report"
exit "$k6_status"
