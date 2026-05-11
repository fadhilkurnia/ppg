---
topic: scope hierarchy (daerah/desa/kelompok)
depends-on: [10-domain-model-evolution.md]
enables: [12-user-and-roles.md, 20-kelas-system.md, 50-security-hardening.md]
key-concepts: [tree-table, closure-table, scope-aware-access-control, manageable-roles]
---

# 11 — Scope Hierarchy

## TL;DR

Introduce a three-level organisational tree — **Daerah → Desa → Kelompok** — stored in a single self-referencing `scopes` table. Replace the four hard-coded `kelompok` values on `students` (California / Chicago / New Hampshire / Canada) with foreign keys to that table. Add a `user_scopes` association so a user can belong to one primary scope and zero or more secondary scopes. All scope-aware endpoints filter results by the requester's scopes (admins see everything).

This is a prerequisite for every feature that needs to ask "which classes can this guru see?", "which murid is this ortu allowed to view?", or "is this materi assignable to this kelompok?".

Checklist:

- [ ] Migration `011_add_scopes` creates `scopes` and `user_scopes`.
- [ ] Seed the existing four kelompok as scope rows (with appropriate daerah/desa parents — see §5).
- [ ] Optional follow-up migration: add `scope_id` columns to `students` and `teachers` that mirror `kelompok` text values; backfill from the seed.
- [ ] Add `internal/store/scopes.go` with tree queries (children, ancestors, path).
- [ ] Add `internal/handler/scopes.go` with REST endpoints.
- [ ] Add `auth.ScopedRequest` helper that resolves the requester's effective scope set.
- [ ] Document the closure-table option for deep trees (§7).

---

## 1. Why ppgus needs this

Today, `students.kelompok` is a `TEXT` column constrained by a `CHECK` to four values:

```sql
CHECK (kelompok IN ('California', 'Chicago', 'New Hampshire', 'Canada'))
```

That worked for the current PPG mentorship program but breaks immediately if:

- A fifth kelompok is added.
- Two kelompok need to be grouped under a desa for joint reporting.
- An "Indonesia" daerah is opened with its own desa/kelompok subtree.
- A guru's "kelas" needs to be associated with a kelompok, but the kelompok itself needs metadata (display name, code, status).

gnrs's `GnrsScopeOption` model (`level`, `kind` = `daerah/desa/kelompok`) and sitrac's GNRS adoption plan in `gnrs.md` both anticipate a proper tree. We adopt the same shape.

## 2. Data model

### 2.1 `scopes` table

```sql
CREATE TABLE scopes (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES scopes(id) ON DELETE RESTRICT,
    kind        TEXT NOT NULL CHECK (kind IN ('daerah','desa','kelompok')),
    name        TEXT NOT NULL,
    code        TEXT,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_scopes_parent     ON scopes(parent_id);
CREATE INDEX idx_scopes_kind_name  ON scopes(kind, name);
CREATE INDEX idx_scopes_status     ON scopes(status);
```

### 2.2 `user_scopes` table

```sql
CREATE TABLE user_scopes (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope_id   TEXT NOT NULL REFERENCES scopes(id) ON DELETE RESTRICT,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, scope_id)
);

CREATE INDEX idx_user_scopes_scope ON user_scopes(scope_id);

-- A user may have at most one primary scope.
CREATE UNIQUE INDEX idx_user_scopes_one_primary
    ON user_scopes(user_id) WHERE is_primary = 1;
```

### 2.3 Migration files

`internal/store/migrations/011_add_scopes.up.sql`:

```sql
-- (paste the two CREATE TABLEs and indexes above)
```

`internal/store/migrations/011_add_scopes.down.sql`:

```sql
DROP TABLE IF EXISTS user_scopes;
DROP TABLE IF EXISTS scopes;
```

## 3. Tree integrity

SQLite cannot directly express "a daerah's parent must be NULL; a desa's parent must be a daerah; a kelompok's parent must be a desa". Two ways to enforce this:

### 3.1 Application-level (preferred)

`store.Scopes.Create()` validates the kind/parent combination:

```go
func (s *Scopes) Create(ctx context.Context, in CreateScopeInput) (model.Scope, error) {
    if err := s.assertParentKind(ctx, in.Kind, in.ParentID); err != nil {
        return model.Scope{}, err
    }
    // ... INSERT ...
}

func (s *Scopes) assertParentKind(ctx context.Context, kind string, parentID *string) error {
    switch kind {
    case "daerah":
        if parentID != nil {
            return ErrInvalidParent
        }
    case "desa":
        if parentID == nil {
            return ErrInvalidParent
        }
        return s.requireParentKind(ctx, *parentID, "daerah")
    case "kelompok":
        if parentID == nil {
            return ErrInvalidParent
        }
        return s.requireParentKind(ctx, *parentID, "desa")
    }
    return nil
}
```

### 3.2 Trigger-level (defensive)

Add a CHECK trigger if you also want belt-and-braces protection:

