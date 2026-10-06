# Grafana Cloud monitoring

Grafana Cloud runs the URL checks and alert evaluation outside the VM. Alloy on
the VM sends CPU, memory, disk and application metrics; losing the VM also loses
Alloy, which the external API check and missing-telemetry rule detect.

```text
Grafana public probes ──HTTPS──> CloudFront dashboard
                     └─HTTPS──> Caddy /healthz ──> readiness on private 9091

Oracle VM: host /proc + /sys ──> Alloy ──HTTPS──> Grafana Cloud Prometheus
           app metrics :9091 ──┘                   └─> rules ──> email
```

These files configure an **existing Free stack**, not a new subscription or AWS
resources. Checks and alerts start disabled until the server is ready. The
Terraform provider uses local file tokens through environment variables; it does
not manage or store tokens in Terraform state. State, plans, real variables and
tokens must remain private and ignored by Git.

## Limits and signals

Two HTTP checks, two public locations, every **120 seconds**, with a **10-second
timeout**, use approximately **89,280 API executions in a 31-day month**. Grafana's
current Free allowance is 100,000 API executions and 10,000 active metric series;
other checks and telemetry on the same stack share those allowances. Avoid
duplicating these checks in the UI. Confirm the Free plan remains selected when
a trial ends. Check the stack's usage page after the first day and week.
[Pricing](https://grafana.com/pricing/) and
[execution accounting](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/synthetic-monitoring/).

The dashboard check verifies HTTPS and HTTP 200; it does not execute JavaScript
or sign in. The API check requires exactly `UP` from `/healthz`. It deliberately
does not monitor the scheduled outage target: that page is meant to fail.

Alloy scrapes once a minute and exports a metric allowlist. No application logs,
traces, per-monitor URLs or request histograms are collected. Host network
collectors are omitted because Docker has a separate network namespace. RAM is
limited to 384 MiB; the Go soft limit is 192 MiB. A named disk volume holds its
128-MB WAL segments, truncated every 15 minutes with 30 minutes of retention.
This retention bounds time, not bytes; check volume usage if remote write fails.

| Rule | Trigger |
| --- | --- |
| Dashboard / API unavailable | At least one external location fails for 3 minutes; missing check data also alerts. |
| Pipeline stuck | No stored results over 5 minutes, enabled monitors, successful scrape and a fresh database metric snapshot; pending for 1 more minute. |
| App telemetry missing | Failed scrape, missing required metrics or a database metric snapshot older than 2 minutes; pending for 2 minutes. |

The pipeline rule allows five minutes after application startup and understands
counter resets. Missing telemetry has its own rule, so no data does not look like
a healthy pipeline. Notification delivery includes scrape/write/evaluation delays.
Rules route directly to `RCP demo email`, without replacing the stack's global
notification policy. A resolved notification is enabled, and ongoing failures
repeat every four hours.

## 1. Prepare the stack and private tokens on your Mac

Use `https://glowingriver1871.grafana.net`. In the stack, open **Synthetic
Monitoring → Config** and copy its **backend address**. Prefix it with `https://`.
Use that exact address; a region's display name alone does not determine it.
Complete Synthetic Monitoring's initial setup in the UI if prompted, but do not
add duplicate checks.

Create a Grafana **service account** with Admin access in this stack for the
Terraform alerting/dashboard setup. This is separate from Grafana Cloud access
policies. Give its token an expiry that covers setup, and revoke it when no
longer needed. Store it through the hidden prompt:

```sh
mkdir -p ~/.config/rcp/grafana
chmod 700 ~/.config/rcp/grafana
python3 deploy/demo/scripts/grafana.py store-token ~/.config/rcp/grafana/admin-token
python3 deploy/demo/scripts/grafana.py inspect \
  --stack-url https://glowingriver1871.grafana.net \
  --grafana-token-file ~/.config/rcp/grafana/admin-token
```

The last command reads existing Prometheus data source names and UIDs. Select
the Cloud Prometheus source used by Synthetic Monitoring, not a separate local
Prometheus. Keep its UID for the variables file.

In the Grafana Cloud portal, note the stack ID and its hosted Prometheus and
Loki instance IDs. Create a **stack-scoped Cloud access policy** for Synthetic
Monitoring with `stacks:read`, `metrics:write`, `logs:write`, `traces:write`, as
required by the provider's installation contract. This publisher token belongs
to the SM backend; **never put it on the VM**. Save it and obtain the SM API token:

```sh
python3 deploy/demo/scripts/grafana.py store-token ~/.config/rcp/grafana/sm-publisher-token
python3 deploy/demo/scripts/grafana.py bootstrap-sm \
  --sm-api-url https://BACKEND_FROM_CONFIG \
  --publisher-token-file ~/.config/rcp/grafana/sm-publisher-token \
  --stack-id STACK_ID --metrics-instance-id PROMETHEUS_ID --logs-instance-id LOKI_ID \
  --output ~/.config/rcp/grafana/sm-token
```

`bootstrap-sm` registers or updates Synthetic Monitoring on the existing stack;
it is a remote change. Run it only during the reviewed setup. It saves the
returned API token with mode 0600 and prints no token. It refuses an existing
output. Keep the publisher policy valid while the checks use it; removing it
can prevent probes from publishing.
[Installation contract](https://registry.terraform.io/providers/grafana/grafana/4.47.0/docs/resources/synthetic_monitoring_installation).

Create a **different stack-scoped policy with only `metrics:write`** for the VM.
In the Cloud Prometheus **Send metrics** page, copy its remote-write URL and
numeric username. Save this VM token privately as well; do not put any token in
a command argument, variables file or chat.

## 2. Review the Grafana plan locally

Use Terraform **1.7 or newer**. From the repository root:

```sh
cp deploy/demo/monitoring/terraform.tfvars.example deploy/demo/monitoring/terraform.tfvars
```

Edit the ignored copy with the real SM backend address and Prometheus UID. Keep
`monitoring_enabled = false` for the first setup. Provider tokens come from the
wrapper, not this file:

```sh
terraform -chdir=deploy/demo/monitoring init -lockfile=readonly
python3 deploy/demo/scripts/grafana.py terraform \
  --grafana-token-file ~/.config/rcp/grafana/admin-token \
  --sm-token-file ~/.config/rcp/grafana/sm-token -- \
  -chdir=deploy/demo/monitoring plan -out=setup.tfplan
```

Expect one folder, one email contact, one rule group with four rules, one
dashboard and two disabled HTTP checks. No cloud stack, access policies, tokens
or data sources are created. No existing global notification policy is changed.
Use a fresh real plan; the mock test plan is never a deployment plan. After
review, apply the saved plan through the same wrapper, replacing `plan
-out=setup.tfplan` with `apply setup.tfplan`.

## 3. Rebuild the VM once with the merged backend and monitoring changes

Download and verify an off-host backup first. On the VM, from `/opt/rcp`, fetch
the reviewed merged code with `git pull --ff-only`. This step does not rebuild
anything. Put the non-secret connection details in the ignored file:

```sh
cp deploy/demo/monitoring/connection.env.example deploy/demo/.env.monitoring
```

Edit it with the remote-write URL and numeric username from the Cloud Prometheus
page. Save the **metrics:write-only** token through a hidden prompt on the VM:

```sh
python3 deploy/demo/scripts/grafana.py store-token deploy/demo/secrets/grafana_metrics_token
chmod 700 deploy/demo/secrets
chmod 600 deploy/demo/.env.monitoring
sudo chown 473:473 deploy/demo/secrets/grafana_metrics_token
sudo chmod 400 deploy/demo/secrets/grafana_metrics_token
cd deploy/demo
docker compose --env-file .env --env-file .env.monitoring --profile monitoring config --quiet
docker compose --env-file .env --env-file .env.monitoring --profile monitoring build control-plane
docker compose --env-file .env --env-file .env.monitoring --profile monitoring up -d
docker compose --env-file .env --env-file .env.monitoring --profile monitoring ps
```

The token's owner matches the Alloy container's unprivileged UID 473. PostgreSQL
data and other credentials stay in place. Building before restarting reduces
downtime, but the API is unavailable while the new backend starts. Only Caddy
publishes ports 80/443. App port 9091 and Alloy's loopback admin listener are not
published. Alloy has no Docker socket, no privileged mode and no Linux capabilities.

Confirm `/healthz` returns `UP`, `/actuator/prometheus` returns 404 and unauthenticated
`/api/monitors` returns 401. In Grafana Explore, use the existing Cloud Prometheus
data source and confirm these return fresh samples:

```promql
up{job="rcp-app",project="rcp",environment="demo"}
node_memory_MemAvailable_bytes{job="rcp-host",project="rcp",environment="demo"}
rcp_probe_results_stored_total{job="rcp-app",project="rcp",environment="demo"}
```

Compare host memory and disk with `free -b` and `df -B1 /` on the VM. Metrics
should describe the host, not the Alloy container. Check `docker compose
--env-file .env --env-file .env.monitoring --profile monitoring logs --tail=50
alloy` for read-permission, WAL or remote-write errors. Logs must not contain
tokens. If Alloy's fresh volume is not writable, initialize its ownership with
an operator-controlled container, then restart it; do not make it privileged.

## 4. Enable checks and verify email

Set `monitoring_enabled = true` in the local ignored variables file. Plan again
through the wrapper, review the enable-only changes, and apply that saved plan.
Both locations must show successful results for both URLs. Open **Alerting →
Contact points → RCP demo email** and send a test notification to verify actual
email delivery. Check the spam folder. Do this during deployment, not PR validation.

Open the `RCP demo operations` dashboard in the new folder. Verify an outage
and a recovery notification in an agreed maintenance window. Stopping the API
or Alloy is disruptive; do not do it during ordinary checks. The pipeline alert
can also be inspected with the offline simulation below.

To rotate the VM token, write a new private token file, apply UID 473/mode 0400
and replace `secrets/grafana_metrics_token`. Recreate **only Alloy** so Docker
bind-mounts the new file. Verify fresh samples before revoking the old policy
token. Never rotate a token by changing the tracked configuration.

To stop this monitoring, set `monitoring_enabled = false` and apply the reviewed
Grafana plan, then stop Alloy with the same Compose profile and env files.
Destroying only the Grafana configuration does not delete the stack or the RCP
cloud/server infrastructure. Revoke unused setup/runtime policies separately.

## Offline validation

Install the pinned Alloy 1.20.1 and Caddy 2.10.2 binaries, plus Prometheus
`promtool`, outside the repository. These checks use temporary fake secrets,
mock Grafana resources and local HTTP fixtures; they contact no live stack:

```sh
terraform -chdir=deploy/demo/monitoring init -backend=false -lockfile=readonly
terraform -chdir=deploy/demo/monitoring fmt -check -recursive
terraform -chdir=deploy/demo/monitoring validate
terraform -chdir=deploy/demo/monitoring test
CADDY_BINARY=/path/to/caddy ALLOY_BINARY=/path/to/alloy PROMTOOL_BINARY=/path/to/promtool \
  python3 -m unittest discover -s deploy/demo/tests -v
```

The Caddy test covers healthy/unhealthy/unauthorized upstreams, connection
failure, stripping response details and credentials, and private actuator routes.
The alert test evaluates the same expressions Terraform provisions against
normal ingestion, a stalled counter, disabled monitors, startup, counter reset,
scrape failure, stale database metrics, missing telemetry and URL recovery.
The native Alloy test validates syntax; Linux collector accuracy, memory usage,
real credentials, live probe reachability and email delivery need deployment checks.
