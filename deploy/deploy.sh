#!/usr/bin/env bash
#
# Deploy GNRS (Go API + embedded React SPA, SQLite) to a remote host.
#
# Strategy:
#   1. rsync the build context to the remote host over SSH.
#   2. On the remote, build the container image with podman and
#      (re)start the container.
#
# State (the SQLite database) lives in a named podman volume, so
# redeploys never touch existing data.
#
# Usage:
#   deploy/deploy.sh                 # deploy with the defaults below
#   HOST_PORT=9090 deploy/deploy.sh  # override any setting via env vars
#
set -euo pipefail

# --- Configuration (override via environment variables) ---------------------
REMOTE_HOST="${REMOTE_HOST:-loomino@10.8.0.1}"
REMOTE_DIR="${REMOTE_DIR:-~/gnrs-new}"   # leading ~ is expanded on the remote
HOST_PORT="${HOST_PORT:-8300}"           # host port; container always listens on 8080
IMAGE="${IMAGE:-gnrs-new:latest}"
CONTAINER="${CONTAINER:-gnrs-new}"
VOLUME="${VOLUME:-gnrs-new-data}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Deploying GNRS"
echo "    repo     : $REPO_ROOT"
echo "    target   : $REMOTE_HOST:$REMOTE_DIR"
echo "    image    : $IMAGE   container: $CONTAINER"
echo "    publish  : host ${HOST_PORT} -> container 8080"
echo

# --- 1. Sync the build context ----------------------------------------------
echo "==> Syncing source via rsync"
rsync -az --delete --human-readable \
  --exclude-from="$SCRIPT_DIR/rsync-exclude.txt" \
  -e ssh \
  "$REPO_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"

# --- 2. Build and run on the remote -----------------------------------------
echo "==> Building image and (re)starting container on $REMOTE_HOST"
ssh "$REMOTE_HOST" 'bash -s' -- \
  "$REMOTE_DIR" "$HOST_PORT" "$IMAGE" "$CONTAINER" "$VOLUME" <<'REMOTE'
set -euo pipefail
DIR="${1/#\~/$HOME}"   # expand a leading ~ to the remote $HOME
PORT="$2"; IMAGE="$3"; NAME="$4"; VOL="$5"

cd "$DIR"

# Ensure a .env exists. Generated once with a fresh JWT secret and then
# preserved across redeploys so the signing key (and sessions) stay stable.
if [ ! -f .env ]; then
  echo "    .env not found — generating from .env.example"
  SECRET="$(openssl rand -hex 32)"
  sed -e "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" \
      -e "s|^DATABASE_PATH=.*|DATABASE_PATH=/app/data/app.db|" \
      -e "s|^PORT=.*|PORT=8080|" \
      .env.example > .env
  echo "    generated .env with a fresh 32-byte JWT_SECRET"
  echo "    NOTE: review SEED_ADMIN_* and COOKIE_SECURE in ${DIR}/.env"
else
  echo "    reusing existing .env"
fi

echo "    building image ${IMAGE} (podman build)"
podman build -t "$IMAGE" .

podman volume exists "$VOL" || { echo "    creating volume ${VOL}"; podman volume create "$VOL" >/dev/null; }

echo "    (re)starting container ${NAME}"
podman rm -f "$NAME" >/dev/null 2>&1 || true
podman run -d --name "$NAME" \
  --env-file .env \
  -p "${PORT}:8080" \
  -v "${VOL}:/app/data" \
  --restart=unless-stopped \
  "$IMAGE" >/dev/null

echo "    container status:"
podman ps --filter "name=^${NAME}$" \
  --format "      {{.Names}}  {{.Status}}  {{.Ports}}"
REMOTE

echo
echo "==> Done. App is published on ${REMOTE_HOST%@*}@... host port ${HOST_PORT}"
echo "    Reach it at http://<remote-host>:${HOST_PORT}/"
