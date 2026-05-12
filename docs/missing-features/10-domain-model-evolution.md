---
topic: domain model evolution
depends-on: [02-comparison-matrix.md]
enables: [11-scope-hierarchy.md, 12-user-and-roles.md, 20-kelas-system.md, 21-materi-system.md, 22-sesi-system.md]
key-concepts: [additive-migration, ULID, sqlite-fk, soft-delete, denormalisation]
---

# 10 — Domain Model Evolution

## TL;DR

Extend the existing SQLite schema with **eleven** new tables and **one** new column on `users`, all delivered as **additive migrations** numbered `011` and onwards. Keep all existing tables (`users`, `students`, `teachers`, `attendances`) intact. New tables follow the existing conventions: ULID primary keys, `created_at` / `updated_at` UTC timestamps, soft-delete via `status` columns, `FOREIGN KEY ... ON DELETE RESTRICT`, and a paired `.up.sql` / `.down.sql` per migration.

Checklist:

- [ ] Confirm all current migrations apply cleanly on a fresh DB.
- [ ] Add `scopes` table for the daerah/desa/kelompok hierarchy.
- [ ] Add `user_scopes` table for many-to-many user ↔ scope assignment.
- [ ] Add `roles` table (replaces hard-coded admin/staff enum) and `user_roles` association.
- [ ] Add `kelas`, `kelas_templates`, `kelas_template_materi`, `kelas_enrollments`.
- [ ] Add `materi`, `materi_assignments`.
- [ ] Add `sesi`, `sesi_attendances`, `sesi_chat_messages`, `sesi_notes`, `sesi_tugas`.
- [ ] Add `notifications`, `activity_log`, `media_bank`.
- [ ] Add `ortu_murid` for parent-child links.

---

## 1. Principles

### 1.1 Additive

`students`, `teachers`, `attendances`, and `users` (except for adding nullable columns) **do not change**. The reasons:

- The existing React SPA in `web/app/` consumes these tables and would break.
- Existing data (5,800+ attendance records) must remain queryable without backfill.
- The Go store helpers, tests, and migrations history are stable.

If a concept needs cross-cutting structure (e.g. scope), prefer a new association table to a new column on an existing table.

### 1.2 ULID everywhere

Every new primary key is a ULID generated server-side (`oklog/ulid/v2`). Reasons:

- Sortable by creation time → range queries and offset-pagination work without an extra index.
- Globally unique → safe for offline import and merge.
- 26-character string → fits SQLite `TEXT` happily; readable in logs.

```go
import "github.com/oklog/ulid/v2"
id := ulid.Make().String() // e.g. "01HZQK6XJ7..."
```

### 1.3 Timestamps

All new tables include:

```sql
created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
```

Update statements set `updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`. The Go layer parses with `time.RFC3339Nano`.

### 1.4 Soft delete

Each new entity that represents an organisational artifact (`kelas`, `materi`, `sesi`, ...) gets a `status TEXT NOT NULL DEFAULT 'active'` column with allowed values `'active' | 'archived'`. Delete endpoints flip status; the row stays. This mirrors the `students.status` and `teachers.status` pattern.

### 1.5 Foreign keys

SQLite enforces foreign keys when `PRAGMA foreign_keys = ON`, which the existing `store.Open()` already sets. New tables use `REFERENCES ... ON DELETE RESTRICT` to surface dangling references early. Use `ON DELETE CASCADE` only for tables that *own* their parents (e.g. `sesi_chat_messages.sesi_id`).

### 1.6 Indexes

Every foreign-key column gets a covering index. Every common filter column (`status`, `kelas_id`, `created_at`) gets an index. Compound indexes (`status, created_at`) are added when list-with-status queries are obvious.

### 1.7 Migration numbering

The current latest migration is `010_level_required`. New migrations begin at `011`. Recommended order (also a dependency order):

