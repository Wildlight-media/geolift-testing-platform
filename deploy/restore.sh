#!/bin/bash
# Restores a backup taken on the old server into a fresh deployment.
# Run as root from /root/geolift after cloning the repo and filling in .env:
#   bash deploy/restore.sh /root/backup/geolift-<ts>.dump /root/backup/storage-<ts>.tgz
set -euo pipefail
DUMP="$1"
STORAGE="$2"
cd /root/geolift

docker compose up -d postgres redis
until docker compose exec -T postgres pg_isready -U geolift >/dev/null 2>&1; do sleep 2; done
docker compose exec -T postgres pg_restore -U geolift -d geolift --clean --if-exists --no-owner < "$DUMP"

# Uploaded dataset CSVs live in the backend_storage volume.
docker volume create geolift_backend_storage >/dev/null
tar -xzf "$STORAGE" -C /var/lib/docker/volumes/geolift_backend_storage/_data

docker compose up -d --build
docker compose ps
