# PPG Dashboard

A small school dashboard with user auth and student records. Single-binary
Go backend embedding a React SPA, SQLite for storage. Production image is
~30 MB.

## Stack

- **Backend** – Go 1.22, [chi](https://github.com/go-chi/chi), SQLite
  (`mattn/go-sqlite3`), embedded migrations (`golang-migrate`), JWT in an
  httpOnly cookie (`golang-jwt`), bcrypt, structured logs (`log/slog`).
- **Frontend** – Vite 5, React 18, TypeScript (strict), TanStack Router
  (file-based, type-safe), TanStack Query, Tailwind v3, React Hook Form
  + Zod, lucide-react.
- **Packaging** – Multi-stage Docker build, single static binary with the
  SPA embedded via `go:embed`. Alpine base.

## Layout

```
cmd/server/         entrypoint
internal/
  auth/             JWT issue/verify, middleware, role gates
  config/           env-var config
  handler/          HTTP handlers (auth, students)
  httpx/            JSON helpers
  model/            domain types (User, Student)
  store/            SQLite queries + embedded migrations
web/
  app/              Vite + React SPA source
  dist/             SPA build output (generated; only .gitkeep tracked)
  embed.go          go:embed wrapper for the SPA
```

## Required toolchain

- **Local dev** – Go ≥ 1.22, Node ≥ 20, pnpm 9 (managed via corepack).
- **Docker only** – just Docker; the image builds Node + Go itself.

## Quick start (Docker)

```bash
cp .env.example .env          # edit JWT_SECRET (≥ 32 chars), seed admin
docker compose up --build
# → http://localhost:8080
```

The compose file persists SQLite to a named volume (`ppg-data`).

## Quick start (local dev)

```bash
# install frontend deps
pnpm --dir web/app install

# run API on :8080 and Vite on :5173 in parallel
make dev
# → SPA: http://localhost:5173 (proxies /api to :8080)
```

`DEV=1` makes the Go server skip the embedded SPA so Vite owns the
frontend.

## Building a single binary locally

```bash
make build         # builds SPA into web/dist/, then Go binary at ./server
JWT_SECRET=... ./server
```

## Tests

```bash
go test ./...                 # store + auth tests
pnpm --dir web/app typecheck  # frontend type-check
```

## Configuration

All runtime config is via env vars. See [`.env.example`](./.env.example).

| Variable               | Required | Default            | Notes                                                     |
| ---------------------- | -------- | ------------------ | --------------------------------------------------------- |
| `JWT_SECRET`           | yes      | —                  | HMAC secret, ≥ 32 bytes (`openssl rand -hex 32`)          |
| `JWT_TTL`              | no       | `24h`              | Go duration                                               |
| `COOKIE_SECURE`        | no       | `false`            | Set `true` behind HTTPS                                   |
| `DATABASE_PATH`        | no       | `./data/app.db`    | SQLite file path                                          |
| `PORT`                 | no       | `8080`             | HTTP listen port                                          |
| `DEV`                  | no       | `false`            | Skip serving the embedded SPA (Vite handles frontend)     |
| `SEED_ADMIN_EMAIL`     | no       | —                  | First-boot admin (created only if `users` is empty)       |
| `SEED_ADMIN_PASSWORD`  | no       | —                  | First-boot admin password                                 |
| `DYNAMIC_API_PATH`     | no       | `false`            | Expose `/api/*` under a per-session 12-hex prefix (CSRF defence-in-depth) |

## API surface

```
POST   /api/auth/login        # body: {email, password}
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/students          ?q=&limit=&offset=
POST   /api/students          (admin)
GET    /api/students/{id}
PATCH  /api/students/{id}     (admin)
DELETE /api/students/{id}     (admin)

GET    /healthz
```

Errors follow `{"error":{"code":"...","message":"..."}}`.

## Dynamic API path

When `DYNAMIC_API_PATH=true`, the server issues a 12-lowercase-hex prefix
on each successful login (cookie `auth_path`) and exposes the entire
`/api/*` surface under `/<prefix>/*` as well. Both routes accept the same
requests; the prefix is validated against the cookie with a constant-time
compare, mismatches return `403 bad_api_path`.

The login (`POST /api/auth/login`) and self (`GET /api/auth/me`) response
bodies carry an additional `apiBase` field whose value is the prefix
(`/4a69a5e08ee7`) when enabled, or `/api` otherwise. The embedded SPA's
`index.html` is templated at serve time so the same value is mirrored in
a `<meta name="ppgus-api-base">` tag and read at boot.

Disabled by default. See
[`docs/missing-features/50-security-hardening.md`](./docs/missing-features/50-security-hardening.md)
§3 for the threat model.

## Roles

- `admin` – full CRUD on students.
- `staff` – read-only.

Role is stored on the user row; the seed admin is created with `admin`.

## Notes

- `pnpm build` writes into `web/dist/`. That directory is gitignored
  (only `.gitkeep` is tracked) — don't commit build output.
- TanStack Router generates `web/app/src/routeTree.gen.ts` on `vite dev`
  / `vite build`. It's gitignored.
- The container runs as a non-root user (`app`, UID 1001). If you
  bind-mount `./data` into the container, chown the host directory
  to UID 1001 first; otherwise use the named volume in the compose
  file.

## Database schema

See [`docs/schema.md`](./docs/schema.md) for an authoritative reference of
every table, enum, and migration. Update it whenever you add a migration.

## Project rules

See [`RULES.md`](./RULES.md) — branch + PR workflow, commit message
format.
