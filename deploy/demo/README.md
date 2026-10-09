# Single-server demo deployment

Runs the existing control-plane image, PostgreSQL **17.6**, and Caddy on one Linux
VM. The configuration is portable between Oracle ARM64 and EC2 x86_64/ARM64:
there is no cloud-specific VM resource or fixed Docker platform in this folder.
Build the image on the target architecture, or use a matching multi-arch image.
A prebuilt Mac ARM image is not an x86 image.

This runbook prepares deployment; it does not prove a live deployment. The AWS
half is documented in [`infra/aws-demo`](../../infra/aws-demo/README.md).

## Before going live

- Deploy an application release that supports expired-session handling,
  stale public status data, backend read-only `demo` group, 60-second minimum,
  8 global/5 owner monitor caps, maximum 5-second check timeout, example seeding,
  and `/api/demo/session`. Verify backend group enforcement, concurrent quota
  protection, and the 30/minute demo-login limit for the single backend.
  Stock Caddy does not add another login rate limiter here.
- The shared demo account must retain `demo` membership. The backend seeds five
  monitors (Example Domain, Wikipedia, Scheduled outage drill, GitHub Status,
  and Cloudflare Status) on startup
  using the Cognito UUID `sub`. Capture that subject during provisioning; do not substitute its
  email or remove group membership to seed monitors.
- Establish the AWS budget alert before creating application resources.
- Confirm the chosen VM's actual availability, billing/egress/storage terms, and
  idle-instance policy. This file assumes neither provider guarantees a free VM.
- Use a VM with at least **2 GiB RAM**, preferably 4 GiB, and enough disk for image
  builds, PostgreSQL, logs, and backups. A 1 GiB instance is too tight for the
  configured 1 GiB JVM container plus 512 MiB PostgreSQL and the OS. Building the
  Java image on a small VM may need additional memory; build elsewhere if needed.

