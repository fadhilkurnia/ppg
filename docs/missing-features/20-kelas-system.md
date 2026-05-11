---
topic: kelas (class) entity and templates
depends-on: [10-domain-model-evolution.md, 11-scope-hierarchy.md, 12-user-and-roles.md]
enables: [21-materi-system.md, 22-sesi-system.md, 40-curriculum-progress.md]
key-concepts: [class-entity, enrollment, kelas-template, immutable-fields, clone-on-create]
---

# 20 — Kelas (Class) System

## TL;DR

Introduce a `kelas` entity representing a class / cohort, with a many-to-many `kelas_enrollments` table linking it to murid (`users` with role `murid`). Add a `kelas_templates` system that lets an admin pre-define a class shape (name pattern, scope set, default materials) and clone it; track which template fields are **mutable** vs **immutable** at clone time. Expose REST endpoints under `/api/kelas` and `/api/kelas-templates`.

This is the missing link between scope hierarchy ([11](./11-scope-hierarchy.md)) and the curriculum / sesi / attendance layers ([21](./21-materi-system.md), [22](./22-sesi-system.md), [40](./40-curriculum-progress.md)).

Checklist:

- [ ] Migration `013_add_kelas` creates `kelas`, `kelas_enrollments`.
- [ ] Migration `014_add_kelas_templates` creates `kelas_templates`, `kelas_template_materi`.
- [ ] Add `internal/store/kelas.go`, `internal/store/kelas_templates.go`.
- [ ] Add `internal/handler/kelas.go`, `internal/handler/kelas_templates.go`.
- [ ] Wire `/api/kelas/*` and `/api/kelas-templates/*` in `cmd/server/main.go`.
- [ ] Add tests covering enrollment, status transitions, template cloning.

---

## 1. Why this is needed

ppgus today has no concept of a "class". Attendance is logged as (student, teacher, date) — perfectly fine for one-to-one mentorship but unable to model **"Kelas Caberawit California 2026/2027"** as a first-class group that owns:

- A roster of murid.
- A primary guru (and optional assistants).
- A set of expected materials.
- A series of scheduled sesi.
- Activity history (chat, notes, attendance summaries).

gnrs and sitrac both treat `kelas` as the central entity for almost every guru workflow. The TODO.md in gnrs explicitly calls out **class templates** as the next major feature.

## 2. Data model

### 2.1 `kelas`

```sql
CREATE TABLE kelas (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    scope_id      TEXT NOT NULL REFERENCES scopes(id) ON DELETE RESTRICT,
    guru_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    template_id   TEXT REFERENCES kelas_templates(id) ON DELETE SET NULL,
    tahun_ajaran  TEXT,
    tingkat       TEXT,
    description   TEXT,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_kelas_scope       ON kelas(scope_id);
CREATE INDEX idx_kelas_guru        ON kelas(guru_user_id);
CREATE INDEX idx_kelas_template    ON kelas(template_id);
CREATE INDEX idx_kelas_status_year ON kelas(status, tahun_ajaran);
```

Notes:

- `name` may repeat across scopes; uniqueness is enforced at the application level only if needed.
- `tahun_ajaran` is free-text in the form `"2026/2027"`.
- `tingkat` ("Caberawit" / "Pra Remaja" / "Remaja" / "Pra Nikah") mirrors the existing `students.level` enum but is free-text on `kelas` to avoid coupling.

### 2.2 `kelas_enrollments`

```sql
CREATE TABLE kelas_enrollments (
    kelas_id     TEXT NOT NULL REFERENCES kelas(id) ON DELETE RESTRICT,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    enrolled_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    left_at      TEXT,
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','left')),
    PRIMARY KEY (kelas_id, user_id)
);

CREATE INDEX idx_kelas_enrollments_user   ON kelas_enrollments(user_id);
CREATE INDEX idx_kelas_enrollments_status ON kelas_enrollments(status);
```

Notes:

- `user_id` is a `users` reference, not a `students` reference. Murid in the new model are `users` rows with role `murid`. The legacy `students` table stays for the original SPA; new code uses `users`.
- A user can have multiple enrollments across different classes simultaneously.

### 2.3 `kelas_templates`

