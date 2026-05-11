---
topic: materi (learning material) catalog and assignments
depends-on: [10-domain-model-evolution.md, 12-user-and-roles.md, 20-kelas-system.md]
enables: [22-sesi-system.md, 40-curriculum-progress.md, 41-raport-system.md]
key-concepts: [material-catalog, basis-penilaian, achievement-status, assignment, grading]
---

# 21 — Materi (Material) System

## TL;DR

Introduce a `materi` catalog of learning materials and a `materi_assignments` join table that ties materials to students (and optionally to classes) with grading metadata. Distinguish **skill-based** (`basis_penilaian='skill'` with a `nilai_tuntas` passing grade) from **completion-based** (`basis_penilaian='completion'`, simple done/not-done) materials. Track per-assignment **achievement status** (`belum` / `proses` / `tuntas`) and an optional numeric **mark**.

Checklist:

- [ ] Migration `015_add_materi` creates `materi`, `materi_assignments`.
- [ ] Migration `016_add_materi_kelas_link` (optional) if you want to track which materi a kelas covers without going through individual assignments.
- [ ] Add `internal/store/materi.go`, `internal/handler/materi.go`.
- [ ] Wire `/api/materi/*` and `/api/materi-assignments/*` (or fold into `/api/materi/{id}/assignments`).
- [ ] Add bulk endpoints per [24](./24-bulk-operations.md).
- [ ] Add tests covering grading basis, achievement transitions, scope filtering.

---

## 1. Why this is needed

Today, ppgus has no concept of "what is being taught". Attendance records merely log presence at a session. The sibling projects all answer questions like:

- "How many materials has this murid completed this semester?"
- "Which murid in Caberawit California still haven't passed Doa Sehari-Hari?"
- "Show me the average grade for Materi 'Hafalan Asmaul Husna' across all kelompok."

These require a catalog of materials and assignments that record per-murid progress.

## 2. Data model

### 2.1 `materi`

```sql
CREATE TABLE materi (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    kategori        TEXT NOT NULL DEFAULT 'baru' CHECK (kategori IN ('baru','lanjutan','mengulang')),
    basis_penilaian TEXT NOT NULL DEFAULT 'completion' CHECK (basis_penilaian IN ('skill','completion')),
    nilai_tuntas    INTEGER, -- passing grade; required when basis='skill'; null when 'completion'
    description     TEXT,
    tags            TEXT NOT NULL DEFAULT '[]', -- JSON array of free-text tags
    scope_id        TEXT REFERENCES scopes(id) ON DELETE RESTRICT, -- NULL → global
    created_by      TEXT REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_materi_kategori ON materi(kategori);
CREATE INDEX idx_materi_basis    ON materi(basis_penilaian);
CREATE INDEX idx_materi_scope    ON materi(scope_id);
CREATE INDEX idx_materi_status   ON materi(status);
```

`scope_id NULL` = the material is available across the org. Setting a scope limits visibility.

### 2.2 `materi_assignments`

```sql
CREATE TABLE materi_assignments (
    id                  TEXT PRIMARY KEY,
    materi_id           TEXT NOT NULL REFERENCES materi(id)   ON DELETE RESTRICT,
    kelas_id            TEXT REFERENCES kelas(id)             ON DELETE SET NULL,
    user_id             TEXT NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
    assigned_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    due_at              TEXT,
    mark                INTEGER,
    graded_by_user_id   TEXT REFERENCES users(id),
    graded_at           TEXT,
    achievement_status  TEXT NOT NULL DEFAULT 'belum'
                        CHECK (achievement_status IN ('belum','proses','tuntas','exempt')),
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_assign_materi ON materi_assignments(materi_id);
CREATE INDEX idx_assign_user   ON materi_assignments(user_id);
CREATE INDEX idx_assign_kelas  ON materi_assignments(kelas_id);
CREATE INDEX idx_assign_status ON materi_assignments(achievement_status);
CREATE UNIQUE INDEX idx_assign_unique
    ON materi_assignments(materi_id, user_id, COALESCE(kelas_id, ''));
```

The unique index prevents duplicate assignments of the same material to the same user inside the same kelas (or globally if `kelas_id` is NULL).

`achievement_status` values:

| Value | Meaning |
|---|---|
| `belum` | Not yet started |
| `proses` | In progress |
| `tuntas` | Completed and passed |
| `exempt` | Waived |

`mark`:

- For `basis_penilaian='skill'`: integer 0-100 (or whatever scale the org chooses). `mark >= materi.nilai_tuntas` flips `achievement_status` to `tuntas` on save.
- For `basis_penilaian='completion'`: ignored. `achievement_status` is set directly by the guru.

### 2.3 Migration files

`015_add_materi.up.sql` — two CREATEs above + indexes.
`015_add_materi.down.sql` — drop both.

If templates were created in `014` without the FK to `materi`, add `016_link_kelas_template_materi.up.sql` now:

```sql
CREATE TABLE kelas_template_materi (
    template_id TEXT NOT NULL REFERENCES kelas_templates(id) ON DELETE CASCADE,
    materi_id   TEXT NOT NULL REFERENCES materi(id) ON DELETE RESTRICT,
    ordering    INTEGER NOT NULL DEFAULT 0,
    required    INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
    PRIMARY KEY (template_id, materi_id)
);
CREATE INDEX idx_ktm_materi ON kelas_template_materi(materi_id);
```

## 3. Go model

`internal/model/materi.go`:

```go
package model

import "time"

type Materi struct {
    ID             string    `json:"id"`
    Name           string    `json:"name"`
    Kategori       string    `json:"kategori"`
    BasisPenilaian string    `json:"basisPenilaian"`
    NilaiTuntas    *int      `json:"nilaiTuntas,omitempty"`
    Description    *string   `json:"description,omitempty"`
    Tags           []string  `json:"tags"`
    ScopeID        *string   `json:"scopeId,omitempty"`
    CreatedBy      *string   `json:"createdBy,omitempty"`
    Status         string    `json:"status"`
    CreatedAt      time.Time `json:"createdAt"`
    UpdatedAt      time.Time `json:"updatedAt"`
}

type MateriAssignment struct {
    ID                 string     `json:"id"`
    MateriID           string     `json:"materiId"`
    KelasID            *string    `json:"kelasId,omitempty"`
    UserID             string     `json:"userId"`
    AssignedByUserID   string     `json:"assignedByUserId"`
    AssignedAt         time.Time  `json:"assignedAt"`
    DueAt              *time.Time `json:"dueAt,omitempty"`
    Mark               *int       `json:"mark,omitempty"`
    GradedByUserID     *string    `json:"gradedByUserId,omitempty"`
    GradedAt           *time.Time `json:"gradedAt,omitempty"`
    AchievementStatus  string     `json:"achievementStatus"`
    Notes              *string    `json:"notes,omitempty"`
    CreatedAt          time.Time  `json:"createdAt"`
    UpdatedAt          time.Time  `json:"updatedAt"`

    MateriName *string `json:"materiName,omitempty"`
    UserName   *string `json:"userName,omitempty"`
    KelasName  *string `json:"kelasName,omitempty"`
}
```

## 4. Store layer

`internal/store/materi.go`:

```go
type Materi struct{ db *sql.DB }

type ListMateriFilter struct {
    Kategori       string
    BasisPenilaian string
    ScopeIDs       []string
    Tag            string
    Status         string
    Q              string
    Limit, Offset  int
}

func (m *Materi) Create(ctx context.Context, in CreateMateriInput) (model.Materi, error)
func (m *Materi) Get(ctx context.Context, id string) (model.Materi, error)
func (m *Materi) List(ctx context.Context, f ListMateriFilter) ([]model.Materi, int, error)
func (m *Materi) Update(ctx context.Context, id string, in UpdateMateriInput) error
func (m *Materi) Archive(ctx context.Context, id string) error
```

`internal/store/materi_assignments.go`:

```go
type MateriAssignments struct{ db *sql.DB }

type ListAssignmentsFilter struct {
    MateriID *string
    KelasID  *string
    UserID   *string
    Status   string
    Limit, Offset int
}

func (a *MateriAssignments) Create(ctx context.Context, in CreateAssignmentInput) (model.MateriAssignment, error)
func (a *MateriAssignments) Get(ctx context.Context, id string) (model.MateriAssignment, error)
func (a *MateriAssignments) List(ctx context.Context, f ListAssignmentsFilter) ([]model.MateriAssignment, int, error)
func (a *MateriAssignments) Grade(ctx context.Context, id string, mark *int, status string, graderID string, notes *string) error
func (a *MateriAssignments) Delete(ctx context.Context, id string) error

func (a *MateriAssignments) SummaryForUser(ctx context.Context, userID string, dateFrom, dateTo time.Time) (Summary, error)
func (a *MateriAssignments) SummaryForKelas(ctx context.Context, kelasID string) ([]KelasMateriSummary, error)
```

### 4.1 Grade rule

```go
func (a *MateriAssignments) Grade(ctx context.Context, id string, mark *int, status string, graderID string, notes *string) error {
    cur, err := a.Get(ctx, id)
    if err != nil { return err }
    materi, err := a.materi.Get(ctx, cur.MateriID)
    if err != nil { return err }

    if materi.BasisPenilaian == "skill" {
        if mark == nil { return ErrMarkRequired }
        if materi.NilaiTuntas != nil && *mark >= *materi.NilaiTuntas {
            status = "tuntas"
        } else if *mark > 0 {
            status = "proses"
        }
    } else { // completion
        mark = nil
    }
    // ... UPDATE ...
}
```

## 5. API contract

### 5.1 Materi