| # | Name | Adds |
|---|---|---|
| 011 | `add_scopes` | `scopes`, `user_scopes` |
| 012 | `add_roles` | `roles`, `user_roles` |
| 013 | `add_kelas` | `kelas`, `kelas_enrollments` |
| 014 | `add_kelas_templates` | `kelas_templates`, `kelas_template_materi` |
| 015 | `add_materi` | `materi`, `materi_assignments` |
| 016 | `add_sesi` | `sesi`, `sesi_attendances` |
| 017 | `add_sesi_chat_notes_tugas` | `sesi_chat_messages`, `sesi_notes`, `sesi_tugas` |
| 018 | `add_notifications` | `notifications` |
| 019 | `add_activity_log` | `activity_log` |
| 020 | `add_media_bank` | `media_bank` |
| 021 | `add_ortu_murid` | `ortu_murid` |

Each migration must be reversible. The `*.down.sql` drops the new tables and any new indexes — never touches existing data.

---

## 2. Conceptual ER diagram

```
                ┌──────────┐
                │  scopes  │
                └────┬─────┘
                     │ parent_id (self-ref)
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼────┐               ┌────▼────────┐
   │ users   │◄──────────────│ user_scopes │
   └─┬───┬───┘               └─────────────┘
     │   │
     │   └─────────► user_roles ◄────── roles
     │
     ├──────────────► kelas ──── kelas_enrollments ──┐
     │                  │                            │
     │                  │ template_id                │
     │                  ▼                            │
     │             kelas_templates ── kelas_template_materi ── materi
     │
     ├──────────────► materi_assignments ─────────► materi
     │
     ├──────────────► sesi ────► sesi_attendances ──┐
     │                  │                           │
     │                  ├──► sesi_chat_messages     │
     │                  ├──► sesi_notes             │
     │                  └──► sesi_tugas             ▼
     │                                          users (murid)
     ├──────────────► notifications
     ├──────────────► activity_log
     ├──────────────► media_bank
     └──────────────► ortu_murid ──► students (legacy)
                                  ──► users    (new murid accounts)
```

Note: students and teachers tables stay, but new features can also reference `users` directly when the actor is a logged-in account (e.g. a murid is a `users` row with role `murid`, optionally linked to a `students` row via `students.user_id` in a later migration).

---

## 3. Table-by-table outline

Each table below has a complete DDL in its dedicated guide. This section is the **shape summary** so a reviewer can spot omissions early.

### 3.1 `scopes`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| parent_id | TEXT FK → scopes(id) NULL | self-reference; NULL for daerah |
| kind | TEXT NOT NULL | `'daerah'` \| `'desa'` \| `'kelompok'` |
| name | TEXT NOT NULL | display name |
| code | TEXT | optional short code |
| status | TEXT NOT NULL DEFAULT `'active'` | |
| created_at, updated_at | TEXT | |

Indexes: `(parent_id)`, `(kind, name)`, `(status)`.

### 3.2 `user_scopes`

| col | type | notes |
|---|---|---|
| user_id | TEXT FK → users(id) | |
| scope_id | TEXT FK → scopes(id) | |
| is_primary | INTEGER NOT NULL DEFAULT 0 | 1 → main scope (default for filters) |
| created_at | TEXT | |
| PK | (user_id, scope_id) | composite |

### 3.3 `roles`

| col | type | notes |
|---|---|---|
| id | TEXT PK | e.g. `'admin'`, `'guru'`, `'murid'` |
| label | TEXT NOT NULL | UI label |
| can_login | INTEGER NOT NULL DEFAULT 1 | |
| manageable_role_ids | TEXT | JSON array of role ids this role can manage |
| created_at, updated_at | TEXT | |

Seeded rows: `admin`, `pengurus`, `guru`, `ortu`, `murid`, plus a legacy `staff` row mapped to `pengurus` semantics.

### 3.4 `user_roles`

| col | type | notes |
|---|---|---|
| user_id | TEXT FK → users(id) | |
| role_id | TEXT FK → roles(id) | |
| scope_id | TEXT FK → scopes(id) NULL | grants this role only within a scope; NULL → global |
| created_at | TEXT | |
| PK | (user_id, role_id, scope_id) | composite |

