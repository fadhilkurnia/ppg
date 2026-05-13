#!/usr/bin/env bash
# Deploy ppg-dashboard to a remote host that already has podman.
#
# Default target: laode@10.8.0.13
#
# What it does:
#   1. rsync the project source to $REMOTE_DIR on the remote (excluding
#      node_modules, build artefacts, local .env, the local SQLite DB,
#      .git, etc.)
#   2. seed $REMOTE_DIR/.env from .env.example on first deploy (never
#      overwrites an existing remote .env)
#   3. `podman build` the image on the remote
#   4. tear down any previous deployment of this pod (and any legacy
#      podman-compose / standalone containers from the older deploy path)
#   5. `podman pod create` + `podman run --pod` the app, and — iff a
#      CLOUDFLARE_TUNNEL_TOKEN is set in the remote .env — the cloudflared
#      sidecar inside the same pod (so cloudflared reaches the app via
#      `localhost:8080` over the pod's shared network namespace)
#   6. tail the new container logs for a few seconds so you can confirm
#      boot
#
# All containers for one deployment live in a single podman pod. To stop,
# start, or remove a deployment you only need to manage the pod:
#
#   podman pod stop  $POD_NAME
#   podman pod start $POD_NAME
#   podman pod rm -f $POD_NAME
#
# Usage:
#   scripts/deploy.sh                       # prod-style deploy to default host
#   SSH_HOST=user@host scripts/deploy.sh
#   PORT=9090 scripts/deploy.sh             # change the host port
#   PUSH_ENV=1 scripts/deploy.sh            # also sync local .env (overwrites)
#
#   # Per-branch dev pod (parallel agents — see CLAUDE.md):
#   POD_NAME=ppg-dev-myslug \
#   VOLUME_NAME=ppg-data-dev-myslug \
#   IMAGE_TAG=ppg-dashboard-dev-myslug:latest \
#   REMOTE_DIR=/home/laode/ppg-dev-myslug \
#   PORT=18080 \
#   HOST_BIND_IP=10.8.0.13 \
#   scripts/deploy.sh
#
# Requirements on local: ssh, rsync.
# Requirements on remote: podman, rsync.

set -euo pipefail

SSH_HOST="${SSH_HOST:-laode@10.8.0.13}"
REMOTE_DIR="${REMOTE_DIR:-/home/laode/ppg}"
PORT="${PORT:-8080}"
HOST_BIND_IP="${HOST_BIND_IP:-127.0.0.1}"
POD_NAME="${POD_NAME:-ppg-prod}"
APP_CT="${APP_CT:-${POD_NAME}-app}"
TUNNEL_CT="${TUNNEL_CT:-${POD_NAME}-cloudflared}"
# Default to the existing podman-compose-era volume so prod data survives
# the cutover. Override (e.g. VOLUME_NAME=ppg-data-dev-myslug) for dev pods.
VOLUME_NAME="${VOLUME_NAME:-ppg_ppg-data}"
IMAGE_TAG="${IMAGE_TAG:-ppg-dashboard:latest}"
PUSH_ENV="${PUSH_ENV:-0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

say "Target: $SSH_HOST  ($REMOTE_DIR)"
say "Pod:    $POD_NAME  →  $HOST_BIND_IP:$PORT  (volume: $VOLUME_NAME, image: $IMAGE_TAG)"

# 1. Pre-flight: ssh reachable + podman present on remote.
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" \
  'command -v podman >/dev/null' \
  || { echo "podman not found on $SSH_HOST (or ssh failed)"; exit 1; }

# 2. Make sure the remote project directory exists.
ssh "$SSH_HOST" "mkdir -p '$REMOTE_DIR'"

# 3. Rsync source. Exclude artefacts and local-only files. We never push the
#    local SQLite DB — the remote keeps its own data in the named volume.
say "Syncing source → $SSH_HOST:$REMOTE_DIR"
RSYNC_EXCLUDES=(
  --exclude='.git/'
  --exclude='.claude/'
  --exclude='.idea/'
  --exclude='.vscode/'
  --exclude='.pnpm-store/'
  --exclude='node_modules/'
  --exclude='web/app/node_modules/'
  --exclude='web/app/dist/'
  --exclude='web/dist/*'
  --include='web/dist/.gitkeep'
  --exclude='data/'
  --exclude='*.db'
  --exclude='*.db-journal'
  --exclude='*.db-shm'
  --exclude='*.db-wal'
  --exclude='*.tsbuildinfo'
  --exclude='/server'
  --exclude='*.csv'
)
if [[ "$PUSH_ENV" != "1" ]]; then
  RSYNC_EXCLUDES+=(--exclude='.env')
fi
rsync -az --delete "${RSYNC_EXCLUDES[@]}" ./ "$SSH_HOST:$REMOTE_DIR/"