```sql
CREATE TABLE kelas_templates (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT,
    scope_ids        TEXT NOT NULL DEFAULT '[]', -- JSON array of scope ids
    default_tingkat  TEXT,
    default_name     TEXT, -- name pattern, e.g. "Caberawit {scope} {tahun_ajaran}"
    mutable_fields   TEXT NOT NULL DEFAULT '["name","tahun_ajaran","guru_user_id"]',
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_by       TEXT REFERENCES users(id),
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_kelas_templates_status ON kelas_templates(status);
```

### 2.4 `kelas_template_materi`

```sql
CREATE TABLE kelas_template_materi (
    template_id  TEXT NOT NULL REFERENCES kelas_templates(id) ON DELETE CASCADE,
    materi_id    TEXT NOT NULL REFERENCES materi(id) ON DELETE RESTRICT,
    ordering     INTEGER NOT NULL DEFAULT 0,
    required     INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
    PRIMARY KEY (template_id, materi_id)
);

CREATE INDEX idx_kelas_template_materi_materi ON kelas_template_materi(materi_id);
```

### 2.5 Migration files

`internal/store/migrations/013_add_kelas.up.sql` — `kelas` + `kelas_enrollments`.
`internal/store/migrations/013_add_kelas.down.sql` — drop both.

`internal/store/migrations/014_add_kelas_templates.up.sql` — `kelas_templates` + `kelas_template_materi`. **Depends on `materi` (migration 015)** if templates link to materi; either reorder migrations or defer the FK to a later migration. Recommended: ship templates without materi links in 014, then add the materi link in 015 once `materi` exists.

## 3. Go model

`internal/model/kelas.go`:

```go
package model

import "time"

type Kelas struct {
    ID            string    `json:"id"`
    Name          string    `json:"name"`
    ScopeID       string    `json:"scopeId"`
    GuruUserID    *string   `json:"guruUserId,omitempty"`
    TemplateID    *string   `json:"templateId,omitempty"`
    TahunAjaran   *string   `json:"tahunAjaran,omitempty"`
    Tingkat       *string   `json:"tingkat,omitempty"`
    Description   *string   `json:"description,omitempty"`
    Status        string    `json:"status"`
    CreatedAt     time.Time `json:"createdAt"`
    UpdatedAt     time.Time `json:"updatedAt"`

    // Optional joined fields.
    GuruName      *string   `json:"guruName,omitempty"`
    ScopeName     *string   `json:"scopeName,omitempty"`
    EnrolledCount int       `json:"enrolledCount,omitempty"`
}

type KelasEnrollment struct {
    KelasID    string     `json:"kelasId"`
    UserID     string     `json:"userId"`
    EnrolledAt time.Time  `json:"enrolledAt"`
    LeftAt     *time.Time `json:"leftAt,omitempty"`
    Status     string     `json:"status"`

    UserName   *string    `json:"userName,omitempty"`
}

type KelasTemplate struct {
    ID             string                `json:"id"`
    Name           string                `json:"name"`
    Description    *string               `json:"description,omitempty"`
    ScopeIDs       []string              `json:"scopeIds"`
    DefaultTingkat *string               `json:"defaultTingkat,omitempty"`
    DefaultName    *string               `json:"defaultName,omitempty"`
    MutableFields  []string              `json:"mutableFields"`
    Status         string                `json:"status"`
    Materi         []KelasTemplateMateri `json:"materi,omitempty"`
    CreatedBy      *string               `json:"createdBy,omitempty"`
    CreatedAt      time.Time             `json:"createdAt"`
    UpdatedAt      time.Time             `json:"updatedAt"`
}

type KelasTemplateMateri struct {
    MateriID   string  `json:"materiId"`
    Ordering   int     `json:"ordering"`
    Required   bool    `json:"required"`
    MateriName *string `json:"materiName,omitempty"`
}
```

## 4. Store layer

`internal/store/kelas.go` essential functions:

```go
type Kelas struct{ db *sql.DB }

type ListKelasFilter struct {
    ScopeIDs    []string // pre-resolved effective scopes
    GuruUserID  *string
    TahunAjaran *string
    Status      string
    Q           string
    Limit       int
    Offset      int
}

func (k *Kelas) Create(ctx context.Context, in CreateKelasInput) (model.Kelas, error)
func (k *Kelas) Get(ctx context.Context, id string) (model.Kelas, error)
func (k *Kelas) List(ctx context.Context, f ListKelasFilter) ([]model.Kelas, int, error)
func (k *Kelas) Update(ctx context.Context, id string, in UpdateKelasInput) error
func (k *Kelas) Archive(ctx context.Context, id string) error

// Enrollment
func (k *Kelas) Enroll(ctx context.Context, kelasID, userID string) error
func (k *Kelas) Unenroll(ctx context.Context, kelasID, userID string) error
func (k *Kelas) ListEnrollments(ctx context.Context, kelasID string, includeLeft bool) ([]model.KelasEnrollment, error)
func (k *Kelas) ListEnrolledKelas(ctx context.Context, userID string) ([]model.Kelas, error)
```

`internal/store/kelas_templates.go`:

```go
type KelasTemplates struct{ db *sql.DB }

func (t *KelasTemplates) Create(ctx context.Context, in CreateKelasTemplateInput) (model.KelasTemplate, error)
func (t *KelasTemplates) Get(ctx context.Context, id string) (model.KelasTemplate, error)
func (t *KelasTemplates) List(ctx context.Context, status string) ([]model.KelasTemplate, error)
func (t *KelasTemplates) Update(ctx context.Context, id string, in UpdateKelasTemplateInput) error
func (t *KelasTemplates) Archive(ctx context.Context, id string) error

// Materi links
func (t *KelasTemplates) SetMateri(ctx context.Context, id string, materi []model.KelasTemplateMateri) error
func (t *KelasTemplates) Clone(ctx context.Context, id string, overrides CloneOverrides) (model.Kelas, error)
```

The `Clone` function is the core of templates: it inserts a new `kelas` row and copies the template's materi as `materi_assignments` (after materi exists per [21](./21-materi-system.md)). It honours `mutable_fields`: if a field is in the list, the override is used; otherwise the template default wins.

```go
type CloneOverrides struct {
    Name        *string
    ScopeID     *string
    GuruUserID  *string
    TahunAjaran *string
}

func (t *KelasTemplates) Clone(ctx context.Context, id string, ov CloneOverrides) (model.Kelas, error) {
    tpl, err := t.Get(ctx, id)
    if err != nil {
        return model.Kelas{}, err
    }
    mut := map[string]bool{}
    for _, f := range tpl.MutableFields {
        mut[f] = true
    }
    in := CreateKelasInput{
        Name:        firstNonEmpty(applyOverride(mut, "name", ov.Name), tpl.DefaultName, tpl.Name),
        ScopeID:     pickScope(mut, ov.ScopeID, tpl.ScopeIDs),
        GuruUserID:  applyOverride(mut, "guru_user_id", ov.GuruUserID),
        TemplateID:  &tpl.ID,
        TahunAjaran: applyOverride(mut, "tahun_ajaran", ov.TahunAjaran),
        Tingkat:     tpl.DefaultTingkat,
    }
    // ... insert kelas, copy materi links to materi_assignments, all in one tx ...
}
```

## 5. API contract

### 5.1 Kelas

| Method | Path | Body / Query | Notes |
|---|---|---|---|
| GET | `/api/kelas` | `?scopeId=&guruUserId=&tahunAjaran=&status=&q=&limit=&offset=` | scoped list |
| GET | `/api/kelas/{id}` | — | with `enrolledCount`, `guruName`, `scopeName` |
| POST | `/api/kelas` | `{ name, scopeId, guruUserId?, templateId?, tahunAjaran?, tingkat?, description? }` | admin / pengurus |
| PATCH | `/api/kelas/{id}` | partial | admin / pengurus |
| DELETE | `/api/kelas/{id}` | — | soft-delete |
| GET | `/api/kelas/{id}/enrollments` | `?includeLeft=true` | list members |
| POST | `/api/kelas/{id}/enrollments` | `{ userIds: [...] }` | bulk enrol |
| DELETE | `/api/kelas/{id}/enrollments/{userId}` | — | flip status to `'left'` |
| GET | `/api/kelas/me` | — | list classes the requester teaches / belongs to |
| GET | `/api/kelas/exist?name=...&scopeId=...` | — | true / false (used by gnrs duplicate check) |

