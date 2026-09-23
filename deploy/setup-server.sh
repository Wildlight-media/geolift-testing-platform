#!/bin/bash
# One-time setup for a fresh Ubuntu 24.04 server (DigitalOcean droplet or any VM).
# Run as root:  bash setup-server.sh
# Installs Docker, opens only SSH/80/443, and creates a read-only GitHub deploy
# key. Add the printed public key at:
#   github.com/wildlightmedia/geolift-testing-platform -> Settings -> Deploy keys
set -euo pipefail

apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw >/dev/null
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
systemctl enable --now docker

# Postgres/Redis/R stay on the internal Docker network; only Caddy is public.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f /root/.ssh/github_deploy ] || ssh-keygen -t ed25519 -f /root/.ssh/github_deploy -N "" -C "geolift-prod-deploy" -q
cat > /root/.ssh/config <<'CFG'
Host github.com
  IdentityFile /root/.ssh/github_deploy
  StrictHostKeyChecking accept-new
CFG

echo
echo "Add this as a read-only deploy key on the GitHub repo:"
cat /root/.ssh/github_deploy.pub
