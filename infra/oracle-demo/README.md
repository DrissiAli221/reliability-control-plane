# Oracle demo server

Terraform for the VM used by [`deploy/demo`](../../deploy/demo/README.md), separate
from the AWS resources and state in [`infra/aws-demo`](../aws-demo/README.md).

Creates six resources: one VCN, Internet Gateway, route table, restricted security
list, public subnet, and `VM.Standard.A1.Flex` instance. Defaults are **2 OCPUs,
12 GB RAM, and a 50 GB Balanced boot disk**. No NAT gateway, load balancer, managed
database, extra disk, or paid image is included.

The cloud-init bootstrap installs Docker Engine and Compose from Docker's signed
APT repository and prepares `/opt/rcp`. It does not clone a moving branch, provision
AWS credentials, copy secrets, or start the application. Deploy a reviewed release
using the existing server runbook after bootstrap succeeds.

## Free eligibility and limitations

Oracle's current Always Free ARM allowance is 1,500 OCPU-hours and 9,000 GB-hours
monthly, equivalent to **2 OCPUs / 12 GB**, with 200 GB combined boot/block storage.
These allowances are shared by the whole account. Check existing instances,
preserved disks, images, and any other allocation before deployment; bounded
variables do not establish account-wide eligibility or guarantee a zero bill.
The VM must use the home region, verified during a real plan. An explicit image
OCID pins an official Ubuntu 22.04/24.04 ARM64 release instead of selecting a
different latest image on every plan.

Capacity is not guaranteed. An out-of-capacity response can require waiting or
choosing another availability domain in the same home region. Inspect partial
state before retrying; do not launch parallel copies. Idle free VMs may be
reclaimed. Keep PostgreSQL backups outside this VM.

