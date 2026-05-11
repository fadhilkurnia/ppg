# Database schema

Authoritative reference for the SQLite schema served by the app. Migrations
live in [`internal/store/migrations/`](../internal/store/migrations/) — they
are the source of truth and run on every server start via `store.Migrate`
(see `internal/store/store.go`). This document mirrors the live schema after
the most recent migration (`009_create_attendances`).

## Tables at a glance

| Table | Purpose | Rows now (approx.) |
|---|---|---|
| [`users`](#users) | Login accounts (admin/staff). Seeded with one admin on first boot if `users` is empty. | 1+ |
| [`students`](#students) | Generus — the youths in the program. | 32 |
| [`teachers`](#teachers) | Pengajar — the mentors who run private sessions. | 29 |
| [`attendances`](#attendances) | One row per teaching session (teacher × student × date). | 5,800+ |
| `schema_migrations` | Internal bookkeeping for `golang-migrate`. Never edited by hand. | 9 |

## Entity relationship

```
users                      (standalone — login only)
                                                       ┌──────────────┐
students  ───┐                                          │              │
              │ ON DELETE RESTRICT       ┌──────────────┘              │
              ▼                           │                            ▼
       ┌─────────────┐         ┌──────────┴────────┐         ┌──────────────┐
       │ attendances │────────▶│   teachers        │         │    sessions  │
       │  (1 row /   │         │                   │         │  (logically a│
       │   session)  │         │                   │         │  view, not a │
       └─────────────┘         └───────────────────┘         │  separate    │
              ▲                                              │  table — UI  │
              │ ON DELETE RESTRICT                            │  calls the   │
              └────────────────────────────────────────────  │  same        │
                                                              │  attendances │
                                                              │  rows)       │
                                                              └──────────────┘
```

- `attendances.teacher_id` → `teachers.id` (strict, NOT NULL, `ON DELETE RESTRICT`)
- `attendances.student_id` → `students.id` (strict, NOT NULL, `ON DELETE RESTRICT`)
- `users` is intentionally not linked to `students` or `teachers` — login accounts and program participants are separate.

Why `RESTRICT`? Deleting a `students` or `teachers` row would silently orphan years of session history. Use the soft-delete pattern instead: set `students.status='left'` or `teachers.status='retired'`.

## Conventions

| Convention | Detail |
|---|---|
| Primary keys | `id TEXT PRIMARY KEY`, app-generated ULIDs (lexicographically time-ordered). Never use the row's natural keys (email, school ID, etc.) as `id`. |
| Timestamps | Every table has `created_at` and `updated_at` (`DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`). The app writes `time.Now().UTC()` explicitly on insert/update so values match across processes regardless of SQLite's `CURRENT_TIMESTAMP`. |
| Nullable fields | `*string` / `*time.Time` in Go ↔ nullable TEXT/DATE in SQL ↔ `?` in TypeScript / `omitempty` in JSON. |
| Enum-shaped columns | Stored as `TEXT` with a `CHECK (col IN (…))` constraint. Display labels are localized in the UI; stored values are English/canonical (`active`/`left`/`male`/`hadir`/…). |
| Soft delete | No row is ever physically removed by app code in normal operations. Set `status` to `left` (students) / `retired` (teachers). The `attendances` `ON DELETE RESTRICT` enforces this. |
| Indexes | One per common filter / list-sort. List endpoints with `WHERE x = ?` always have an index on `x`. Composite indexes (`student_id, date`) cover the typical "what did Khayri do in May?" query. |

---

## `users`

Login accounts. The first admin is seeded from `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` env vars on first boot when
the table is empty (see `store.SeedAdmin`).

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  username    TEXT,                                      -- nullable, partially-unique
  password    TEXT NOT NULL,                             -- bcrypt hash
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('admin','staff')),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_username
  ON users(username) WHERE username IS NOT NULL;
```

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT, PK | ULID |
| `email` | TEXT, NOT NULL, UNIQUE | Lowercased at login (`handler/auth.go`) |
| `username` | TEXT, nullable | Used as an alternative login identifier; uniqueness enforced via a partial index so multiple NULLs are allowed |
| `password` | TEXT, NOT NULL | bcrypt hash (`bcrypt.DefaultCost`) — never the plaintext |
| `name` | TEXT, NOT NULL | Display name |
| `role` | TEXT, NOT NULL, CHECK | `admin` or `staff`. Only `admin` may POST/PATCH/DELETE; both can read |
| `created_at` / `updated_at` | DATETIME | Auditing |

**Login**: `POST /api/auth/login { identifier, password }` — `identifier` is matched against both `email` and `username` via `users.FindByIdentifier`.

---

## `students`

The Generus roster. Schema evolved through six migrations as the program's
actual requirements became clearer (school-style fields dropped, PPG-specific
fields added).

```sql
CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  nickname      TEXT,
  date_of_birth DATE,
  gender        TEXT NOT NULL CHECK (gender IN ('male','female')),
  level         TEXT CHECK (level IS NULL OR level IN
                  ('Caberawit','Pra Remaja','Remaja','Pra Nikah')),
  kelompok      TEXT NOT NULL CHECK (kelompok IN
                  ('California','Chicago','New Hampshire','Canada')),
  city          TEXT,                                    -- finer-grained than kelompok
  joined_at     DATE,
  left_at       DATE,
  leave_reason  TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','left')),
  parent_name   TEXT,
  parent_phone  TEXT,
  parent_email  TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_name     ON students(name);
CREATE INDEX idx_students_level    ON students(level);
CREATE INDEX idx_students_kelompok ON students(kelompok);
CREATE INDEX idx_students_status   ON students(status);
CREATE INDEX idx_students_gender   ON students(gender);
CREATE INDEX idx_students_city     ON students(city);
```

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT, PK | ULID |
| `name` | TEXT, NOT NULL | Full name |
| `nickname` | TEXT, nullable | Single token or slash-separated (e.g., `Yasril / Dyka`); used to resolve attendance imports |
| `date_of_birth` | DATE, nullable | Ages displayed in the UI are derived client-side via `lib/age.ts` |
| `gender` | TEXT, NOT NULL, CHECK | `male` / `female`. Seeded from name heuristics on existing rows; UI labels are `Laki-laki` / `Perempuan` |
| `level` | TEXT, nullable, CHECK | The four canonical jenjang: `Caberawit`, `Pra Remaja`, `Remaja`, `Pra Nikah` |
| `kelompok` | TEXT, NOT NULL, CHECK | Four regional buckets: `California`, `Chicago`, `New Hampshire`, `Canada`. Required since migration 007 |
| `city` | TEXT, nullable | Specific city (Chicago, Raleigh, Philadelphia, Toronto, Buffalo, Indianapolis, …). Decodes the region codes used in attendance source CSVs |
| `joined_at` / `left_at` | DATE, nullable | ISO dates |
| `leave_reason` | TEXT, nullable | Free text; common values include `Pulang Ke Indo` |
| `status` | TEXT, NOT NULL, CHECK | `active` (default) or `left`. Dashboard "aktif" counts filter on this |
| `parent_name` / `parent_phone` / `parent_email` | TEXT, all nullable | Optional family contact info |

### Migration history for `students`

| # | What changed | Why |
|---|---|---|
| 001 | Initial schema (school-style: `student_id` UNIQUE, `gender` NOT NULL, `parent_name`/`parent_phone` NOT NULL) | First MVP, pre-data |
| 004 | Full redesign: dropped `student_id`/`gender`/`address`; added `nickname`/`level`/`kelompok`/`joined_at`/`left_at`/`leave_reason`/`status`; relaxed parent fields to nullable | Matched the real PPG roster shape |
| 005 | Normalize existing kelompok variants (`Nh/raleigh`, `Chicago Houston`, …) to the four canonical values, then add CHECK | Data cleanliness + future-proofing |
| 006 | Re-add `gender` as NOT NULL; seed best-guess values from names | Required field, value derivable from name |
| 007 | Promote `kelompok` from nullable to NOT NULL | All known students have a kelompok now |
| 008 | Add nullable `city` | Finer geographic resolution than kelompok |

---

## `teachers`

The Pengajar roster. Simpler than students — no kelompok enum, no level,
no gender (carryover from a different program model). The geographic
hierarchy is `kelompok` → `desa` → `daerah` (cell → village → region),
all free-text.

```sql
CREATE TABLE teachers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  nickname    TEXT,
  kelompok    TEXT NOT NULL,                             -- group/cell, free text
  desa        TEXT NOT NULL,                             -- village
  daerah      TEXT NOT NULL,                             -- region
  joined_at   DATE,
  retired_at  DATE,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','retired')),
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_teachers_name     ON teachers(name);
CREATE INDEX idx_teachers_status   ON teachers(status);
CREATE INDEX idx_teachers_daerah   ON teachers(daerah);
CREATE INDEX idx_teachers_desa     ON teachers(desa);
CREATE INDEX idx_teachers_kelompok ON teachers(kelompok);
```

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT, PK | ULID |
| `name` | TEXT, NOT NULL | Full name |
| `nickname` | TEXT, nullable | Can hold multiple aliases separated by `/` (e.g., `Yasril / Dyka`). Attendance import splits on `/` when resolving |
| `kelompok` / `desa` / `daerah` | TEXT, all NOT NULL | Free-text Indonesian region names — no enum constraint because the corpus is messy and evolving |
| `joined_at` / `retired_at` | DATE, nullable | ISO dates |
| `status` | TEXT, NOT NULL, CHECK | `active` (default) or `retired`. Retired teachers stay in the table for historical attendance |
| `notes` | TEXT, nullable | Free-form remarks |

### `teachers` vs `students` field differences

| Field | students | teachers |
|---|---|---|
| `kelompok` | Closed enum (4 values), NOT NULL | Free text, NOT NULL |
| Status enum values | `active` / `left` | `active` / `retired` |
| Gender | Tracked (NOT NULL) | Not tracked |
| Level | Tracked (jenjang) | Not tracked |
| Geographic depth | `kelompok` (+ optional `city`) | `kelompok` / `desa` / `daerah` (3-level) |
| Departure metadata | `left_at`, `leave_reason` | `retired_at` only |

---

## `attendances`

One row per teaching session. The most fact-heavy table — over 5,800
historical sessions imported from 3 CSV years.

```sql
CREATE TABLE attendances (
  id           TEXT PRIMARY KEY,
  date         DATE NOT NULL,
  duration_min INTEGER,                                  -- e.g., 45; NULL when unknown
  teacher_id   TEXT NOT NULL
                 REFERENCES teachers(id) ON DELETE RESTRICT,
  student_id   TEXT NOT NULL
                 REFERENCES students(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL
                 CHECK (status IN ('hadir','izin_murid','izin_guru','by_vn')),
  materi       TEXT,                                     -- multi-paragraph lesson notes
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attendances_date         ON attendances(date);
CREATE INDEX idx_attendances_student_date ON attendances(student_id, date);
CREATE INDEX idx_attendances_teacher_date ON attendances(teacher_id, date);
CREATE INDEX idx_attendances_status       ON attendances(status);
```

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT, PK | ULID |
| `date` | DATE, NOT NULL | Session date |
| `duration_min` | INTEGER, nullable | Source CSV uses `H:MM`; the app stores it as a flat integer of minutes. `0` is a legitimate value (canceled sessions, voice notes); `NULL` means truly unknown |
| `teacher_id` | TEXT, NOT NULL, FK | Strict — every row resolves to a `teachers` row |
| `student_id` | TEXT, NOT NULL, FK | Strict — every row resolves to a `students` row |
| `status` | TEXT, NOT NULL, CHECK | Four values (see enum below); `hadir` is ~92% of rows |
| `materi` | TEXT, nullable | Free-form lesson notes; can be multi-paragraph with newlines and emojis. UI renders with `whitespace-pre-wrap` |

**No composite uniqueness.** A teacher can legitimately have multiple sessions
with the same student on the same date (e.g., morning + afternoon), so
`(teacher_id, student_id, date)` is *not* unique. If duplicate-prevention
becomes important, that's a follow-up migration.

**FK strictness was earned.** All 19 teacher labels and 29 student labels in
the 3-year CSV corpus map to DB rows; the importer skips ~1 row total that
doesn't resolve.

---

## Enums catalog

All app-managed enums in one place. Values stored exactly as shown; UI labels
are localized separately.

| Table | Column | Values | Notes |
|---|---|---|---|
| `users` | `role` | `admin`, `staff` | Default `staff` |
| `students` | `gender` | `male`, `female` | Required |
| `students` | `level` | `Caberawit`, `Pra Remaja`, `Remaja`, `Pra Nikah` | Nullable (also implicit "tidak diisi") |
| `students` | `kelompok` | `California`, `Chicago`, `New Hampshire`, `Canada` | Required |
| `students` | `status` | `active`, `left` | Default `active` |
| `teachers` | `status` | `active`, `retired` | Default `active` |
| `attendances` | `status` | `hadir`, `izin_murid`, `izin_guru`, `by_vn` | UI labels: `Hadir` / `Izin (Murid)` / `Izin (Guru)` / `Via Voice Note` |

Free-text fields that *look* enum-shaped but aren't (yet):
- `teachers.kelompok`, `teachers.desa`, `teachers.daerah` — free text because the
  Indonesian region corpus is open-ended.
- `students.city` — free text; common values in current data are Chicago, Raleigh,
  Philadelphia, Toronto, Buffalo, Indianapolis, Washington DC, Portsmouth, Atlanta,
  Los Angeles.

## Migration timeline

In `internal/store/migrations/`, applied in numeric order on every server boot.

| # | Migration | Effect |
|---|---|---|
| 001 | `init` | Create `users` and original `students` |
| 002 | `add_username` | Add `users.username` + partial unique index |
| 003 | `create_teachers` | Create `teachers` |
| 004 | `redesign_students` | Full students rebuild for PPG model |
| 005 | `kelompok_enum` | Normalize variants, add CHECK constraint |
| 006 | `add_gender` | Re-add `students.gender` NOT NULL |
| 007 | `kelompok_required` | `students.kelompok` NOT NULL |
| 008 | `add_city_to_students` | Add nullable `students.city` |
| 009 | `create_attendances` | Create `attendances` |

Each migration has a paired `*.down.sql` for `migrate down`. Down migrations
are best-effort — some destructive rebuilds (notably 004) cannot perfectly
restore the prior schema if rows already use new columns.

## Adding a new migration

1. Pick the next number in `internal/store/migrations/` (e.g., `010_*`).
2. Create both `010_my_change.up.sql` and `010_my_change.down.sql`.
3. SQLite quirks to watch for:
   - Adding a `CHECK` constraint to an existing column requires a table
     rebuild (see migrations 005, 007 as templates).
   - `ALTER TABLE … DROP COLUMN` works in SQLite ≥ 3.35 (Alpine 3.20 ships
     it), but rebuilds are safer when you need to also drop indexes that
     reference the column.
   - The `golang-migrate` library wraps each `.sql` file in a transaction —
     don't include `BEGIN`/`COMMIT` yourself.
4. Update this document. Add a row to the migration timeline and revise the
   affected table sections.
5. The server applies migrations on startup; restart locally to verify.
