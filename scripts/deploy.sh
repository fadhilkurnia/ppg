#!/usr/bin/env bash
# Deploy ppg-dashboard to a remote host that already has podman + podman-compose.
#
# Default target: laode@10.8.0.13
#
# What it does:
#   1. rsync the project source to $REMOTE_DIR on the remote (excluding
#      node_modules, build artefacts, local .env, the local SQLite DB, .git, etc.)
#   2. seed $REMOTE_DIR/.env from .env.example on first deploy (never overwrites
#      an existing remote .env)
#   3. `podman-compose build` + `up -d` on the remote. The cloudflared sidecar
#      joins automatically iff CLOUDFLARE_TUNNEL_TOKEN is set in the remote .env.
#   4. drop any leftover standalone container from the older deploy path so we
#      transition cleanly to compose-managed containers
#   5. tail the new container logs for a few seconds so you can confirm boot
#
# The app's host port is bound to 127.0.0.1 in docker-compose.yml — external
# traffic reaches it only through the cloudflared tunnel.
#
# Usage:
#   scripts/deploy.sh                  # deploy to default host
#   SSH_HOST=user@host scripts/deploy.sh
#   PORT=9090 scripts/deploy.sh        # change the loopback host port
#   PUSH_ENV=1 scripts/deploy.sh       # also sync local .env to the remote (overwrites)
#
# Requirements on local: ssh, rsync.
# Requirements on remote: podman, podman-compose, rsync.

set -euo pipefail

SSH_HOST="${SSH_HOST:-laode@10.8.0.13}"
REMOTE_DIR="${REMOTE_DIR:-/home/laode/ppg}"
PORT="${PORT:-8080}"
PUSH_ENV="${PUSH_ENV:-0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

say "Target: $SSH_HOST  ($REMOTE_DIR)"

# 1. Pre-flight: ssh reachable + podman & podman-compose present on remote.
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" \
  'command -v podman >/dev/null && command -v podman-compose >/dev/null' \
  || { echo "podman or podman-compose not found on $SSH_HOST (or ssh failed)"; exit 1; }

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

# 4. Build + run on the remote via podman-compose.
say "Building image and (re)starting containers on remote"
ssh "$SSH_HOST" \
  REMOTE_DIR="$REMOTE_DIR" \
  PORT="$PORT" \
  bash -s <<'REMOTE'
set -euo pipefail

cd "$REMOTE_DIR"
export PORT

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

# Remove any leftover standalone container from the pre-compose deploy path.
# (Compose-managed containers carry an `io.podman.compose.project` label; raw
# `podman run` containers do not.)
if podman container exists ppg-dashboard; then
  labels="$(podman inspect ppg-dashboard --format '{{.Config.Labels}}' 2>/dev/null || true)"
  if [[ "$labels" != *io.podman.compose.project* ]]; then
    echo "Removing legacy standalone ppg-dashboard container."
    podman rm -f ppg-dashboard >/dev/null
  fi
fi

# Cloudflared joins iff a non-empty token is configured in .env.
token="$(grep -E '^CLOUDFLARE_TUNNEL_TOKEN=' .env | head -1 | cut -d= -f2- || true)"
profile_args=()
if [[ -n "$token" ]]; then
  profile_args=(--profile tunnel)
  echo "Cloudflare tunnel token present → cloudflared sidecar will run."
else
  echo "No CLOUDFLARE_TUNNEL_TOKEN set — skipping cloudflared sidecar."
fi

podman-compose "${profile_args[@]}" build
# --force-recreate so a freshly rebuilt image (same :latest tag) actually
# replaces the running container; without it podman-compose leaves the old
# container in place when the tag is unchanged.
podman-compose "${profile_args[@]}" up -d --force-recreate

sleep 3
podman ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo '--- app logs ---'
podman logs --tail 20 ppg-dashboard || true
if [[ -n "$token" ]]; then
  echo '--- cloudflared logs ---'
  podman logs --tail 20 ppg-cloudflared || true
fi
REMOTE

say "Done. App is on http://127.0.0.1:${PORT} on the remote; public access via Cloudflare Tunnel."
