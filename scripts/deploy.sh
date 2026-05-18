#!/usr/bin/env bash
# Deploy ppg-dashboard to a remote host that already has podman.
#
# Default target: loomino@10.8.0.1
#
# What it does:
#   1. rsync the project source to $REMOTE_DIR on the remote (excluding
#      node_modules, build artefacts, local .env, the local SQLite DB,
#      .git, etc.)
#   2. seed $REMOTE_DIR/.env from .env.example on first deploy (never
#      overwrites an existing remote .env)
#   3. `podman build` the image on the remote
#   4. tear down any previous deployment of this pod (and any legacy
#      podman-compose / standalone / imperative containers from older
#      deploy paths)
#   5. write Quadlet units for the pod + app (+ cloudflared sidecar iff a
#      CLOUDFLARE_TUNNEL_TOKEN is set in the remote .env) into the remote
#      user's `~/.config/containers/systemd/`, reload the systemd user
#      manager, and (re)start the services
#   6. tail the new container logs for a few seconds so you can confirm
#      boot
#
# The deployment is owned by the systemd **user** manager via Quadlet, so
# the pod survives reboots (the remote user has lingering enabled). To
# stop, start, or inspect a deployment, drive the generated user units:
#
#   systemctl --user stop    $POD_NAME-app.service
#   systemctl --user start   $POD_NAME-app.service
#   systemctl --user status  $POD_NAME-app.service
#
# The Quadlet source files live in `~/.config/containers/systemd/` on the
# remote; deleting them and running `systemctl --user daemon-reload`
# removes the units. The pod itself is still a normal podman pod
# ($POD_NAME) and can be inspected with `podman pod ps` / `podman ps`.
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
#   REMOTE_DIR=/home/loomino/ppg-dev-myslug \
#   PORT=18080 \
#   HOST_BIND_IP=10.8.0.1 \
#   scripts/deploy.sh
#
# Requirements on local: ssh, rsync.
# Requirements on remote: podman (>= 4.4, for Quadlet), rsync, a systemd
#   user manager with lingering enabled for the deploy user.

set -euo pipefail

SSH_HOST="${SSH_HOST:-loomino@10.8.0.1}"
REMOTE_DIR="${REMOTE_DIR:-/home/loomino/ppg}"
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

# 4. Build the image + (re)install the Quadlet units on the remote.
say "Building image and (re)installing Quadlet units on remote"
ssh "$SSH_HOST" \
  REMOTE_DIR="$REMOTE_DIR" \
  HOST_PORT="$PORT" \
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
# Note: .env carries a PORT= line for the app's *container-side* listen
# port; we keep that out of the host-port mapping by reading HOST_PORT
# from the deploy-time env instead of PORT.
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

# --- systemd user manager wiring ----------------------------------------
# A non-login ssh session has no DBus session bus by default, so point
# systemctl --user at the lingering user manager's runtime dir explicitly.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

if ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "systemd user manager is not reachable for $(id -un)." >&2
  echo "Ensure lingering is enabled (loginctl enable-linger $(id -un))." >&2
  exit 1
fi

QUADLET_DIR="$HOME/.config/containers/systemd"
mkdir -p "$QUADLET_DIR"

POD_UNIT="${POD_NAME}-pod.service"
APP_UNIT="${APP_CT}.service"
TUNNEL_UNIT="${TUNNEL_CT}.service"

# Stop any prior deployment of this pod so we can recreate it cleanly.
for unit in "$APP_UNIT" "$TUNNEL_UNIT" "$POD_UNIT"; do
  systemctl --user stop "$unit" >/dev/null 2>&1 || true
done

# Drop this pod's old Quadlet sources before regenerating them.
rm -f "$QUADLET_DIR/${POD_NAME}.pod" \
      "$QUADLET_DIR/${APP_CT}.container" \
      "$QUADLET_DIR/${TUNNEL_CT}.container"
systemctl --user daemon-reload

# Belt-and-suspenders: remove the pod if it survived (e.g. a pre-Quadlet
# imperative `podman pod create` deploy of the same name).
if podman pod exists "$POD_NAME"; then
  podman pod rm -f "$POD_NAME" >/dev/null
fi

# Tear down the legacy podman-compose pod (pod_<project>) and its containers
# atomically. Must come before the standalone-container sweep because
# ppg-dashboard and ppg-cloudflared are siblings inside that pod and refuse
# to be removed individually.
if podman pod exists pod_ppg && [[ "$POD_NAME" != "pod_ppg" ]]; then
  echo "Removing legacy podman-compose pod pod_ppg."
  podman pod rm -f pod_ppg >/dev/null