# 4. Build the image + recreate the pod on the remote.
say "Building image and (re)creating pod on remote"
ssh "$SSH_HOST" \
  REMOTE_DIR="$REMOTE_DIR" \
  PORT="$PORT" \
  HOST_BIND_IP="$HOST_BIND_IP" \
  POD_NAME="$POD_NAME" \
  APP_CT="$APP_CT" \
  TUNNEL_CT="$TUNNEL_CT" \
  VOLUME_NAME="$VOLUME_NAME" \
  IMAGE_TAG="$IMAGE_TAG" \
  bash -s <<'REMOTE'
set -euo pipefail

cd "$REMOTE_DIR"

# Seed .env from .env.example on first deploy. Don't clobber an existing one.
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    chmod 600 .env
    echo "Created $REMOTE_DIR/.env from .env.example — edit it before relying on prod."
  else
    echo "Warning: no .env on remote and no .env.example to seed from." >&2
  fi
fi

# Load .env so we can read JWT_SECRET, the optional CLOUDFLARE_TUNNEL_TOKEN,
# etc. into this shell. `set -a` exports every assignment automatically.
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "JWT_SECRET is empty in $REMOTE_DIR/.env — refusing to deploy." >&2
  exit 1
fi

# Build the app image from the synced source.
podman build -t "$IMAGE_TAG" .

# Make sure the data volume exists.
if ! podman volume exists "$VOLUME_NAME"; then
  podman volume create "$VOLUME_NAME" >/dev/null
fi

# Tear down legacy standalone containers from the pre-pod deploy path.
for legacy in ppg-dashboard ppg-cloudflared; do
  if podman container exists "$legacy"; then
    echo "Removing legacy standalone $legacy container."
    podman rm -f "$legacy" >/dev/null
  fi
done

# Tear down the legacy podman-compose pod (pod_<project>) if it lingers.
if podman pod exists pod_ppg && [[ "$POD_NAME" != "pod_ppg" ]]; then
  echo "Removing legacy podman-compose pod pod_ppg."
  podman pod rm -f pod_ppg >/dev/null
fi

# Recreate the pod from scratch so we pick up new images / port changes.
if podman pod exists "$POD_NAME"; then
  podman pod rm -f "$POD_NAME" >/dev/null
fi

podman pod create \
  --name "$POD_NAME" \
  --publish "${HOST_BIND_IP}:${PORT}:8080" \
  >/dev/null

# App container — runs inside the pod, listens on :8080.
podman run -d --pod "$POD_NAME" \
  --name "$APP_CT" \
  --restart unless-stopped \
  -e JWT_SECRET="$JWT_SECRET" \
  -e JWT_TTL="${JWT_TTL:-24h}" \
  -e COOKIE_SECURE="${COOKIE_SECURE:-false}" \
  -e DATABASE_PATH=/app/data/app.db \
  -e SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-}" \
  -e SEED_ADMIN_USERNAME="${SEED_ADMIN_USERNAME:-}" \
  -e SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}" \
  -e DYNAMIC_API_PATH="${DYNAMIC_API_PATH:-false}" \
  -v "${VOLUME_NAME}:/app/data" \
  "$IMAGE_TAG" \
  >/dev/null

# Cloudflared sidecar — joins the same pod iff a token is configured. From
# inside the pod it reaches the app at `localhost:8080`, so the public
# hostname in the Cloudflare dashboard should still target localhost:8080.
if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "Cloudflare tunnel token present → cloudflared sidecar will run."
  podman run -d --pod "$POD_NAME" \
    --name "$TUNNEL_CT" \
    --restart unless-stopped \
    -e TUNNEL_TOKEN="$CLOUDFLARE_TUNNEL_TOKEN" \
    docker.io/cloudflare/cloudflared:latest \
    tunnel --no-autoupdate run \
    >/dev/null
else
  echo "No CLOUDFLARE_TUNNEL_TOKEN set — skipping cloudflared sidecar."
fi

sleep 3
echo
echo '=== pod ==='
podman pod ps --filter "name=^${POD_NAME}\$" --format \
  'table {{.Name}}\t{{.Status}}\t{{.NumberOfContainers}}'
echo
echo '=== containers ==='
podman ps --filter "pod=${POD_NAME}" --format \
  'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo
echo "--- ${APP_CT} logs ---"
podman logs --tail 20 "$APP_CT" || true
if podman container exists "$TUNNEL_CT"; then
  echo "--- ${TUNNEL_CT} logs ---"
  podman logs --tail 20 "$TUNNEL_CT" || true
fi
REMOTE

say "Done. App is on http://${HOST_BIND_IP}:${PORT} on the remote; if cloudflared is running, public access is via the Cloudflare Tunnel."
