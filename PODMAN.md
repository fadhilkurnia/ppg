# Running GNRS with Podman

The `Dockerfile` and `docker-compose.yml` are already Podman-compatible —
**no project files were changed.** Podman builds the `Dockerfile` natively and
`podman compose` reads `docker-compose.yml` as-is. This guide just covers the
Podman-specific setup and commands.

**Verified on this machine:** Podman 5.8.2, `podman-machine-default`
(WSL backend, running). `.env` is present and configured (host port `8300`).

## One-time setup — install a Compose provider

**✓ Already installed on this machine** — `docker-compose.exe` (the official
Docker Compose binary) is in Podman's program folder and `podman compose` uses
it automatically. The steps below are kept for reference and other machines.

`podman compose` is a thin wrapper; it needs an external Compose engine.
Install the Docker Compose v2 binary — a single self-contained `.exe`, no
Docker daemon and no Python — into Podman's program folder, which is already
on `PATH`:

```powershell
$dest = "$env:LOCALAPPDATA\Programs\Podman\docker-compose.exe"
Invoke-WebRequest `
  -Uri "https://github.com/docker/compose/releases/latest/download/docker-compose-windows-x86_64.exe" `
  -OutFile $dest
podman compose version    # should now print a version
```

`podman compose` automatically points this engine at the Podman socket — no
Docker Desktop required.

## Run it

From `d:\Podman\GNRS`:

```powershell
podman compose up --build -d     # build the image and start, detached
podman compose logs -f           # follow logs
```

Open **http://localhost:8300** (host port `8300` from `.env`, mapped to the
container's `8080`).

Stop / clean up:

```powershell
podman compose down              # stop; keep the gnrs-data volume
podman compose down -v           # stop and delete the SQLite volume
```

## Or: run without a Compose provider

This single-service app doesn't actually need Compose — you can run it right
now with plain Podman:

```powershell
podman build -t gnrs:latest .
podman volume create gnrs-data
podman run -d --name gnrs --env-file .env -p 8300:8300 `
  -v gnrs-data:/app/data --restart=unless-stopped gnrs:latest
```

`--env-file .env` supplies `JWT_SECRET`, `DATABASE_PATH=/app/data/app.db` and
`PORT=8300`, so the server listens on `8300` inside the container — hence
`-p 8300:8300`. (The compose file instead keeps the container on `8080` and
only varies the *host* port; both approaches work.)

## Notes

- **`.dockerignore` is honored** — Buildah checks `.containerignore` first, then
  falls back to `.dockerignore`. No rename needed. (`PODMAN.md` was added to it
  so this guide stays out of the build context.)
- The **`# syntax=docker/dockerfile:1.7`** line is a BuildKit directive that
  Buildah ignores. This Dockerfile uses no BuildKit-only features (no
  `RUN --mount`, no heredocs), so `podman build` produces an identical image.
- Runs fine **rootless** (the default): host port `8300` is above 1024, and the
  named volume `gnrs-data` is created and owned correctly for the container's
  non-root UID 1001 automatically — no host `chown` needed.
- **Drive location is not a problem here:** the build context is streamed to
  the Podman machine and storage is a named volume (not a host bind-mount), so
  running from `D:\` works without extra configuration.