fi

# Catch standalone leftovers from the very earliest, pre-podman-compose
# deploy path (raw `podman run` containers with no pod).
for legacy in ppg-dashboard ppg-cloudflared; do
  if podman container exists "$legacy"; then
    echo "Removing legacy standalone $legacy container."
    podman rm -f "$legacy" >/dev/null
  fi
done

# --- write the Quadlet units --------------------------------------------
# `<name>.pod`       → systemd unit `<name>-pod.service`
# `<name>.container` → systemd unit `<name>.service`
# `[Install] WantedBy=default.target` makes the Quadlet generator enable
# the units on `daemon-reload`, so the pod comes back after a reboot.

cat > "$QUADLET_DIR/${POD_NAME}.pod" <<EOF
# Managed by scripts/deploy.sh — regenerated on every deploy.
[Unit]
Description=ppg-dashboard pod (${POD_NAME})

[Pod]
PodName=${POD_NAME}
PublishPort=${HOST_BIND_IP}:${HOST_PORT}:8080
# Quadlet defaults the pod to --exit-policy stop, which tears the whole
# pod down the moment the app container exits — that stops the pod
# cleanly, so neither the pod's nor the app's Restart= ever fires.
# --exit-policy continue keeps the infra container alive so the app
# unit's Restart=always can recreate just the app container in place.
PodmanArgs=--exit-policy=continue

[Install]
WantedBy=default.target
EOF

cat > "$QUADLET_DIR/${APP_CT}.container" <<EOF
# Managed by scripts/deploy.sh — regenerated on every deploy.
[Unit]
Description=ppg-dashboard app (${APP_CT})

[Container]
ContainerName=${APP_CT}
Image=localhost/${IMAGE_TAG}
Pod=${POD_NAME}.pod
Volume=${VOLUME_NAME}:/app/data
Environment="JWT_SECRET=${JWT_SECRET}"
Environment="JWT_TTL=${JWT_TTL:-24h}"
Environment="COOKIE_SECURE=${COOKIE_SECURE:-false}"
Environment="DATABASE_PATH=/app/data/app.db"
Environment="SEED_ADMIN_EMAIL=${SEED_ADMIN_EMAIL:-}"
Environment="SEED_ADMIN_USERNAME=${SEED_ADMIN_USERNAME:-}"
Environment="SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD:-}"
Environment="DYNAMIC_API_PATH=${DYNAMIC_API_PATH:-false}"

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
# The app unit embeds JWT_SECRET — keep it readable only by the owner.
chmod 600 "$QUADLET_DIR/${APP_CT}.container"

# Cloudflared sidecar — joins the same pod iff a token is configured. From
# inside the pod it reaches the app at `localhost:8080`, so the public
# hostname in the Cloudflare dashboard should still target localhost:8080.
if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "Cloudflare tunnel token present → cloudflared sidecar will run."
  cat > "$QUADLET_DIR/${TUNNEL_CT}.container" <<EOF
# Managed by scripts/deploy.sh — regenerated on every deploy.
[Unit]
Description=cloudflared sidecar for ppg-dashboard (${TUNNEL_CT})

[Container]
ContainerName=${TUNNEL_CT}
Image=docker.io/cloudflare/cloudflared:latest
Pod=${POD_NAME}.pod
Environment="TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}"
Exec=tunnel --no-autoupdate run

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
  chmod 600 "$QUADLET_DIR/${TUNNEL_CT}.container"
else
  echo "No CLOUDFLARE_TUNNEL_TOKEN set — skipping cloudflared sidecar."
fi

# --- (re)start via the systemd user manager -----------------------------
systemctl --user daemon-reload

systemctl --user restart "$APP_UNIT"
if [[ -f "$QUADLET_DIR/${TUNNEL_CT}.container" ]]; then
  systemctl --user restart "$TUNNEL_UNIT"
fi

sleep 3
echo
echo '=== systemd user units ==='
systemctl --user --no-pager --no-legend list-units "${POD_NAME}*" || true
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

say "Done. App is on http://${HOST_BIND_IP}:${PORT} on the remote; if cloudflared is running (token in .env), public access is via the Cloudflare Tunnel."
say "Pod is managed by the systemd user manager — it will restart on boot."
