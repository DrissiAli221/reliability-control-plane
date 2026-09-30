# Single-server demo deployment

Runs the existing control-plane image, PostgreSQL **17.6**, and Caddy on one Linux
VM. The configuration is portable between Oracle ARM64 and EC2 x86_64/ARM64:
there is no cloud-specific VM resource or fixed Docker platform in this folder.
Build the image on the target architecture, or publish a matching multi-arch image
later with explicit authorization. A prebuilt Mac ARM image is not an x86 image.

This runbook prepares deployment; it does not prove a live deployment. The AWS
half is documented in [`infra/aws-demo`](../../infra/aws-demo/README.md).

## Before going live

- Merge and verify Claude's Phase 1–2 implementation: expired-session handling,
  stale public status data, backend read-only `demo` group, 60-second minimum,
  25 global/3 owner monitor caps, maximum 10-second check timeout, example seeding,
  and `/api/demo/session`. The new property names alone do not enforce limits on
  the pre-Phase-2 backend. Include tests for concurrent quota creation and write
  rejection by demo tokens, and rate-limit the public demo-login endpoint on the
  application side. Stock Caddy does not supply a login rate limiter here.
- The shared demo account must retain `demo` membership. Claude must provide a
  trusted way to seed its three monitors without exposing a writable shared
  account. Prefer neutral targets unless the owner chooses otherwise.
- Establish the AWS budget alert before application resources; get explicit
  deployment authorization before creating AWS resources, keys, users, VM, or DNS.
- Confirm the chosen VM's actual availability, billing/egress/storage terms, and
  idle-instance policy. This file assumes neither provider guarantees a free VM.
- Use a VM with at least **2 GiB RAM**, preferably 4 GiB, and enough disk for image
  builds, PostgreSQL, logs, and backups. A 1 GiB instance is too tight for the
  configured 1 GiB JVM container plus 512 MiB PostgreSQL and the OS. Building the
  Java image on a small VM may need additional memory; build elsewhere if needed.

## Host preparation

Use a supported Linux distribution with Docker Engine and Docker Compose v2.24.4+
installed from the official Docker instructions. Install Python 3 and the AWS CLI
on the operator machine. Install `curl` on the VM for external smoke checks.

Clone/copy the **final merged application commit** to `/opt/rcp`, not only this
worktree's older application snapshot. Check the commit before building. Keep
production deployment files and states separate.

Create an API hostname (for example `api.example.com`) and point its A record at
the VM's public IPv4. Add AAAA only if working IPv6 routing is configured. Domain
registration is a separate potential cost. The dashboard uses the generated
CloudFront HTTPS hostname; Cognito callback and backend CORS must match it exactly.

Allow TCP 80/443 through both the provider firewall and host firewall. Restrict
SSH to operator IPs; optionally permit UDP 443 for HTTP/3. Caddy uses port 80 for
ACME validation/redirects and renews HTTPS certificates automatically. Do not open
5432, 8080, or actuator endpoints to the Internet. Docker published ports need
rules that account for Docker's forwarding behavior, not just host INPUT rules.

## Configuration and secret provisioning

These steps are for a **later authorized deployment**, using the already-reviewed
Terraform outputs. No secrets are embedded in Compose, build arguments, or Vite.

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
   print credentials or place the password in command arguments. It intentionally
   fails if the user already exists; inspect partial provisioning before retrying.
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
     deploy/demo/secrets/application.json deploy/demo/secrets/demo_username deploy/demo/secrets/demo_password
   chmod 600 deploy/demo/.env deploy/demo/dashboard.env deploy/demo/terraform-outputs.json
   ```

   The directory prevents other host users from traversing into these files.
   Containers receive only explicitly mounted secrets. Compose file secrets are
   bind mounts, not an encrypted secret store; anyone controlling Docker/root can
   read them. `docker compose config` prints file paths rather than secret contents.
   Do not use shell tracing/debug CLI output while provisioning or running startup.

The container startup wrapper loads Spring's password/JSON and the demo credentials
from those files. The AWS SDK uses the `rcp-demo` shared-credentials profile. The
runtime key only sends regional jobs, consumes central results, and authenticates
the shared Cognito user. Rotate it by replacing the credential file and recreating
the control-plane container; disable the previous key after verification.

## Start and verify the final backend

From `/opt/rcp/deploy/demo`:

```sh
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
produce results within the result deadline. Authentication enforcement is Claude's
backend work; do not infer it from Terraform group creation.

Caddy access logging is deliberately not enabled: avoid recording public tokens or
sensitive query strings by default. Use bounded service logs for startup diagnosis.
A missing/incorrect API DNS record or blocked port 80 prevents public certificates.
No ACME request is needed for the local smoke test described below.

## Publish the dashboard later

Build the final dashboard with the generated public variables in `dashboard.env`.
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

With deployment authorization, upload assets and then the HTML shell:

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

**Copy backups off the VM** to an operator-chosen private, encrypted store. Same-host
dumps cannot survive VM/disk loss. No external backup service or upload is configured
here; its cost, credentials, and retention need an explicit choice. PostgreSQL
storage and backups have no automatic total-size cap: watch disk growth and define
an application history-retention policy before long-running public use.

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

The smoke test builds/reuses `rcp-control-plane:demo`, runs an isolated Compose
project with fake identity, disables queue polling, uses loopback HTTP Caddy, runs
Flyway on PostgreSQL 17.6, verifies anonymous API rejection/management hiding,
backs up/restores synthetic data, and cleans up only its own temporary resources.
It creates no AWS resources, calls no Cognito API, and does not request certificates.
It does not test the Phase 2 features that are absent from this branch's base.

## Updates and rollback

Build/tag the final merged image by commit on the target architecture. Back up
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
