#!/usr/bin/env bash
set -euo pipefail
# Isolated restore: never connects to or overwrites the live Compose database.
if [[ $# -lt 1 || $# -gt 2 || ! -s "$1" ]]; then
    echo 'Usage: restore-check.sh /absolute/path/to/rcp-backup.dump [verification.sql]' >&2
    exit 1
fi
if [[ $# -eq 2 && ! -s "$2" ]]; then
    echo 'Optional verification SQL file is missing or empty.' >&2
    exit 1
fi
container=""
cleanup() {
    if [[ -n "$container" ]]; then
        docker rm -fv "$container" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
container="$(docker run -d --rm --network none \
    -e POSTGRES_USER=rcp -e POSTGRES_DB=rcp \
    -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.6)"
ready=false
for attempt in {1..60}; do
    if docker exec "$container" pg_isready -U rcp -d rcp >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo 'Isolated PostgreSQL did not become ready.' >&2
    exit 1
fi
docker exec -i "$container" pg_restore -U rcp -d rcp --no-owner --no-acl --exit-on-error < "$1"
# A successful archive restore must include the application schema and migrations.
docker exec "$container" psql -U rcp -d rcp -v ON_ERROR_STOP=1 -Atc '
SELECT COUNT(*) FROM flyway_schema_history WHERE success;
SELECT COUNT(*) FROM monitors;
SELECT COUNT(*) FROM probe_executions;
SELECT COUNT(*) FROM probe_results;
SELECT COUNT(*) FROM incidents;'
if [[ $# -eq 2 ]]; then
    docker exec -i "$container" psql -U rcp -d rcp -v ON_ERROR_STOP=1 < "$2"
fi
echo 'Isolated restore PASS; temporary database removed on exit.'