### 3.5 `kelas`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| name | TEXT NOT NULL | |
| scope_id | TEXT FK → scopes(id) NOT NULL | the kelompok this class belongs to |
| guru_user_id | TEXT FK → users(id) NULL | primary guru |
| template_id | TEXT FK → kelas_templates(id) NULL | if created from template |
| tahun_ajaran | TEXT | e.g. `'2026/2027'` |
| status | TEXT NOT NULL DEFAULT `'active'` | |
| created_at, updated_at | TEXT | |

### 3.6 `kelas_enrollments`

| col | type | notes |
|---|---|---|
| kelas_id | TEXT FK → kelas(id) | |
| user_id | TEXT FK → users(id) | the murid |
| enrolled_at | TEXT NOT NULL | |
| left_at | TEXT NULL | |
| status | TEXT NOT NULL DEFAULT `'active'` | `'active'` \| `'left'` |
| PK | (kelas_id, user_id) | composite |

### 3.7 `kelas_templates`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| name | TEXT NOT NULL | |
| scope_ids | TEXT | JSON array of scope ids this template applies to |
| mutable_fields | TEXT | JSON list of fields the user can override at clone time |
| status | TEXT NOT NULL DEFAULT `'active'` | |
| created_at, updated_at | TEXT | |

### 3.8 `kelas_template_materi`

| col | type | notes |
|---|---|---|
| template_id | TEXT FK → kelas_templates(id) | |
| materi_id | TEXT FK → materi(id) | |
| ordering | INTEGER NOT NULL DEFAULT 0 | |
| PK | (template_id, materi_id) | |

### 3.9 `materi`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| name | TEXT NOT NULL | |
| kategori | TEXT NOT NULL DEFAULT `'baru'` | `'baru'` \| `'lanjutan'` \| `'mengulang'` |
| basis_penilaian | TEXT NOT NULL DEFAULT `'completion'` | `'skill'` \| `'completion'` |
| nilai_tuntas | INTEGER | passing grade; null when basis is `completion` |
| description | TEXT | |
| status | TEXT NOT NULL DEFAULT `'active'` | |
| created_at, updated_at | TEXT | |

### 3.10 `materi_assignments`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| materi_id | TEXT FK → materi(id) | |
| kelas_id | TEXT FK → kelas(id) NULL | NULL → individual assignment |
| user_id | TEXT FK → users(id) | the murid |
| assigned_by_user_id | TEXT FK → users(id) | guru |
| mark | INTEGER NULL | grade (when graded) |
| graded_by_user_id | TEXT FK → users(id) NULL | |
| graded_at | TEXT NULL | |
| achievement_status | TEXT NOT NULL DEFAULT `'belum'` | `'belum'` \| `'proses'` \| `'tuntas'` |
| created_at, updated_at | TEXT | |

### 3.11 `sesi`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| kelas_id | TEXT FK → kelas(id) | |
| materi_id | TEXT FK → materi(id) NULL | primary topic |
| tanggal | TEXT NOT NULL | date only `'YYYY-MM-DD'` |
| jam_mulai | TEXT NOT NULL | `'HH:MM'` |
| jam_selesai | TEXT | `'HH:MM'` |
| status | TEXT NOT NULL DEFAULT `'upcoming'` | `'upcoming'` \| `'active'` \| `'ended'` |
| started_at | TEXT NULL | actual start timestamp |
| ended_at | TEXT NULL | actual end timestamp |
| qr_token | TEXT NULL | ephemeral attendance proof |
| qr_token_expires_at | TEXT NULL | |
| created_at, updated_at | TEXT | |

### 3.12 `sesi_attendances`

| col | type | notes |
|---|---|---|
| sesi_id | TEXT FK → sesi(id) | |
| user_id | TEXT FK → users(id) | murid |
| recorded_at | TEXT NOT NULL | |
| recorded_by_user_id | TEXT FK → users(id) NULL | NULL → self via QR |
| status | TEXT NOT NULL | `'hadir'` \| `'izin'` \| `'sakit'` \| `'alfa'` |
| via_qr | INTEGER NOT NULL DEFAULT 0 | 1 → submitted via QR scan |
| PK | (sesi_id, user_id) | |