```sql
CREATE TRIGGER trg_scopes_kind_parent
BEFORE INSERT ON scopes
FOR EACH ROW WHEN (
    (NEW.kind = 'daerah'   AND NEW.parent_id IS NOT NULL) OR
    (NEW.kind = 'desa'     AND NEW.parent_id IS NULL) OR
    (NEW.kind = 'kelompok' AND NEW.parent_id IS NULL)
)
BEGIN
    SELECT RAISE(ABORT, 'invalid scope parent for kind');
END;
```

This is optional; the application check above is sufficient.

## 4. Common queries

### 4.1 Get the full path of a scope (kelompok → desa → daerah)

```sql
WITH RECURSIVE ancestors(id, parent_id, kind, name, depth) AS (
    SELECT id, parent_id, kind, name, 0 FROM scopes WHERE id = ?
    UNION ALL
    SELECT s.id, s.parent_id, s.kind, s.name, a.depth + 1
    FROM scopes s
    JOIN ancestors a ON s.id = a.parent_id
)
SELECT * FROM ancestors ORDER BY depth DESC;
```

Go wrapper returns a `[]model.Scope` ordered root→leaf.

### 4.2 Get all descendants of a scope

```sql
WITH RECURSIVE descendants(id, parent_id, kind, name) AS (
    SELECT id, parent_id, kind, name FROM scopes WHERE parent_id = ?
    UNION ALL
    SELECT s.id, s.parent_id, s.kind, s.name
    FROM scopes s
    JOIN descendants d ON s.parent_id = d.id
)
SELECT * FROM descendants;
```

### 4.3 Get all scope IDs the requester can see

```go
// Returns the requester's primary + secondary scopes plus all their descendants.
func (s *Scopes) EffectiveIDs(ctx context.Context, userID string) ([]string, error)
```

Used by every list endpoint: append `AND scope_id IN (?, ?, ...)` to the WHERE clause.

## 5. Seeding from existing data

The four current `kelompok` values become `kelompok`-kind scopes. Assume initial parent assignments (open to product decision):

```sql
-- 012_seed_initial_scopes.up.sql (idempotent)
INSERT OR IGNORE INTO scopes (id, parent_id, kind, name, code) VALUES
('01HZQK0DAERAH0AMERICA', NULL, 'daerah', 'Americas', 'AMS');
INSERT OR IGNORE INTO scopes (id, parent_id, kind, name, code) VALUES
('01HZQK1DESA0NORTHEAST', '01HZQK0DAERAH0AMERICA', 'desa', 'Northeast US', 'NE'),
('01HZQK1DESA0WEST',      '01HZQK0DAERAH0AMERICA', 'desa', 'West US',      'WEST'),
('01HZQK1DESA0MIDWEST',   '01HZQK0DAERAH0AMERICA', 'desa', 'Midwest US',   'MID'),
('01HZQK1DESA0CANADA',    '01HZQK0DAERAH0AMERICA', 'desa', 'Canada',       'CA');
INSERT OR IGNORE INTO scopes (id, parent_id, kind, name, code) VALUES
('01HZQK2KEL0CALIFORNIA', '01HZQK1DESA0WEST',      'kelompok', 'California',    'CA'),
('01HZQK2KEL0CHICAGO',    '01HZQK1DESA0MIDWEST',   'kelompok', 'Chicago',       'CHI'),
('01HZQK2KEL0NEWHAMP',    '01HZQK1DESA0NORTHEAST', 'kelompok', 'New Hampshire', 'NH'),
('01HZQK2KEL0CANADA',     '01HZQK1DESA0CANADA',    'kelompok', 'Canada',        'CAN');
```

The exact desa groupings are a product decision; the seed file is the right place to capture them.

### 5.1 Optional: link existing `students.kelompok` to `scope_id`

`013_link_students_to_scopes.up.sql`:

```sql
ALTER TABLE students ADD COLUMN scope_id TEXT REFERENCES scopes(id);
UPDATE students SET scope_id = (
    SELECT id FROM scopes WHERE kind = 'kelompok' AND name = students.kelompok
);
CREATE INDEX idx_students_scope ON students(scope_id);
```

Do **not** drop the `kelompok` text column. Keep it as the legacy display field; new code reads `scope_id`. A future migration may drop the column once all downstream consumers are migrated.

### 5.2 Same for `teachers`

```sql
ALTER TABLE teachers ADD COLUMN kelompok_scope_id TEXT REFERENCES scopes(id);
ALTER TABLE teachers ADD COLUMN desa_scope_id     TEXT REFERENCES scopes(id);
ALTER TABLE teachers ADD COLUMN daerah_scope_id   TEXT REFERENCES scopes(id);
```

Backfill from the existing free-text fields where possible; leave NULL otherwise. The existing fields remain authoritative for legacy data.

## 6. API contract

All endpoints under `/api/scopes`. Admin-only for mutations; any authenticated user for reads.

### 6.1 List scopes

```
GET /api/scopes?kind=kelompok&parentId=01HZQK1DESA0WEST&status=active
```

