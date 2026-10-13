#!/usr/bin/env bash
set -euo pipefail
umask 077
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_dir="$(cd "$script_dir/.." && pwd)"
cd "$deploy_dir"
# Let Compose read .env without sourcing arbitrary shell code.
retention="${RCP_BACKUP_RETENTION_DAYS:-7}"
if [[ ! "$retention" =~ ^[0-9]+$ ]] || (( retention < 1 )); then
    echo 'RCP_BACKUP_RETENTION_DAYS must be a positive integer.' >&2
    exit 1
fi
mkdir -p backups
# Do not overlap cron runs; the EXIT trap also removes incomplete dumps.
if ! mkdir backups/.backup-lock 2>/dev/null; then
    echo 'A backup is running, or backups/.backup-lock needs operator inspection.' >&2
    exit 1
fi
partial="$(mktemp "$deploy_dir/backups/.partial.XXXXXX")"
cleanup() {
    rm -f "$partial"
    rmdir "$deploy_dir/backups/.backup-lock"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# -Fc is a consistent PostgreSQL snapshot even while the application is writing.
docker compose exec -T postgres pg_dump -U rcp -d rcp --format=custom --no-owner --no-acl > "$partial"
[[ -s "$partial" ]]
# Validate the archive before marking it complete or pruning previous backups.
docker compose exec -T postgres pg_restore --list < "$partial" >/dev/null
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
completed="$deploy_dir/backups/rcp-$stamp.dump"
if [[ -e "$completed" ]]; then
    echo 'A backup already exists for this second; retry later.' >&2
    exit 1
fi
mv "$partial" "$completed"
find "$deploy_dir/backups" -type f -name 'rcp-*.dump' -mtime "+$retention" -exec rm -f {} \;
printf 'Backup saved: %s\n' "$completed"
