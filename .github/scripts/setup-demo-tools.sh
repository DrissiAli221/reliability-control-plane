#!/usr/bin/env bash
# Ubuntu CI tools only; never runs on the demo VM or builds container images.
set -euo pipefail
[[ "$(uname -sm)" == "Linux x86_64" ]] || { echo "Requires a Linux x86_64 runner" >&2; exit 1; }
: "${RUNNER_TEMP:?Run this installer on a GitHub Actions runner}"
: "${GITHUB_PATH:?GitHub Actions path file is required}"

tools_dir="$RUNNER_TEMP/rcp-demo-bin"
downloads="$(mktemp -d "$RUNNER_TEMP/rcp-demo-downloads.XXXXXX")"
trap 'rm -rf "$downloads"' EXIT
mkdir -p "$tools_dir"
cd "$downloads"

# Pin versions and release checksums. Caddy publishes SHA-512, the others SHA-256.
curl --fail --silent --show-error --location --retry 3 --max-time 180 \
  https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_linux_amd64.tar.gz -o caddy.tar.gz
printf '%s  %s\n' \
  747df7ee74de188485157a383633a1a963fd9233b71fbb4a69ddcbcc589ce4e2cc82dacf5dbbe136cb51d17e14c59daeb5d9bc92487610b0f3b93680b2646546 \
  caddy.tar.gz | sha512sum --check --strict
tar -xzf caddy.tar.gz -C "$tools_dir" caddy

curl --fail --silent --show-error --location --retry 3 --max-time 180 \
  https://github.com/grafana/alloy/releases/download/v1.20.1/alloy-linux-amd64.zip -o alloy.zip
printf '%s  %s\n' \
  451fe650e8277d22d69cb8db50bba809f581fe78decba7fce4027ef185457be9 \
  alloy.zip | sha256sum --check --strict
unzip -q alloy.zip alloy-linux-amd64
install -m 755 alloy-linux-amd64 "$tools_dir/alloy"

curl --fail --silent --show-error --location --retry 3 --max-time 180 \
  https://github.com/prometheus/prometheus/releases/download/v3.6.0/prometheus-3.6.0.linux-amd64.tar.gz -o prometheus.tar.gz
printf '%s  %s\n' \
  2002ef4a55a64161affccd2786c7081d4e3b3a8d08786a98b3bb110971414916 \
  prometheus.tar.gz | sha256sum --check --strict
tar -xzf prometheus.tar.gz --strip-components=1 -C "$tools_dir" prometheus-3.6.0.linux-amd64/promtool

# Install PostgreSQL 17 from its signed upstream repository, without using a
# running database. Tests initialize and remove their own temporary cluster.
curl --fail --silent --show-error --location --retry 3 --max-time 60 \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc -o pgdg.asc
sudo install -m 644 pgdg.asc /usr/share/keyrings/rcp-pgdg.asc
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/rcp-pgdg.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' \
  | sudo tee /etc/apt/sources.list.d/rcp-pgdg.list >/dev/null
sudo apt-get update
sudo apt-get install --yes --no-install-recommends postgresql-17

printf '%s\n' "$tools_dir" /usr/lib/postgresql/17/bin >> "$GITHUB_PATH"