References, checked 2026-10-02:
[Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
[provider authentication](https://docs.oracle.com/en-us/iaas/Content/dev/terraform/configuring.htm),
[Docker installation](https://docs.docker.com/engine/install/ubuntu/),
[Docker firewall behavior](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

## Validate without creating resources

From the repository root:

```sh
./infra/oracle-demo/validate.sh
```

Requires Terraform 1.5+, Python 3, Bash, and OpenSSL. Initialization downloads the
pinned provider; it needs access to the Terraform registry. Validation makes an
isolated plan using dummy OCIDs, an ephemeral signing key, no cloud data sources,
and empty state. Real `terraform.tfvars`, OCI sessions, and deployed state are not
used. The plan checker and its regression tests reject public SSH/database ports,
oversized VM/disk configurations, unexpected resources, unsafe metadata, and VM
replacement. Rendered shell scripts also undergo Bash syntax checks.

Never apply the offline plan. This proves configuration and guardrails, not live
capacity, boot success, firewall behavior, free eligibility, or Docker compatibility.

## Prepare a real deployment

1. Refresh the local session. Credentials stay in `~/.oci/`; no private API key or
   session token belongs in Terraform variables, state, cloud-init, or Git.

   ```sh
   oci session authenticate --profile-name rcp-operator --region YOUR_HOME_REGION
   ```

   Tokens normally expire after one hour. Refresh before both plan and apply;
   a saved plan does not extend the session.

2. Obtain the tenancy OCID from your OCI profile and select an existing compartment.
   List availability domains and compatible images (replace placeholders):

   ```sh
   oci iam availability-domain list --compartment-id YOUR_TENANCY_OCID \
     --profile rcp-operator --auth security_token --query 'data[].name'
   oci compute image list --compartment-id YOUR_COMPARTMENT_OCID \
     --operating-system 'Canonical Ubuntu' --operating-system-version 24.04 \
     --shape VM.Standard.A1.Flex --all --profile rcp-operator --auth security_token \
     --query 'data[].{Name:"display-name",Id:id}'
   ```

   Choose a platform image with `aarch64`/`arm64` in its name, not a custom or
   Marketplace image. Verify the selected image's provenance in the console.

3. Use an existing SSH public key, or generate an operator-owned key **outside the
   repository**. Keep the matching private key locally. Copy
   `terraform.tfvars.example` to the ignored `terraform.tfvars` and replace all
   placeholders. Set `ssh_allowed_cidrs` to your current public IPv4 plus `/32`.
   It accepts IPv4 networks /24 or narrower; it never accepts `0.0.0.0/0`.

4. Keep this root's state separate from AWS/production. Local state is initially
   used with local locking; protect and back it up outside Git. Run Terraform from
   one operator machine at a time. If moving to shared automation, configure a
   protected remote backend with locking before use. Review a real plan:

   ```sh
   umask 077
   terraform -chdir=infra/oracle-demo init -lockfile=readonly
   terraform -chdir=infra/oracle-demo plan -out=oracle.tfplan
   terraform -chdir=infra/oracle-demo show -json oracle.tfplan > infra/oracle-demo/plan.json
   python3 infra/oracle-demo/check_plan.py infra/oracle-demo/plan.json
   ```

   Confirm region, compartment, image, SSH source, free allocation, and the six
   planned resources. `offline_mode` must be false. Plan/state files contain
   infrastructure identifiers and public SSH information; keep them private.
   Apply the reviewed plan only when deployment is authorized:

   ```sh
   terraform -chdir=infra/oracle-demo apply oracle.tfplan
   ```

## After provisioning

Get the public IPv4 using `terraform -chdir=infra/oracle-demo output -raw public_ip`.
Update DuckDNS with **this IP**, not the automatically detected IP of your laptop.
Only the public hostname and IP are needed by the application configuration;
DuckDNS tokens remain outside Terraform and Git.

Connect as `ubuntu` with your private key. Verify bootstrap before deployment:

```sh
sudo cloud-init status --wait --long
sudo test -f /var/lib/rcp-bootstrap-ready
sudo systemctl status docker rcp-firewall --no-pager
docker compose version
sudo iptables -S RCP-INPUT
sudo iptables -S RCP-DOCKER
```

Cloud-init installs the current stable Docker packages; record installed versions
and test upgrades. Log out/in after bootstrap to pick up Docker group membership.
If bootstrap failed, inspect `/var/log/cloud-init-output.log` before retrying.
Do not assume Terraform instance creation means the host is ready.

Both OCI and the host firewall restrict SSH and allow TCP 80/443. A dedicated
`DOCKER-USER` chain restricts Docker's forwarded public ports too, using their
original destination ports. UDP 443/HTTP3 and IPv6 are intentionally not enabled;
Caddy serves HTTPS over TCP. The script preserves OCI's existing rules and
link-local outbound storage access. Its systemd unit reapplies on reboot and
Docker restart. If your home IP changes, update the Terraform SSH CIDR and the
host's `/usr/local/sbin/rcp-firewall` through your current session/OCI console;
cloud-init is not rerun by a Terraform update. Check this before disconnecting.

Copy the reviewed release and configuration to `/opt/rcp` and follow
[`deploy/demo`](../../deploy/demo/README.md). Verify HTTPS, login, both probe regions,
read-only access, private database/management ports, and an off-host backup before
publishing the dashboard URL. Test external 80/443 reachability and restricted SSH
from an independent connection; local syntax checks do not prove packet filtering.

## Recovery and teardown

The instance uses `prevent_destroy`, so Terraform blocks its destruction and
replacement by default. `preserve_boot_volume=true` is an additional safeguard;
it does not replace backups or protect against provider-initiated reclamation.
Cloud-init and source-image changes are ignored for existing VMs: the bootstrap
runs once, and silently switching a live boot image could lose PostgreSQL data.
For an intentional replacement, preserve off-host backups, record the boot-volume
OCID, and review the recovery procedure before editing the lifecycle guard.
Preserved boot disks consume storage and may incur charges when free allocation
is exhausted. Do not delete a retained disk until its data is recovered or
confirmed disposable. Changing/removing the VM, AWS resources, DNS, and runtime
credentials are separate teardown steps.