| Method | Path | Notes |
|---|---|---|
| GET | `/api/materi?kategori=&basisPenilaian=&scopeId=&tag=&status=&q=&limit=&offset=` | scoped list |
| GET | `/api/materi/{id}` | single |
| POST | `/api/materi` | `{ name, kategori, basisPenilaian, nilaiTuntas?, description?, tags?, scopeId? }` |
| PATCH | `/api/materi/{id}` | partial |
| DELETE | `/api/materi/{id}` | soft-delete |
| POST | `/api/materi/bulk` | CSV; see [24](./24-bulk-operations.md) |

### 5.2 Assignments

| Method | Path | Notes |
|---|---|---|
| GET | `/api/materi/{materiId}/assignments?kelasId=&status=&userId=` | list assignments of one materi |
| POST | `/api/materi/{materiId}/assignments` | `{ userIds: [...], kelasId?, dueAt? }` bulk assign |
| GET | `/api/users/{userId}/materi-assignments` | list a murid's assignments |
| GET | `/api/kelas/{kelasId}/materi-assignments` | list per kelas |
| GET | `/api/materi-assignments/{id}` | single |
| POST | `/api/materi-assignments/{id}/grade` | `{ mark?, status, notes? }` |
| DELETE | `/api/materi-assignments/{id}` | hard delete |

### 5.3 Bulk grading

```
POST /api/kelas/{kelasId}/materi-assignments/{materiId}/bulk-grade
{
  "grades": [
    { "userId": "...", "mark": 85, "status": "tuntas" },
    { "userId": "...", "mark": 40, "status": "proses" }
  ]
}
```

Returns per-row outcome.

## 6. Validation rules

`CreateMateriRequest`:

| Field | Rule |
|---|---|
| `name` | `required,max=200` |
| `kategori` | `required,oneof=baru lanjutan mengulang` |
| `basisPenilaian` | `required,oneof=skill completion` |
| `nilaiTuntas` | `required_if=BasisPenilaian skill,omitempty,min=0,max=100` |
| `description` | `omitempty,max=4000` |
| `tags` | `omitempty,dive,min=1,max=50` |
| `scopeId` | `omitempty,ulid` |

`CreateAssignmentRequest`:

| Field | Rule |
|---|---|
| `userIds` | `required,min=1,dive,ulid` |
| `kelasId` | `omitempty,ulid` |
| `dueAt` | `omitempty,datetime=2006-01-02T15:04:05Z07:00` |

`GradeRequest`:

| Field | Rule |
|---|---|
| `mark` | `omitempty,min=0,max=100` |
| `status` | `required,oneof=belum proses tuntas exempt` |
| `notes` | `omitempty,max=4000` |

Server-side post-validation:

- If materi is skill-based and `mark` is omitted → 400 `mark_required`.
- If `mark` ≥ `materi.nilai_tuntas` → server forces status to `tuntas`.
- Grading enforces actor has guru / pengurus / admin role for the kelas's scope.

## 7. Frontend impact

`web/app/src/api/materi.ts` and `materiAssignments.ts` provide TanStack Query hooks.

New SPA routes:

- `/_authed/materi` — catalog with filter chips and inline create.
- `/_authed/materi/$materiId` — detail with assignment list and grade table.
- `/_authed/kelas/$kelasId/raport` — per-kelas raport table sourced from assignments.
- `/_authed/me/raport` — murid view of own assignments + grades.

Grading UX: a sortable table with one row per murid and one column per materi. Cells colour by `achievement_status`. Click → modal that allows entering a mark (skill) or toggling status (completion).

## 8. Cross-cutting hooks

- **Audit log** ([34](./34-audit-log.md)): `action='materi.assign'`, `action='materi.grade'` etc.
- **Notifications** ([32](./32-notifications.md)): on grade change to `tuntas`, notify the murid (and their ortu).
- **Real-time** ([30](./30-real-time-websockets.md)): on grade, emit `pencapaian:update` to the kelas room (mirrors sitrac's event name).
- **Raport** ([41](./41-raport-system.md)): aggregates assignments per murid per semester.

## 9. Test plan

`internal/store/materi_test.go`:

- Create with `basis_penilaian='skill'` requires `nilai_tuntas`.
- Tags column round-trips JSON array.
- List with `tag=hafalan` filters by JSON containment.

`internal/store/materi_assignments_test.go`:

- Assign same materi twice to same user in same kelas → unique constraint error.
- Grade with mark ≥ `nilai_tuntas` flips status to `tuntas`.
- Grade with `basis_penilaian='completion'` ignores mark.
- SummaryForKelas counts achievements correctly.

`internal/handler/materi_test.go`:

- Guru cannot grade out-of-scope assignment → 403.
- Murid can read own assignments only.
- Bulk assign with mixed valid/invalid userIds returns per-row outcome.

## 10. Open questions

- **Material library structure**: do materials have hierarchy (parent/child)? Recommendation: keep flat in v1.
- **Versioning materials**: do edits to a materi propagate to existing assignments? Recommendation: no — grade rules look up the current materi. Add a `version` integer later if products need pinning.
- **Attachments**: a material may have lesson notes / PDFs. Defer to [33](./33-file-uploads.md) — attach via `media_bank` references in `materi.attachments` JSON column (add in a later migration).
