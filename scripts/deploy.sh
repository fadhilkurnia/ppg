#!/usr/bin/env bash
# Deploy ppg-dashboard to a remote host that already has podman installed.
#
# Default target: laode@10.8.0.13
#
# What it does:
#   1. rsync the project source to $REMOTE_DIR on the remote (excluding
#      node_modules, build artefacts, local .env, .git, etc.). The project-root
#      app.db is included so a fresh remote can be seeded with it.
#   2. seed $REMOTE_DIR/.env from .env.example on first deploy (never overwrites
#      an existing remote .env)
#   3. `podman build` the image on the remote
#   4. ensure the named data volume contains app.db. On first deploy (or with
#      FORCE_SEED_DB=1) the bundled $REMOTE_DIR/app.db is copied into the volume;
#      otherwise the existing volume data is left untouched.
#   5. stop+remove the previous container, then `podman run` the new one with the
#      remote .env file and the named volume for SQLite persistence
#   6. tail the new container's logs for a few seconds so you can confirm it came up
#
# Usage:
#   scripts/deploy.sh                  # deploy to default host
#   SSH_HOST=user@host scripts/deploy.sh
#   PORT=9090 scripts/deploy.sh        # publish on a different host port
#   PUSH_ENV=1 scripts/deploy.sh       # also sync local .env to the remote (overwrites)
#   FORCE_SEED_DB=1 scripts/deploy.sh  # overwrite the remote volume's app.db with the local one
#
# Requirements on local: ssh, rsync.
# Requirements on remote: podman (already installed per project setup).

set -euo pipefail

SSH_HOST="${SSH_HOST:-laode@10.8.0.13}"
REMOTE_DIR="${REMOTE_DIR:-/home/laode/ppg}"
IMAGE="${IMAGE:-ppg-dashboard:latest}"
CONTAINER="${CONTAINER:-ppg-dashboard}"
VOLUME="${VOLUME:-ppg-data}"
PORT="${PORT:-8080}"
PUSH_ENV="${PUSH_ENV:-0}"
FORCE_SEED_DB="${FORCE_SEED_DB:-0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

say "Target: $SSH_HOST  ($REMOTE_DIR)"

# 1. Pre-flight: ssh reachable + podman present on remote.
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_HOST" 'command -v podman >/dev/null' \
  || { echo "podman not found on $SSH_HOST (or ssh failed)"; exit 1; }

# 2. Make sure the remote project directory exists.
ssh "$SSH_HOST" "mkdir -p '$REMOTE_DIR'"

# 3. Rsync source. Exclude artefacts and local-only files. The project-root
#    app.db is included (so a fresh remote can be seeded from it); any other
#    *.db files (journals, scratch copies, dbs in subdirs) are excluded.
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
  --include='/app.db'
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

# 4. Build + run on the remote. Everything from here is a single ssh session.
say "Building image and (re)starting container on remote"
ssh "$SSH_HOST" \
  REMOTE_DIR="$REMOTE_DIR" \
  IMAGE="$IMAGE" \
  CONTAINER="$CONTAINER" \
  VOLUME="$VOLUME" \
  PORT="$PORT" \
  FORCE_SEED_DB="$FORCE_SEED_DB" \
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

# Build the image. Same Dockerfile, no special args.
podman build -t "$IMAGE" .

# Make sure the data volume exists (idempotent).
podman volume inspect "$VOLUME" >/dev/null 2>&1 || podman volume create "$VOLUME"

# Stop and remove the old container if it exists. (Done before seeding so the
# DB file isn't held open by a running process when we touch it.)
if podman container exists "$CONTAINER"; then
  podman rm -f "$CONTAINER" >/dev/null
fi

# Seed the data volume with the bundled app.db. Only runs when the volume has
# no app.db yet, or when FORCE_SEED_DB=1 is set. We never silently clobber an
# existing remote DB.
if [[ -f "$REMOTE_DIR/app.db" ]]; then
  if podman run --rm --entrypoint /bin/sh \
       -v "$VOLUME:/app/data" \
       "$IMAGE" \
       -c 'test -f /app/data/app.db' 2>/dev/null; then
    has_db=1
  else
    has_db=0
  fi
  if [[ "$has_db" == "0" || "$FORCE_SEED_DB" == "1" ]]; then
    echo "Seeding volume $VOLUME from $REMOTE_DIR/app.db"
    podman run --rm --entrypoint /bin/sh \
      -v "$VOLUME:/app/data" \
      -v "$REMOTE_DIR/app.db:/seed/app.db:ro" \
      "$IMAGE" \
      -c 'cp /seed/app.db /app/data/app.db'
  else
    echo "Volume $VOLUME already has app.db — leaving it untouched (use FORCE_SEED_DB=1 to overwrite)."
  fi
else
  echo "No $REMOTE_DIR/app.db present — skipping volume seed."
fi

# Run the new container, detached, restart-on-failure, with the env file
# and persistent volume.
podman run -d \
  --name "$CONTAINER" \
  --restart=unless-stopped \
  --env-file "$REMOTE_DIR/.env" \
  -p "${PORT}:8080" \
  -v "${VOLUME}:/app/data" \
  "$IMAGE" >/dev/null

# Brief health check: show the last few log lines so the deploy reports any
# obvious crash-on-boot.
sleep 2
podman ps --filter "name=^${CONTAINER}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo '--- recent logs ---'
podman logs --tail 30 "$CONTAINER" || true
REMOTE

say "Done. App should be reachable at http://10.8.0.13:${PORT}"
