---
topic: testing strategy and migration practices
depends-on: [10-domain-model-evolution.md]
enables: []
key-concepts: [characterization-tests, snapshot-tests, additive-migration, fixture-data, sqlite-vs-postgres]
---

# 60 — Testing & Migration

## TL;DR

A safe path from "current ppgus" to "ppgus with every doc 11–51 implemented" requires (a) explicit regression coverage of the existing endpoints, (b) additive-only migrations, (c) a smoke harness that exercises real CSV imports and HTTP request snapshots, and (d) an optional PostgreSQL track once SQLite limits start to bite.

Checklist:

- [ ] Capture HTTP snapshot tests for every existing endpoint (`students`, `teachers`, `attendances`, `stats`).
- [ ] Adopt the additive migration rules in §3.
- [ ] Set up a test data factory in `internal/store/testdata/`.
- [ ] Add an end-to-end smoke harness (Go test that boots a server and probes endpoints).
- [ ] Document a PostgreSQL migration plan (optional track).

---

## 1. Test taxonomy

| Type | What | Where |
|---|---|---|
| Unit | Pure-Go helpers (JWT, QR token, password hash) | `internal/<pkg>/*_test.go` |
| Store | DB-backed queries against a real in-memory SQLite | `internal/store/*_test.go` |
| Handler | HTTP requests via `httptest`, real store, real auth middleware | `internal/handler/*_test.go` |
| Characterisation / snapshot | Capture current JSON shape of existing endpoints; assert on every PR | `internal/test/snapshots/*.json` + `*_test.go` |
| Smoke | Boot the full server, run a sequence of HTTP calls against it | `cmd/server/smoke_test.go` |
| Frontend type-check | `pnpm --dir web/app typecheck` | CI step |

The existing repo already uses the **store** style. Reuse the same `newTestDB(t)` helper.

## 2. Characterisation tests for legacy endpoints

Before any of the new tables ship, lock down the existing behaviour:

```go
// internal/handler/students_snapshot_test.go
func TestStudentsListShapeUnchanged(t *testing.T) {
    db := newTestDB(t)
    seedFixtures(db, "students-baseline")
    s := setupServer(t, db)
    req := httptest.NewRequest("GET", "/api/students?limit=2", nil)
    req.AddCookie(testAuthCookie())
    rec := httptest.NewRecorder()
    s.ServeHTTP(rec, req)
    assertSnapshot(t, "students-list", rec.Body.Bytes())
}
```

`assertSnapshot` loads `internal/test/snapshots/students-list.json` and diffs against current output, ignoring volatile fields (`createdAt`, `updatedAt`, ULIDs) via a registered replacer. On first run, the test writes the snapshot; subsequent runs assert.

Snapshot files live in version control. Updating them is intentional, not accidental.

Targets (all existing routes):

- `GET /api/students` (list, get, with q, with kelompok filter).
- `POST/PATCH/DELETE /api/students`.
- Same for `/teachers`, `/attendances`.
- `GET /api/stats/dashboard`, `/api/stats/attendance`.

## 3. Migration rules

### 3.1 Numbering

- Latest in main today: `010_level_required`.
- New migrations start at `011_*` and increment.
- Never reuse a number.

### 3.2 Reversibility

Every `.up.sql` has a paired `.down.sql`. The `.down.sql` drops what `.up.sql` created — nothing more. It does **not** restore prior data.

### 3.3 Additive

- New columns must be `NULL` or have a `DEFAULT`.
- New `CHECK` constraints on existing tables go on **new** columns only — SQLite cannot ALTER constraints in place. If a tighter constraint is needed on an existing column, plan a table-rebuild migration in a separate PR and gate it behind a deploy.
- Renaming columns is forbidden. Instead, add the new name, dual-write, migrate readers, drop the old in a later migration.
- Dropping tables or columns requires a deprecation window of at least one minor release.

### 3.4 Migration tests

`internal/store/migrations_test.go` already exercises `store.Open()` on a fresh DB. Augment with:

- A pre-frozen DB fixture at migration `010` (committed as `internal/test/fixtures/db_at_010.sqlite`).
- A test that runs all newer migrations up, then all the way down, then up again — ensures both directions work on real data.

### 3.5 Production migration steps

1. Take a backup (`sqlite3 data/app.db ".backup data/app-pre-NNN.db"`).
2. Deploy new binary (which runs migrations on boot).
3. Smoke-test `/healthz` and one read endpoint per role.
4. Keep the previous binary one click away for rollback (the matching `.down.sql` handles schema rewind; data loss is bounded to the new tables).

## 4. Test data factories

