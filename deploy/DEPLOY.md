# Deploying GNRS

`deploy/deploy.sh` ships this branch to a remote host: it **rsyncs** the build
context over SSH, then builds and runs the container with **podman** on the
remote.

## What it does

1. `rsync -az --delete` the repo to the remote, skipping secrets, dependencies,
   build outputs, and local data (see `deploy/rsync-exclude.txt`).
2. On the remote, `podman build` the image from the `Dockerfile` (Node + Go
   multi-stage; the React SPA is embedded into the Go binary).
3. `podman run` the container, replacing any previous one.

The SQLite database lives in a named podman volume, so redeploys never touch
existing data.

## Defaults

| Setting       | Value                  | Override env var |
|---------------|------------------------|------------------|
| Remote host   | `loomino@10.8.0.1`     | `REMOTE_HOST`    |
| Remote dir    | `~/gnrs-new`           | `REMOTE_DIR`     |
| Host port     | `8300` → container `8080` | `HOST_PORT`   |
| Image         | `gnrs-new:latest`      | `IMAGE`          |
| Container     | `gnrs-new`             | `CONTAINER`      |
| Data volume   | `gnrs-new-data`        | `VOLUME`         |

> The remote already has an **unrelated** project at `~/gnrs`, and host port
> `8080` is in use there — hence the distinct `~/gnrs-new` directory and port
> `8300`.

## Usage

```bash
# from the repo root, on this branch
deploy/deploy.sh

# override any setting
HOST_PORT=9090 REMOTE_DIR='~/gnrs-staging' deploy/deploy.sh
```

Requirements: SSH key access to the remote (no password prompts), and `rsync`
on both ends. The remote needs `podman` and `openssl` (both present).

## The remote `.env`

On the **first** deploy, if `<remote-dir>/.env` is missing, the script creates
it from `.env.example` with a freshly generated 32-byte `JWT_SECRET`. It is
**not** overwritten on later deploys, so the signing key stays stable.

After the first deploy, review the remote `.env` and set real values for:

- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`
  — the bootstrap admin, seeded only while the users table is empty.
- `COOKIE_SECURE=true` — set this once the app is served over HTTPS.

```bash
ssh loomino@10.8.0.1 'nano ~/gnrs-new/.env'
# then redeploy, or restart: ssh loomino@10.8.0.1 'podman restart gnrs-new'
```

## Operating the deployment

```bash
ssh loomino@10.8.0.1 'podman ps --filter name=gnrs-new'      # status
ssh loomino@10.8.0.1 'podman logs -f gnrs-new'               # logs
ssh loomino@10.8.0.1 'podman restart gnrs-new'               # restart
ssh loomino@10.8.0.1 'podman rm -f gnrs-new'                 # stop & remove
ssh loomino@10.8.0.1 'podman volume rm gnrs-new-data'        # DESTROYS the DB
```