### 3.13 `sesi_chat_messages`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| sesi_id | TEXT FK → sesi(id) | |
| user_id | TEXT FK → users(id) | author |
| body | TEXT NOT NULL | |
| created_at | TEXT NOT NULL | |

### 3.14 `sesi_notes`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| sesi_id | TEXT FK → sesi(id) | |
| author_user_id | TEXT FK → users(id) | guru |
| body | TEXT NOT NULL | markdown |
| created_at, updated_at | TEXT | |

### 3.15 `sesi_tugas`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| sesi_id | TEXT FK → sesi(id) | |
| assigned_user_id | TEXT FK → users(id) | murid |
| created_by_user_id | TEXT FK → users(id) | guru |
| body | TEXT NOT NULL | |
| due_at | TEXT NULL | |
| status | TEXT NOT NULL DEFAULT `'open'` | `'open'` \| `'submitted'` \| `'reviewed'` |
| submitted_at | TEXT NULL | |
| reviewed_at | TEXT NULL | |
| feedback | TEXT NULL | |
| created_at, updated_at | TEXT | |

### 3.16 `notifications`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| user_id | TEXT FK → users(id) | recipient |
| kind | TEXT NOT NULL | dotted namespace e.g. `'sesi.started'` |
| subject | TEXT NOT NULL | display title |
| body | TEXT | display body |
| link | TEXT | in-app path |
| read_at | TEXT NULL | |
| created_at | TEXT NOT NULL | |

### 3.17 `activity_log`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| actor_user_id | TEXT FK → users(id) NULL | NULL → system |
| action | TEXT NOT NULL | e.g. `'kelas.create'`, `'materi.assign'` |
| resource_type | TEXT NOT NULL | e.g. `'kelas'`, `'sesi'` |
| resource_id | TEXT | |
| before | TEXT | JSON snapshot |
| after | TEXT | JSON snapshot |
| ip | TEXT | |
| user_agent | TEXT | |
| created_at | TEXT NOT NULL | |

### 3.18 `media_bank`

| col | type | notes |
|---|---|---|
| id | TEXT PK | ULID |
| owner_user_id | TEXT FK → users(id) | uploader |
| filename | TEXT NOT NULL | display name |
| mime | TEXT NOT NULL | |
| size_bytes | INTEGER NOT NULL | |
| sha256 | TEXT NOT NULL | content hash; storage key |
| status | TEXT NOT NULL DEFAULT `'active'` | |
| created_at, updated_at | TEXT | |

Files live on disk at `data/media/<sha256[0:2]>/<sha256>` (content-addressed, deduplicated).

### 3.19 `ortu_murid`

| col | type | notes |
|---|---|---|
| ortu_user_id | TEXT FK → users(id) | |
| murid_user_id | TEXT FK → users(id) | |
| relation | TEXT NOT NULL DEFAULT `'parent'` | `'parent'` \| `'guardian'` |
| created_at | TEXT | |
| PK | (ortu_user_id, murid_user_id) | |

---

## 4. Go layer overview

Each new table gets a matching struct in `internal/model/`, a store package in `internal/store/` (one file per table), handlers in `internal/handler/`, and routes wired in `cmd/server/main.go`. The pattern is the **same** as the existing `students` / `teachers` / `attendances` code.

**Suggested directory layout after all migrations:**