Oracle Always Free ARM is the selected host, subject to available capacity. Pick
the home region carefully before signup: it cannot be changed and Always Free
compute must be created there. An out-of-capacity error can be retried later or
in another availability domain, but a retry time does not guarantee capacity.
Keep off-host backups because Oracle can reclaim idle Always Free instances.
See [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
and [home-region rules](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm).

## Host preparation

Use a supported Linux distribution with Docker Engine and Docker Compose v2.24.4+
installed from the official Docker instructions. Install Python 3 and the AWS CLI
on the operator machine. Install `curl` on the VM for external smoke checks.

Clone/copy the application release and deployment files to `/opt/rcp`.
Check the commit before building. Keep production deployment files and states
separate.

Create an API hostname (for example `api.example.com`) and point its A record at
the VM's public IPv4. Add AAAA only if working IPv6 routing is configured. Domain
registration is a separate potential cost. The dashboard uses the generated
CloudFront HTTPS hostname; Cognito callback and backend CORS must match it exactly.

Allow TCP 80/443 through both the provider firewall and host firewall. Restrict
SSH to operator IPs at the provider firewall. This setup exposes HTTPS over TCP;
UDP 443/HTTP3 is not published. Caddy uses port 80 for
ACME validation/redirects and renews HTTPS certificates automatically. Do not open
5432, 8080, or actuator endpoints to the Internet. Docker published ports need
rules that account for Docker's forwarding behavior, not just host INPUT rules.

## Configuration and secret provisioning

Use outputs from the demo Terraform root for these steps. No secrets are embedded
in Compose, build arguments, or Vite.

1. Export Terraform outputs into a private, ignored file:

   ```sh
   umask 077
   terraform -chdir=infra/aws-demo output -json > deploy/demo/terraform-outputs.json
   python3 deploy/demo/scripts/configure.py deploy/demo/terraform-outputs.json \
     --api-domain api.example.com --acme-email operator@example.com
   ```

   This generates `.env`, `dashboard.env`, and `secrets/application.json`. It
   refuses existing configuration files and validates regions, identity, CORS,
   quotas, polling, and API origin. These files are ignored by Git. The exact
   region-keyed map is passed through `SPRING_APPLICATION_JSON`, not flattened
   region environment names.

   The global cap is a backend setting, with no application source change. This
   deployment supplies `rcp.monitors.max-total=8` in the generated JSON. Change
   that JSON and restart the backend to revise the cap; a conflicting
   `RCP_MONITORS_MAX_TOTAL` environment variable does not override
   `SPRING_APPLICATION_JSON`.

2. Create the runtime user's access key with an operator AWS identity. The runtime
   username is the `server_iam_user` Terraform output. Redirect the command's
   response to a protected file **outside Git**:

   ```sh
   umask 077
   aws iam create-access-key --user-name RUNTIME_USER_FROM_TERRAFORM \
     --no-cli-pager > /tmp/rcp-runtime-key.json
   python3 deploy/demo/scripts/setup-secrets.py --credentials-json /tmp/rcp-runtime-key.json
   ```

   The helper generates a database password, prompts for the demo email/password,
   and stores a named AWS SDK credential profile. It never contacts AWS and never
   overwrites existing secrets. Transfer secret files to the host through an
   operator-controlled secure channel. Remove the temporary key-response file
   after transfer; keep the sole needed key in a password manager/recovery store.
   Never paste credentials into a PR, log, or chat.

3. With the operator CLI identity, create the shared Cognito demo user:

   ```sh
   python3 deploy/demo/scripts/provision-demo-user.py deploy/demo/terraform-outputs.json
   ```

   It suppresses invitation email, marks the operator-controlled email verified,
   adds `demo` membership **before** setting a permanent password, and does not
   print credentials or place the password in command arguments. It captures the
   returned Cognito UUID `sub` into `secrets/demo_owner_subject` (0600), for
   `RCP_DEMO_OWNER_SUBJECT` at startup. The runtime user needs no additional Cognito
   permission. It intentionally fails if the user or owner file already exists;
   inspect partial provisioning before retrying. If recovering an existing user,
   use the operator CLI to confirm its group/password/MFA state and obtain its
   actual `sub`; preserve that identity instead of creating a replacement user.
   Do not enable TOTP on the shared demo user: the one-click flow does not answer
   MFA challenges. Other registered users can enable optional TOTP.
   The runtime key has no user-creation or group-management permissions.

4. On the VM, keep `secrets/` owned by the deployment operator with mode **0700**.
   File-backed Compose secrets retain host permissions; allow the unprivileged
   image user (UID 10001) to read mounted files. One portable arrangement is mode
   **0444 on the individual files** inside the protected 0700 directory:

   ```sh
   chmod 700 deploy/demo/secrets
   chmod 444 deploy/demo/secrets/postgres_password deploy/demo/secrets/aws_credentials \
     deploy/demo/secrets/application.json deploy/demo/secrets/demo_username deploy/demo/secrets/demo_password \
     deploy/demo/secrets/demo_owner_subject
   chmod 600 deploy/demo/.env deploy/demo/dashboard.env deploy/demo/terraform-outputs.json
   ```

   The directory prevents other host users from traversing into these files.
   Containers receive only explicitly mounted secrets. Compose file secrets are
   bind mounts, not an encrypted secret store; anyone controlling Docker/root can
   read them. `docker compose config` prints file paths rather than secret contents.
   Do not use shell tracing/debug CLI output while provisioning or running startup.

The container startup wrapper loads Spring's password/JSON, demo credentials and
owner subject from those files. The AWS SDK uses the `rcp-demo` shared-credentials
profile. The runtime key only sends regional jobs, consumes central results, and authenticates
the shared Cognito user. Rotate it by replacing the credential file and recreating
the control-plane container; disable the previous key after verification.

## Start and verify the backend

From `/opt/rcp/deploy/demo`:

```sh
python3 scripts/outage-drill.py restore
docker compose config --quiet
docker compose build control-plane
docker compose up -d
docker compose ps
```

Only Caddy publishes ports. PostgreSQL lives on an internal network; the backend
also joins an egress network to reach AWS and Cognito. The backend filesystem is
read-only, temporary writes use bounded tmpfs, and it runs as the existing UID
10001. Container memory, CPU, and rotating JSON logs are bounded. Caddy state and
PostgreSQL data persist in named volumes.

Check health from inside Docker and confirm management stays private:

```sh
docker compose exec -T postgres pg_isready -U rcp -d rcp
curl -sS -o /dev/null -w '%{http_code}\n' https://api.example.com/actuator/health/readiness
```

The public management request must return **404**. The backend Docker healthcheck
must report healthy; it includes database connectivity. Validate a normal unauthenticated
API request returns **401**, sign-up/email confirmation works, demo login succeeds,
read-only API writes fail, CORS accepts only the CloudFront origin, and both regions
produce results within the result deadline. The backend enforces authentication
and read-only access; verify both through API requests after deployment.

The management listener is now **9091**, unpublished outside Docker. Caddy exposes
only `GET /healthz` as `UP` (200) or `DOWN` (503). For the external checks, private
metrics collection and email alerts, follow [Grafana Cloud monitoring](monitoring/README.md)
after reviewing the monitoring configuration. The Alloy service is opt-in with
the `monitoring` Compose profile; the default deployment needs no Grafana token.

Caddy access logging is deliberately not enabled: avoid recording public tokens or
sensitive query strings by default. Use bounded service logs for startup diagnosis.
A missing/incorrect API DNS record or blocked port 80 prevents public certificates.
No ACME request is needed for the local smoke test described below.

## Varied scheduled demo drills

Only our own `https://rcp-ali.duckdns.org/drill/status.html` endpoint is faulted.
Caddy proxies the exact GET/HEAD route to a small Python responder on an internal
Docker network. It has no published ports, credentials or outbound network access,
and is bounded to 64 MiB, 0.25 CPU and 16 concurrent requests. API proxying,
`/healthz`, and the public `/actuator` 404 stay unchanged. Responses are not cached.
No third-party website, including SpectraTV, is altered by a drill.

Each two-hour UTC cycle has a deterministic plan derived from its epoch cycle
number. Roughly one in four cycles is skipped. Other cycles start 5–95 minutes
into the cycle and use one of four modes:

| Mode | Planned response | Expected evidence |
| --- | --- | --- |
| Full outage | HTTP 404 in both regions for 4–20 minutes | Consecutive DOWN checks can open an incident; consecutive UP checks resolve it. |
| Slow response | HTTP 200 delayed 2–4 seconds for 4–20 minutes | A latency spike under the configured 5-second timeout. Additional network delays can still cause timeouts. |
| Regional failure | HTTP 503 only for the selected probe region for 4–20 minutes | One failed region and one successful region are inconclusive and excluded from uptime. |
| Short blip | HTTP 404 for 15–40 seconds | Shorter than the 60-second interval, normally avoiding an incident. Delayed checks can still overlap; this is not guaranteed. |

Verdict and incident rules are unchanged: two failed regions, including two
timeouts, still mean DOWN. The dashboard shows a **planned** window and mode;
actual checks and incident status come from the backend. A disabled timer, a late
start, or a reboot can shorten or suppress a window. The browser cannot establish
whether the responder is actually faulting. Keep server scripts and dashboard
assets on the same schedule version. Both implementations are checked against
`fixtures/drill-schedule-v1.json`; the schedule is intentionally predictable,
not cryptographic randomness.

The timer evaluates the plan every minute and never catches up missed windows.
A late start runs only the remaining time, never a fresh full-duration outage.
Atomic `state.json` writes give the responder an absolute expiry, so an interrupted
controller cannot leave a scheduled fault active indefinitely. Outage/blip modes
also remove `status.html`; restoration puts it back. A cycle marker prevents
restarting an interrupted window. Runtime files remain ignored by Git.
Normal completion, errors and SIGTERM restore the endpoint; `ExecStopPost` covers
forced termination. The boot recovery service restores it before Docker starts.

### Install or upgrade the drill on the VM

First take and verify an off-host backup using the backup section. The following
commands are for the reviewed release on the VM, **not local validation**. Stop
the old timer before updating the checkout so its running process cannot retain
an obsolete plan. Use `git pull --ff-only`; resolve a divergent checkout separately.

```sh
set -e
cd /opt/rcp
sudo systemctl disable --now rcp-demo-drill.timer
sudo systemctl stop rcp-demo-drill.service
git pull --ff-only
sudo mkdir -p deploy/demo/drill
sudo chmod 755 deploy/demo/drill
sudo python3 deploy/demo/scripts/outage-drill.py restore
sudo install -m 644 deploy/demo/systemd/rcp-demo-drill*.service /etc/systemd/system/
sudo install -m 644 deploy/demo/systemd/rcp-demo-drill.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/rcp-demo-drill*.service /etc/systemd/system/rcp-demo-drill.timer
systemd-analyze calendar --iterations=3 '*-*-* *:*:00 UTC'
sudo systemctl daemon-reload
sudo systemctl enable --now rcp-demo-drill-restore.service
cd deploy/demo
docker compose pull drill
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 120 drill caddy
sudo systemctl enable --now rcp-demo-drill.timer
sudo systemctl list-timers rcp-demo-drill.timer
curl -fsS https://rcp-ali.duckdns.org/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://rcp-ali.duckdns.org/drill/status.html
```

For a first installation, omit the first two stop commands when those units do
not exist. Install all three units; Python 3 is required on the VM. If the checkout
is not `/opt/rcp`, update each unit's paths before installing. The status response
can legitimately be 404, 503 or slow during its planned window. Check the journal
and the backend's results rather than treating every non-200 as a deployment error.

Inspect, pause, or restore:

```sh
sudo journalctl -u rcp-demo-drill.service -u rcp-demo-drill-restore.service --since today
sudo systemctl disable --now rcp-demo-drill.timer
sudo systemctl stop rcp-demo-drill.service
sudo python3 /opt/rcp/deploy/demo/scripts/outage-drill.py restore
```

Leave boot recovery enabled. Resume with
`sudo systemctl enable --now rcp-demo-drill.timer`. Restoring during an active
window suppresses that window until the next cycle. For an operator-requested
**manual ten-minute outage**, keep the timer disabled and run
`sudo python3 /opt/rcp/deploy/demo/scripts/outage-drill.py outage`. The manual run
is outside the dashboard's forecast; restore again if its process is forcibly killed.

### Probe header and separate Lambda rollout

Lambda probes add exactly one `X-RCP-Probe-Region` header, with `eu-west-1` or
`us-east-1`, to **every monitored target**, not just the drill. It contains no
monitor identifier, URL, user identity or credential. It is spoofable diagnostic
metadata, never an authentication mechanism. Local workers using the original
HTTP-client constructor keep sending no region header.

Regional mode returns 200 for requests without a recognized header. Therefore
it is harmless before the Lambda rollout: both old probes keep succeeding in a
regional window. A partially rolled-out pair cannot yet prove the intended
one-region scenario. Update both regions together after reviewing the plan.
This PR does not deploy Lambdas or modify AWS resource definitions.

From the operator checkout, follow the AWS runbook to build the probe package,
then create and review a **real Terraform plan**. Confirm the deployed package's
code hash changes for both probe Lambdas and investigate any unrelated changes.
Obtain deployment approval **before apply**; server installation alone does not
update those probes. Publish the rebuilt dashboard using the next section so
its schedule agrees with the server.

### Upgrade the existing demo fleet without losing history

New generated configuration seeds **five** monitors and sets **5 per owner / 8
globally**, with the same 60-second minimum interval and 5-second maximum timeout.
The owner limit applies to every owner, not only the shared account. Example
Domain, Wikipedia and our drill remain; GitHub Status and Cloudflare Status are
added as small public JSON endpoints. These checks measure the availability of
those HTTP endpoints, **not** the provider-wide health reported inside the JSON.
All public targets still go through the probes' safe-address validation; there is
no new named-host allowlist or third-party fault injection.

On startup, the backend adds missing configured demo monitors matched by name
and retains existing monitors and history. Never remove the `demo` group, delete
monitors or replace the stored Cognito `sub` to reseed. Inspect current monitor
counts first: five configured targets cannot fit if an existing workspace or the
global fleet already fills either cap. The settings do not evict existing monitors.

After taking a verified off-host backup, update the existing private configuration
on the VM. The helper preserves identity, URLs, queue maps and unrelated settings,
refuses unreviewed quota/timeout changes, adds only missing target URLs, and writes
atomically. It requires private permissions and preserves file ownership. Do not
rerun the new-deployment generator over existing configuration.

```sh
set -e
cd /opt/rcp
sudo test ! -e deploy/demo/secrets/application.before-variety.json
sudo install -m 600 deploy/demo/secrets/application.json deploy/demo/secrets/application.before-variety.json
sudo chmod 600 deploy/demo/secrets/application.json
if ! sudo python3 deploy/demo/scripts/configure-variety.py deploy/demo/secrets/application.json; then
  sudo chmod 444 deploy/demo/secrets/application.json
  exit 1
fi
sudo chmod 444 deploy/demo/secrets/application.json
cd deploy/demo
docker compose --profile monitoring up -d --no-deps --force-recreate --wait --wait-timeout 180 control-plane
curl -fsS https://rcp-ali.duckdns.org/healthz
```

Keep `secrets/` mode 0700; 0444 on the mounted application file lets container UID
10001 read it. The protected backup is 0600. Omit `--profile monitoring` if Alloy
is not installed. **Recreate**, rather than merely restart, the backend because
an atomic replacement must be rebound into its file-backed Compose secret.
Check the demo UI now contains five targets and that `/api/me` reports the
approved quotas. Existing history stays attached to the same monitor IDs.

For an older backend that cannot add missing demo targets on startup, use the
operator-only SQL helper after the configuration update. First confirm the existing
workspace belongs to the stored subject and has capacity:

```sh
cd /opt/rcp/deploy/demo
docker compose exec -T postgres psql -X -U rcp -d rcp -v ON_ERROR_STOP=1 \
  -v demo_subject="$(cat secrets/demo_owner_subject)" \
  < scripts/add-demo-variety.sql
```

It adds only the two fixed status endpoints, deduplicated by owner and URL. The
transaction takes a brief table lock, validates the existing subject, and refuses
to exceed either cap; failure adds nothing. It leaves other owners, existing
history, scheduling triggers and group membership alone. The older
`add-drill-monitor.sql` remains available for a workspace missing the drill itself;
its quota check now also uses five. These helpers do not delete monitors to make
space. Verify the backend version and existing names before choosing the startup
seeder or SQL path.

For configuration rollback, disable the drill timer and restore the endpoint
first. Restore `application.before-variety.json` with private permissions, set
0444 inside the protected directory, and recreate the backend. This restores the
old configuration, **not** the database: newly seeded monitors and history remain.
Do not downgrade to the owner quota of three while five monitors remain without
reviewing that workspace. Keep the previous responder/dashboard release together
if rolling back the schedule version.

## Publish the dashboard

Build the dashboard with the generated public variables in `dashboard.env`.
Pass them to the build environment; do not copy the backend's secret files into
`rcp-dashboard/`. For an operator-reviewed build, from the repository root:

```sh
set -a
. ./deploy/demo/dashboard.env
set +a
npm --prefix rcp-dashboard ci
npm --prefix rcp-dashboard run build
```

These generated variable values contain only URLs and a public client ID. If you
edit this env file yourself, treat sourcing it as executing shell input.

Upload assets and then the HTML shell:

```sh
aws s3 sync rcp-dashboard/dist/ s3://DASHBOARD_BUCKET_FROM_TERRAFORM/ \
  --exclude index.html --cache-control 'public,max-age=31536000,immutable'
aws s3 cp rcp-dashboard/dist/index.html s3://DASHBOARD_BUCKET_FROM_TERRAFORM/index.html \
  --cache-control 'no-cache,max-age=0,must-revalidate' --content-type text/html
aws cloudfront create-invalidation --distribution-id DISTRIBUTION_ID_FROM_TERRAFORM \
  --paths /index.html
```

Use immutable headers only for content-hashed assets; upload other mutable public
files separately with a short/no-cache policy. The sync deliberately does not delete
older assets needed by already-open clients. Reconcile old assets separately after
an appropriate retention period. Check `/auth/callback`, `/monitors/...`, `/public/...`,
refresh on a route, and missing asset behavior in a browser. Then let the demo
collect history before adding the live URL to the main README.

## Backups and isolated restore

A backup is a consistent PostgreSQL custom-format snapshot. Writes may continue;
exact source/restored counts require a quiescent source. The script validates the
archive list, publishes it by rename only after success, and prunes old dumps only
after a new backup succeeds. Files are 0600; concurrent runs use a directory lock.

```sh
./deploy/demo/scripts/backup.sh
./deploy/demo/scripts/restore-check.sh /absolute/path/to/rcp-backup.dump
```

`restore-check.sh` uses a fresh PostgreSQL 17.6 container with **no network and no
published port**, restores with error checking, checks the application schema,
and removes only that temporary container. It never overwrites live data. An optional second argument supplies an operator-chosen
SQL verification file, executed only inside the temporary restored database.
A successful restore proves archive readability/schema restoration, not a full
application recovery or zero data loss.

For daily backups on Linux, review the `/opt/rcp` paths in `systemd/`, then install:

```sh
sudo install -m 644 deploy/demo/systemd/rcp-demo-backup.service /etc/systemd/system/
sudo install -m 644 deploy/demo/systemd/rcp-demo-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rcp-demo-backup.timer
sudo systemctl start rcp-demo-backup.service
sudo systemctl status rcp-demo-backup.service
```

The timer catches missed runs and keeps seven days by default. Customize the
service's `RCP_BACKUP_RETENTION_DAYS` environment value. Inspect failures with
`journalctl -u rcp-demo-backup.service`; a stale `.backup-lock` requires inspection
before removal. Do not declare backups working just because the timer is enabled.

**Download a backup off the VM before sharing the live demo.** The operator can
pull the latest completed archive onto their Mac/Linux machine using the existing
SSH key; no cloud-storage credentials or public backup endpoint are needed.
Ensure the reviewed release (including both backup helpers) is installed under
`/opt/rcp` on the server and the daily backup service has completed at least once.
Verify the SSH host-key fingerprint through a trusted channel on first connection;
the helper requires an existing trusted host key and never disables that check.

From the repository root on your operator machine:

```sh
python3 deploy/demo/scripts/pull-backup.py \
  --host ubuntu@YOUR_VM_PUBLIC_IP --identity "$HOME/.ssh/YOUR_EXISTING_KEY" \
  --directory "$HOME/Backups/rcp"
```

If the key is in your SSH agent, omit `--identity`. The server helper uses
`sudo -n` to read the backup service's root-owned 0600 archives; the Ubuntu operator
must retain their existing noninteractive sudo access. The download selects only
completed filenames, excludes partial files/symlinks, validates length and SHA-256,
and requires SSH to exit successfully before publishing a private 0600 file.
Interrupted/corrupt downloads never overwrite an existing archive. Repeating an
identical download is safe. The default size limit is 1 GiB; increase
`--max-size-mb` only after checking available operator storage.

Run `restore-check.sh` against the downloaded archive on the operator machine and
repeat the download after each daily backup. This is an operator-initiated copy,
not an unattended cloud upload: a sleeping/offline laptop does not fetch backups.
Record the latest off-server backup time and check its age before relying on it.
Keep the destination outside Git on a protected/encrypted disk. The helper keeps
downloaded archives until you explicitly prune them; same-host retention stays
seven days. For unattended long-term hosting, choose a private external storage
destination and its credential/retention policy before removing this operator task.
PostgreSQL storage and backups have no automatic total-size cap: watch disk growth
and define an application history-retention policy before long-running public use.

For disaster recovery, first restore to an isolated DB and verify it. Stop all
writers, take a safety backup of surviving data, prepare a fresh named volume,
restore with PostgreSQL 17.6, point the stopped application at it, and validate
migrations and authentication before switching traffic. Keep the old volume until
recovery is accepted. Never run `docker compose down -v` as routine maintenance.

## Local verification without AWS

```sh
python3 -m unittest discover -s deploy/demo/tests -v
python3 deploy/demo/scripts/local-smoke.py
```

The tests use synthetic inputs. The routing integration runs when `caddy` is on
PATH, or when `CADDY_BINARY=/path/to/caddy` is set (use version 2.10.2, matching
Compose). The SQL integration uses an isolated temporary cluster when `initdb`,
`pg_ctl` and `psql` are on PATH; it opens no TCP listener and removes the cluster
afterward. Those integrations report skips when their tools are unavailable.
The systemd units require Linux: verify their syntax and calendar using the
commands in the drill installation section before enabling them on the VM.

The default smoke builds/reuses `rcp-control-plane:demo`, runs an isolated Compose
project with fake identity, disables queue polling, uses loopback HTTP Caddy, runs
Flyway on PostgreSQL 17.6, verifies anonymous API rejection/management hiding,
backs up/restores synthetic data, and cleans up only its own temporary resources.
It creates no AWS resources, calls no Cognito API, and does not request certificates.

To verify demo access restrictions and monitor limits, also run:

```sh
python3 deploy/demo/scripts/local-smoke.py --build --phase2
```

This second mode uses local JWTs, enables the demo configuration, disables
both queue polling and local workers, and verifies the seeded demo UUID, five
monitors, server-side read-only rejection, 60-second/5-second limits, and one-time
onboarding. It uses a fresh local database, not the developer's running services.
The local token endpoint exists only in this loopback test's `local` profile;
production Compose still uses `aws`. To test a specific application source checkout,
supply `--source-directory /path/to/snapshot`
and a separate `--image` tag. This does not verify real Cognito login or AWS probes.

## Updates and rollback

Build/tag the application image by commit on the target architecture. Back up
PostgreSQL before migrations, set `RCP_CONTROL_PLANE_IMAGE` in `.env`, recreate the
backend, and confirm health plus both-region probe processing. Caddy renewals and
backups require the VM to remain reachable. A container restart policy restarts
exited processes, not an unhealthy-but-running JVM; investigate failed healthchecks.

Rolling back an image is safe only if its code understands the migrated schema.
Keep previous image tags and an independently verified database backup. Recreating
PostgreSQL with a different password file does **not** change an initialized DB's
password; rotate the DB role and application secret together. Keep image versions
pinned and review security updates periodically. Nothing in this setup provides
production HA or automatic database failover.