Response:

```json
{
  "data": [
    { "id": "01HZQK2KEL0CALIFORNIA", "parentId": "01HZQK1DESA0WEST",
      "kind": "kelompok", "name": "California", "code": "CA",
      "status": "active", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

### 6.2 Tree view

```
GET /api/scopes/tree
```

Returns the full tree as a nested structure:

```json
{
  "data": [
    {
      "id": "01HZQK0DAERAH0AMERICA",
      "kind": "daerah",
      "name": "Americas",
      "children": [
        { "id": "...", "kind": "desa", "name": "West US", "children": [ ... ] }
      ]
    }
  ]
}
```

Implemented by selecting all scopes once and assembling client-side in Go (no recursive CTE per node).

### 6.3 Create / update / archive

```
POST   /api/scopes        { kind, name, parentId?, code? }
PATCH  /api/scopes/{id}   { name?, code?, status? }
DELETE /api/scopes/{id}   → soft-delete (sets status='archived')
```

Body validation rules:

| Field | Rule |
|---|---|
| `kind` | `oneof=daerah desa kelompok` |
| `name` | `required,max=200` |
| `parentId` | `required_unless=Kind daerah,ulid` |
| `code` | `omitempty,max=20` |

### 6.4 Per-scope user list

```
GET /api/scopes/{id}/users?role=guru&limit=50&offset=0
```

Returns users assigned to the given scope (or any descendant). Used by the guru-assignment dialog when creating a kelas.

## 7. Closure-table option (for deep trees)

If the hierarchy grows beyond three levels (e.g. national → regional → daerah → desa → kelompok), the recursive CTEs in §4 remain correct but become expensive. The standard remedy is a closure table:

```sql
CREATE TABLE scope_closure (
    ancestor_id   TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    descendant_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
    depth         INTEGER NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);

-- (also INSERT trigger to maintain on scopes INSERT, UPDATE of parent_id, DELETE)
```

Queries become:

```sql
SELECT * FROM scopes
WHERE id IN (SELECT descendant_id FROM scope_closure WHERE ancestor_id = ?);
```

This is overkill for three levels. Document the migration but do not ship it.

## 8. Frontend impact

The embedded React SPA does not currently expose scope management. Two screens to add:

1. **`/scopes`** — admin tree editor. A simple two-pane (tree on left, detail on right).
2. **Pickers**: a `<ScopePicker kind="kelompok" parent={...} />` component used by Student / Teacher / Kelas forms.

Implementation hints:

- Fetch the entire tree once via `/api/scopes/tree` and cache with TanStack Query (`staleTime: 5 * 60_000`).
- Filter by `kind` in-memory; trees are small.
- For lazy expansion in very large trees, add `?depth=1&parentId=...` query parameter on `/api/scopes`.

## 9. Access-control hook

`auth.ScopedRequest(r *http.Request)` returns the requester's claims plus the effective scope ID set:

```go
type ScopedClaims struct {
    *Claims
    PrimaryScopeID    string
    EffectiveScopeIDs map[string]struct{} // primary + secondaries + descendants
    IsAdmin           bool
}
```

Handlers use it like so:

```go
func (h *Kelas) List(w http.ResponseWriter, r *http.Request) {
    sc, _ := auth.FromRequest(r)
    rows, err := h.store.ListForScopes(r.Context(), sc.EffectiveScopeIDs)
    // ...
}
```

Admin bypass: `sc.IsAdmin = true` short-circuits the filter to `nil`, meaning "no scope restriction".

## 10. Testing

`internal/store/scopes_test.go` cases:

- Insert daerah → desa → kelompok → assert paths.
- Reject desa without parent.
- Reject kelompok with daerah parent (wrong kind).
- Reject cycles (a scope's `parent_id` cannot reach itself).
- `EffectiveIDs` returns the scope, its descendants, and respects `is_primary`.
- `ListChildren` is paginated and stable-ordered by `created_at, id`.

`internal/handler/scopes_test.go`:

- Non-admin can read; cannot mutate.
- Archive on a scope with children returns `409 has_descendants`.
- Tree endpoint returns deterministic order.

## 11. Migration sequence summary

```
011_add_scopes.up.sql           — create scopes + user_scopes
012_seed_initial_scopes.up.sql  — insert daerah/desa/kelompok rows
013_link_students_to_scopes.up.sql (optional) — add scope_id columns + backfill
014_link_teachers_to_scopes.up.sql (optional) — add scope_id columns + backfill
```

Each has a matching `*.down.sql` that drops only what it added.

## 12. Open questions for product

- Do guru's free-text `kelompok` / `desa` / `daerah` fields stay as legacy display, or should they be replaced wholesale once the seed is reliable?
- Should a scope have arbitrary metadata (JSON blob) for region-specific UI tweaks? If yes, add a `meta TEXT` column now.
- Do we ever need per-scope feature flags (e.g. "Kelompok California uses Tilawati but Canada does not")? If yes, model it explicitly later via a `scope_settings` table rather than overloading `meta`.