```
internal/
├── auth/                  (existing)
├── config/                (existing)
├── handler/
│   ├── auth.go            (existing — extended for refresh)
│   ├── students.go        (existing)
│   ├── teachers.go        (existing)
│   ├── attendances.go     (existing)
│   ├── stats.go           (existing)
│   ├── users.go           (NEW)
│   ├── roles.go           (NEW)
│   ├── scopes.go          (NEW)
│   ├── kelas.go           (NEW)
│   ├── kelas_templates.go (NEW)
│   ├── materi.go          (NEW)
│   ├── sesi.go            (NEW)
│   ├── sesi_chat.go       (NEW)
│   ├── notifications.go   (NEW)
│   ├── activity.go        (NEW)
│   ├── media.go           (NEW)
│   └── bulk.go            (NEW — generic bulk-import handler)
├── httpx/                 (existing)
├── importer/              (existing — kept for the CLI path)
├── model/
│   ├── model.go           (existing — append new types here, or split)
│   ├── kelas.go           (NEW)
│   ├── materi.go          (NEW)
│   ├── sesi.go            (NEW)
│   ├── notification.go    (NEW)
│   ├── activity.go        (NEW)
│   └── ...
├── store/
│   ├── store.go           (existing)
│   ├── users.go           (existing — minor additions)
│   ├── students.go        (existing)
│   ├── teachers.go        (existing)
│   ├── attendances.go     (existing)
│   ├── scopes.go          (NEW)
│   ├── roles.go           (NEW)
│   ├── kelas.go           (NEW)
│   ├── kelas_templates.go (NEW)
│   ├── materi.go          (NEW)
│   ├── sesi.go            (NEW)
│   ├── sesi_chat.go       (NEW)
│   ├── notifications.go   (NEW)
│   ├── activity.go        (NEW)
│   ├── media.go           (NEW)
│   ├── ortu.go            (NEW)
│   └── migrations/
│       ├── 011_add_scopes.{up,down}.sql
│       ├── 012_add_roles.{up,down}.sql
│       ├── ...
│       └── 021_add_ortu_murid.{up,down}.sql
├── realtime/              (NEW — package for the WebSocket hub; see doc 30)
├── scheduler/             (NEW — package for cron-like jobs; see doc 22)
└── audit/                 (NEW — package that records activity_log entries; see doc 34)
```

This layout keeps directory growth flat (no nesting), matches the existing convention, and makes new package boundaries obvious.

---

## 5. Validator and JSON tags

All new request bodies use `validator/v10` tags (already a dependency). Common rules:

```go
type CreateKelasRequest struct {
    Name        string  `json:"name"         validate:"required,max=200"`
    ScopeID     string  `json:"scopeId"      validate:"required,ulid"`
    GuruUserID  *string `json:"guruUserId,omitempty" validate:"omitempty,ulid"`
    TemplateID  *string `json:"templateId,omitempty" validate:"omitempty,ulid"`
    TahunAjaran *string `json:"tahunAjaran,omitempty" validate:"omitempty,max=20"`
}
```

A custom `ulid` validator tag should be registered once at startup:

```go
v.RegisterValidation("ulid", func(fl validator.FieldLevel) bool {
    _, err := ulid.Parse(fl.Field().String())
    return err == nil
})
```

JSON tags use camelCase consistently (matching existing handler style). Internal SQL columns stay snake_case.

---

## 6. Backwards compatibility checklist

Before merging the schema migrations:

- [ ] All existing tests pass (`go test ./...`).
- [ ] Existing `students` / `teachers` / `attendances` endpoints return identical JSON for identical input (verified by an HTTP snapshot test — see [60-testing-and-migration.md](./60-testing-and-migration.md)).
- [ ] The embedded React SPA builds (`pnpm --dir web/app build`) and serves without console errors after migration.
- [ ] `make docker` produces an image that boots and migrates a pre-existing DB (manual smoke step: copy a `data/app.db` from production, mount, restart, verify reads).
- [ ] The `golang-migrate` chain runs forward and backward cleanly on a fresh DB AND on a DB at migration `010`.

---

## 7. What this file is not

- It is **not** the full DDL for every table — see each feature doc (20–42) for the exact `.up.sql` / `.down.sql`.
- It is **not** prescriptive about PostgreSQL. The DDL above is SQLite-compatible (`TEXT` everywhere, `INTEGER` for booleans, no enum types). [60-testing-and-migration.md](./60-testing-and-migration.md) explains how to port if/when that becomes necessary.
- It is **not** an ORM proposal. We stay on raw SQL with `database/sql`, matching existing code.