### 5.2 Kelas templates

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/kelas-templates` | `?status=` | list |
| GET | `/api/kelas-templates/{id}` | — | includes `materi` |
| POST | `/api/kelas-templates` | `{ name, description?, scopeIds, defaultTingkat?, defaultName?, mutableFields? }` | admin |
| PATCH | `/api/kelas-templates/{id}` | partial | admin |
| DELETE | `/api/kelas-templates/{id}` | — | soft-delete |
| PUT | `/api/kelas-templates/{id}/materi` | `{ materi: [{ materiId, ordering, required }] }` | replace links |
| POST | `/api/kelas-templates/{id}/clone` | `{ overrides: { name?, scopeId?, guruUserId?, tahunAjaran? } }` | returns the new `kelas` |

### 5.3 Bulk

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/kelas/bulk` | CSV | see [24](./24-bulk-operations.md) |
| DELETE | `/api/kelas/bulk` | `{ ids: [...] }` | bulk archive |

## 6. Validation rules

`CreateKelasRequest`:

| Field | Rule |
|---|---|
| `name` | `required,max=200` |
| `scopeId` | `required,ulid` |
| `guruUserId` | `omitempty,ulid` |
| `templateId` | `omitempty,ulid` |
| `tahunAjaran` | `omitempty,max=20` |
| `tingkat` | `omitempty,oneof=Caberawit "Pra Remaja" Remaja "Pra Nikah"` |
| `description` | `omitempty,max=2000` |

Additional server-side checks:

- `scope_id` must be `kind = 'kelompok'` (kelas is always at the smallest level).
- `guru_user_id` must exist and have `guru` (or `admin`) role.
- `template_id` must be `status='active'`.

## 7. Frontend impact

`web/app/src/api/kelas.ts` (new) provides TanStack Query hooks: `useKelasList`, `useKelas`, `useCreateKelas`, `useEnrollments`, etc.

New SPA routes (TanStack Router):

- `/_authed/kelas` — list with filter chips (scope, year, status, search).
- `/_authed/kelas/$kelasId` — detail page with tabs: roster, sesi, materi, notes, chat (chat shows up after [31](./31-chat-messaging.md)).
- `/_authed/kelas/$kelasId/edit` — modal-based edit, same as existing modal pattern.
- `/_authed/kelas/templates` — admin list & editor.

Cloning UX: on the templates list, an "Apply" button opens a small dialog that shows the mutable fields as inputs (with template defaults pre-filled) and the immutable fields as read-only chips with a hint "set by template".

## 8. Cross-cutting hooks

- **Audit log** ([34](./34-audit-log.md)): every create / update / archive / enrol / unenrol / clone records an entry with `action='kelas.create'` etc., capturing `before` and `after` snapshots.
- **Notifications** ([32](./32-notifications.md)): on enrolment, notify the murid (and their ortu via [42](./42-parent-child.md)).
- **Real-time** ([30](./30-real-time-websockets.md)): on enrolment changes, emit `kelas:enrollment_updated` to all members of the class.

## 9. Test plan

`internal/store/kelas_test.go`:

- Create → Get returns the row with denormalised joins.
- List with `scopeId` filter restricts by FK.
- List with `q` does substring match on `name` and `tingkat`.
- Enrol same user twice → second call is no-op (idempotent).
- Unenrol sets status; List excludes by default.
- Archive on a kelas with active sesi → `409 has_active_sesi`.

`internal/store/kelas_templates_test.go`:

- Create + SetMateri inserts the link rows.
- Clone respects `mutable_fields`: overrides applied only for mutable fields.
- Clone copies template materi as `materi_assignments` for the new kelas's roster (when materi exist).

`internal/handler/kelas_test.go`:

- Non-admin pengurus in a different scope → 404 on Get.
- Guru can list classes where they are the `guru_user_id`.
- Murid can list classes where they are enrolled.
- Idempotent enrol via `POST /enrollments` with `userIds` containing a duplicate.

## 10. Open questions for product

- **Multiple guru per kelas**: currently one `guru_user_id`. A future `kelas_guru` table allows multiple (primary + assistant). Not in v1.
- **Tahun ajaran model**: keep free-text or introduce a `tahun_ajaran` table? Recommendation: keep free-text in v1.
- **Template scope semantics**: `scope_ids` lists scopes a template *can* be cloned for; not where it lives. A clone at clone-time picks one of those scopes. Clarify in UI.
- **Auto-enrol on clone**: do clones automatically enrol murid from the source scope's "murid pool"? Recommendation: no — explicit enrolment only.
