#!/usr/bin/env bash
set -euo pipefail
# Compose secrets are files; Spring's datasource and demo login expect values.
for name in postgres_password application.json aws_credentials demo_username demo_password; do
    if [[ ! -s "/run/secrets/$name" ]]; then
        printf 'Missing or empty secret file: %s\n' "$name" >&2
        exit 1
    fi
done
export SPRING_DATASOURCE_PASSWORD="$(cat /run/secrets/postgres_password)"
export SPRING_APPLICATION_JSON="$(cat /run/secrets/application.json)"
export RCP_DEMO_USERNAME="$(cat /run/secrets/demo_username)"
export RCP_DEMO_PASSWORD="$(cat /run/secrets/demo_password)"
exec java -jar /app/rcp-control-plane.jar
