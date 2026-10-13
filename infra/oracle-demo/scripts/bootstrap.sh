#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

. /etc/os-release
if [[ "$ID" != ubuntu || ! "$VERSION_ID" =~ ^(22\.04|24\.04)$ || "$(dpkg --print-architecture)" != arm64 ]]; then
  echo 'This bootstrap requires Ubuntu 22.04/24.04 ARM64.' >&2
  exit 1
fi

# Install from Docker's signed APT repository, not a downloaded executable script.
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --retry 3 --connect-timeout 10 --max-time 120 \
  https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: arm64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Existing deployment commands run as ubuntu; Docker access is root-equivalent.
usermod -aG docker ubuntu
install -d -m 0750 -o ubuntu -g ubuntu /opt/rcp
systemctl daemon-reload
systemctl enable --now rcp-firewall.service
docker compose version
touch /var/lib/rcp-bootstrap-ready