```
internal/store/testdata/
├── factory.go      // generic Make*()/Build*() helpers
├── fixtures/       // YAML/JSON snapshots for seedFixtures()
└── seed.go         // seedFixtures(db, "name") loader
```

Example:

```go
func MakeUser(t *testing.T, db *sql.DB, mods ...func(*model.User)) model.User {
    u := model.User{
        ID: ulid.Make().String(),
        Email: fmt.Sprintf("u-%s@example.test", randomSuffix(t)),
        Name: "Test User",
        Role: "admin",
        Password: bcryptHash("password"),
    }
    for _, m := range mods { m(&u) }
    insertUser(t, db, u)
    return u
}
```

Modifiers chain: `MakeUser(t, db, WithRole("guru"), InScope(scopeID))`.

Reuse across store and handler tests.

## 5. Smoke harness

A single `cmd/server/smoke_test.go` boots the server on a random port, runs a sequence of HTTP calls, and asserts envelopes:

```go
func TestSmokeFullStack(t *testing.T) {
    server := startServer(t)
    defer server.Close()

    // 1. Login as seeded admin.
    cookie := login(t, server, "admin@example.test", "password")

    // 2. CRUD a kelas.
    kelasID := createKelas(t, server, cookie, ...)
    listKelas(t, server, cookie, expectsContains(kelasID))

    // 3. Create a sesi, start it, record attendance, end it.
    sesiID := createSesi(t, server, cookie, kelasID, ...)
    startSesi(t, server, cookie, sesiID)
    markAttendance(t, server, cookie, sesiID, muridID, "hadir")
    endSesi(t, server, cookie, sesiID)

    // 4. Fetch the raport.
    raport := getRaport(t, server, cookie, muridID, 2026, 1)
    assertGTE(t, raport.Summary.AverageMark, 0)
}
```

Run by `go test -tags=smoke ./cmd/server/...` so it does not block the fast test suite.

## 6. Frontend tests

The current SPA has none. Minimum:

- Type-check via `pnpm --dir web/app typecheck` in CI.
- Add Vitest with one component test per major form (StudentForm, TeacherForm, AttendanceForm) covering happy path + Zod validation.
- Add a Playwright smoke test that visits `/`, logs in, navigates to `/dashboard`, asserts stats render. Lives in `web/app/e2e/`.

These can be added incrementally — they are not blocking for the doc set.

## 7. CI pipeline outline

A GitHub Actions or equivalent pipeline:

1. **Lint Go**: `go vet ./...`, `staticcheck ./...`.
2. **Test Go**: `go test ./... -race -count=1`.
3. **Type-check frontend**: `pnpm --dir web/app typecheck`.
4. **Build frontend**: `pnpm --dir web/app build`.
5. **Build binary**: `go build ./cmd/server`.
6. **Docker build**: tag `:pr-<sha>`.
7. **Smoke**: `go test -tags=smoke ./cmd/server/...`.

Quick (1-3) on every commit; full pipeline on PR.

## 8. PostgreSQL migration (optional track)

If/when SQLite stops scaling (single-writer becomes a bottleneck, hot-restore is too slow, or replication is needed):

1. **Schema dialect**: SQLite migrations rely on `TEXT` for everything and `INTEGER` for booleans. Postgres equivalents:
   - `TEXT` → `text`.
   - `INTEGER NOT NULL CHECK (x IN (0,1))` → `boolean NOT NULL`.
   - `strftime('%Y-...','now')` defaults → `now()` with `timestamptz` columns.
   - JSON `TEXT` columns → `jsonb`.
2. **ID generation**: ULIDs continue to be generated in Go; columns become `text` (Postgres has no native ULID type).
3. **Foreign keys**: same semantics; Postgres enforces them by default.
4. **Migrations**: `golang-migrate/migrate` supports both engines. Keep one migration set per engine if the dialects diverge enough (`migrations/sqlite/`, `migrations/postgres/`), or write a thin SQL preamble that uses `?` placeholders for both.
5. **Tests**: spin up Postgres in CI via `testcontainers-go`. Store tests parameterised on driver.
6. **Cutover**: dual-write for a release; backfill Postgres from a `sqlite3 .dump` piped through `pgloader`; switch over by env flag.

This is optional and not required for any feature in [11](./11-scope-hierarchy.md)–[51](./51-frontend-evolution.md).

## 9. Observability for tests

Tests log via `slog` to the test recorder (`t.Log`). On failure, the recorder dumps the last 200 lines so debugging a race-y test does not require re-running with verbose flags.

## 10. Open questions

- **Mutation testing**: `gremlins` would surface untested branches; out of scope for v1.
- **Property tests**: `gopter` for scope-tree invariants; defer.
- **Visual regression**: out of scope; manual screenshots in PRs are enough.
