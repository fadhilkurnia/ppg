#!/usr/bin/env bash
# Move the current uncommitted/untracked work off main onto a feature branch,
# following RULES.md (no direct commits to main).
#
# Run from the repo root:
#   bash scripts/move-changes-off-main.sh
#
# The work in main spans four entangled subsystems:
#   - bulk CSV import/export
#   - scopes hierarchy
#   - roles catalogue + bindings
#   - users-extended (refresh tokens, archive, scope/role-aware list)
#
# `handler/auth.go` ties them together — `NewAuth(users, scopes, roles, jwt, ...)`
# requires all four to build. Splitting into independent branches would leave
# each one broken on its own. Keeping them in one branch with one PR honors
# "create a new branch" from RULES.md and keeps the build green at every step.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BRANCH="feat/bulk-import-export"
BASE="main"

if [[ "$(git rev-parse --abbrev-ref HEAD)" != "$BASE" ]]; then
  echo "error: must run from $BASE (currently on $(git rev-parse --abbrev-ref HEAD))" >&2
  exit 1
fi

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "branch $BRANCH already exists locally; aborting to avoid clobbering" >&2
  echo "delete it first with:  git branch -D $BRANCH" >&2
  exit 1
fi

echo "==> creating $BRANCH from $BASE"
git switch -c "$BRANCH"

echo "==> staging tracked modifications"
git add \
  cmd/server/main.go \
  internal/auth/jwt.go \
  internal/auth/middleware.go \
  internal/handler/auth.go

echo "==> staging new files"
git add \
  internal/bulk/ \
  internal/handler/bulk.go \
  internal/handler/bulk_test.go \
  internal/handler/roles.go \
  internal/handler/scopes.go \
  internal/handler/users.go \
  internal/model/role.go \
  internal/model/scope.go \
  internal/store/attendances_bulk.go \
  internal/store/migrations/011_add_scopes.up.sql \
  internal/store/migrations/011_add_scopes.down.sql \
  internal/store/migrations/012_add_roles.up.sql \
  internal/store/migrations/012_add_roles.down.sql \
  internal/store/roles.go \
  internal/store/roles_test.go \
  internal/store/scopes.go \
  internal/store/scopes_test.go \
  internal/store/students_bulk.go \
  internal/store/teachers_bulk.go \
  internal/store/users_bulk.go \
  internal/store/users_extended.go

echo "==> verifying build before commit"
go build ./...
go test ./internal/bulk/... ./internal/store/... ./internal/handler/... -count=1

echo "==> committing"
git commit -m "feat(bulk): add CSV import/export with RBAC scaffold" -m "$(cat <<'EOF'
Implements docs/missing-features/24-bulk-operations.md and pulls in the
RBAC scaffolding it depends on (docs 11-scope-hierarchy and
12-user-and-roles), since handler/auth.go now constructs sessions from
scope and role bindings.

Subsystems:
- internal/bulk: generic CSV Importer/Exporter/Deleter with per-row
  outcome report, dry-run, upsert, BOM-tolerant reader.
- store adapters: teachers_bulk, students_bulk, attendances_bulk,
  users_bulk all satisfy the bulk interfaces; natural-key upserts.
- migrations 011 (scopes + user_scopes) and 012 (roles + user_roles,
  rebuilds users to drop legacy CHECK and add refresh_jti + status).
- auth: JWT.IssueScoped carries roles/scopes; refresh-token flow
  rotates on every login with a jti recorded in users.refresh_jti.
- handlers: /api/scopes, /api/roles, /api/users with scope+role checks;
  /api/{entity}/bulk, /api/{entity}/export.csv, /api/{entity}/bulk/schema.

The legacy importer CLI now runs on top of internal/bulk so there is
one code path for "ingest a CSV row by row".
EOF
)"

echo "==> pushing to origin"
git push -u origin "$BRANCH"

echo "==> opening PR"
if command -v gh >/dev/null 2>&1; then
  gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title "feat(bulk): CSV import/export with RBAC scaffold" \
    --body "$(cat <<'EOF'
## Summary

Implements `docs/missing-features/24-bulk-operations.md` and the RBAC
scaffolding it depends on (`11-scope-hierarchy`, `12-user-and-roles`).
The pieces are interdependent — `handler/auth.go` now builds sessions
from scope and role bindings, so they ship as a single PR rather than
a stack that breaks the build at intermediate commits.

### What this adds

- **`internal/bulk`** — generic CSV pipeline with `Importer`,
  `Exporter`, `Deleter` interfaces. Per-row outcome report,
  create/upsert/dry-run modes, BOM-tolerant header parse.
- **Per-entity adapters** in `internal/store/{teachers,students,attendances,users}_bulk.go`
  with natural-key upserts (e.g. teachers match on
  name+kelompok+desa+daerah).
- **Migration 011** — `scopes` (daerah → desa → kelompok) and
  `user_scopes` with one-primary uniqueness.
- **Migration 012** — `roles` catalogue, `user_roles` bindings,
  and a users-table rebuild that drops the legacy `role` CHECK and
  adds `refresh_jti` + `status`.
- **Auth** — `JWT.IssueScoped` carries roles and effective scope IDs;
  refresh-token flow rotates on login with a server-side `refresh_jti`
  for revocation.
- **HTTP** — `/api/scopes`, `/api/roles`, `/api/users` (scope- and
  role-aware), `/api/{entity}/bulk`, `/api/{entity}/export.csv`,
  `/api/{entity}/bulk/schema`.
- **CLI parity** — `server import-teachers` now runs on top of
  `internal/bulk`, so there is one code path for CSV ingestion.

## Test plan

- [ ] `go build ./...` passes (script enforces before commit).
- [ ] `go test ./internal/bulk/... ./internal/store/... ./internal/handler/...` passes.
- [ ] Migrate a fresh DB; confirm 9 seeded scopes and 6 seeded roles.
- [ ] `POST /api/teachers/bulk` with the legacy `teachers_data.csv`
      returns a per-row report and the rows show up in
      `GET /api/teachers/export.csv`.
- [ ] Login → `Set-Cookie: auth_refresh` is present; calling
      `POST /api/auth/refresh` rotates both cookies.
- [ ] Admin login carries `role=admin`; staff login carries effective
      scope IDs in the token claims.
EOF
)"
else
  echo "gh CLI not found — branch is pushed; open the PR manually:"
  echo "  https://github.com/fadhilkurnia/ppg/compare/$BASE...$BRANCH"
fi

echo
echo "done. main is now clean; $BRANCH carries the work."
