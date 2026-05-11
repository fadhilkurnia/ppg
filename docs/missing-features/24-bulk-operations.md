---
topic: bulk CSV import/export
depends-on: [12-user-and-roles.md, 20-kelas-system.md, 21-materi-system.md, 22-sesi-system.md]
enables: []
key-concepts: [csv-import, per-row-error, idempotent-upsert, streaming-export]
---

# 24 — Bulk CSV Import / Export

## TL;DR

Generalise the existing `importer/teachers` CLI into an HTTP API for every entity ppgus owns. Accept multipart CSV uploads at `POST /api/{entity}/bulk` and stream CSV downloads at `GET /api/{entity}/export.csv`. Return a per-row outcome report so a partial failure does not silently drop data. The same machinery powers `users`, `kelas`, `kelas_templates`, `materi`, `sesi`, and `attendances`.

Checklist:

- [ ] Define a shared `internal/bulk/` package with the per-entity adapter interface.
- [ ] Add a generic handler in `internal/handler/bulk.go`.
- [ ] Wire `/api/users/bulk`, `/api/kelas/bulk`, `/api/materi/bulk`, `/api/sesi/bulk`, `/api/students/bulk`, `/api/teachers/bulk`.
- [ ] Add streaming export endpoints.
- [ ] Re-implement the existing teacher CSV CLI on top of the new package so there is one code path.

---

## 1. Why this is needed

ppgus has a CLI for one entity only: `server import-teachers <path>` reads a CSV and inserts/updates teachers. There is no UI path, no error report, no other entity, and no export. gnrs already needs bulk import for users, classes, materials, and sessions — and the per-row error reporting is critical because real-world CSVs always have a few bad rows.

## 2. Shared package shape

```go
// internal/bulk/bulk.go
package bulk

import (
    "context"
    "encoding/csv"
    "io"
)

type Outcome string

const (
    OutcomeCreated Outcome = "created"
    OutcomeUpdated Outcome = "updated"
    OutcomeSkipped Outcome = "skipped"
    OutcomeFailed  Outcome = "failed"
)

type RowResult struct {
    Row     int     `json:"row"`     // 1-based, header is row 0
    Outcome Outcome `json:"outcome"`
    ID      string  `json:"id,omitempty"`
    Error   string  `json:"error,omitempty"`
}

type Importer[T any] interface {
    Name() string
    Headers() []string
    ParseRow(rec map[string]string) (T, error)
    Upsert(ctx context.Context, item T) (id string, created bool, err error)
}

func Process[T any](ctx context.Context, r io.Reader, imp Importer[T]) ([]RowResult, error) {
    cr := csv.NewReader(r)
    cr.TrimLeadingSpace = true
    head, err := cr.Read()
    if err != nil { return nil, err }
    var results []RowResult
    n := 0
    for {
        rec, err := cr.Read()
        if err == io.EOF { break }
        n++
        if err != nil {
            results = append(results, RowResult{Row: n, Outcome: OutcomeFailed, Error: err.Error()})
            continue
        }
        m := map[string]string{}
        for i, h := range head {
            if i < len(rec) { m[h] = rec[i] }
        }
        item, err := imp.ParseRow(m)
        if err != nil {
            results = append(results, RowResult{Row: n, Outcome: OutcomeFailed, Error: err.Error()})
            continue
        }
        id, created, err := imp.Upsert(ctx, item)
        switch {
        case err != nil:
            results = append(results, RowResult{Row: n, Outcome: OutcomeFailed, Error: err.Error()})
        case created:
            results = append(results, RowResult{Row: n, Outcome: OutcomeCreated, ID: id})
        default:
            results = append(results, RowResult{Row: n, Outcome: OutcomeUpdated, ID: id})
        }
    }
    return results, nil
}
```

Each entity adapter sits next to its store package:

```go
// internal/store/users_bulk.go
type UsersImporter struct { store *Users }

func (i *UsersImporter) Name() string { return "users" }
func (i *UsersImporter) Headers() []string { return []string{"email","username","name","role","scopeId","password"} }
func (i *UsersImporter) ParseRow(m map[string]string) (CreateUserInput, error) { ... }
func (i *UsersImporter) Upsert(ctx context.Context, in CreateUserInput) (string, bool, error) { ... }
```

## 3. HTTP contract

### 3.1 Import

```
POST /api/{entity}/bulk
Content-Type: multipart/form-data
file: <csv>
mode: create | upsert | dry-run
```

Response:

```json
{
  "data": {
    "summary": { "total": 50, "created": 47, "updated": 2, "skipped": 0, "failed": 1 },
    "results": [
      { "row": 1, "outcome": "created", "id": "01HZ..." },
      ...
      { "row": 37, "outcome": "failed", "error": "email already exists" }
    ]
  }
}
```

Modes:

- `create` — fail on duplicate key (default).
- `upsert` — update if key matches; insert otherwise. Keys per entity:
  - `users`: `email` (or `username`).
  - `kelas`: `(scope_id, name)`.
  - `materi`: `(name, scope_id IS NULL)` falls back to `(name, scope_id)`.
  - `sesi`: `(kelas_id, tanggal, jam_mulai)`.
- `dry-run` — parse and validate every row; return outcomes as `OutcomeSkipped` with the *would-be* error if any. No DB writes.

### 3.2 Export

```
GET /api/{entity}/export.csv?<same filter as list endpoint>
```

Streams `text/csv; charset=utf-8`. Headers come from the same `Headers()` method. Rows iterate the store's `List(...)` cursor without buffering the whole result.

Implementation hint:

```go
func (h *Bulk) Export(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "text/csv; charset=utf-8")
    w.Header().Set("Content-Disposition", `attachment; filename="export.csv"`)
    cw := csv.NewWriter(w)
    cw.Write(headers)
    for rows.Next() {
        var item Entity
        rows.Scan(...)
        cw.Write(toRecord(item))
    }
    cw.Flush()
}
```

### 3.3 Bulk delete

```
DELETE /api/{entity}/bulk
{ "ids": ["01HZ...", "01HZ..."], "mode": "archive" | "hard" }
```

`mode=archive` flips `status='archived'`. `mode=hard` runs `DELETE` and respects FK constraints (returns per-id outcome).

## 4. Entity-specific column conventions

| Entity | Required columns | Optional |
|---|---|---|
| `users` | `email`, `name`, `role` | `username`, `password`, `scopeId`, `phone` |
| `kelas` | `name`, `scopeId` | `guruEmail` (or `guruUserId`), `tahunAjaran`, `tingkat`, `templateId` |
| `kelas_templates` | `name` | `description`, `scopeIds`, `defaultTingkat`, `defaultName`, `mutableFields` |
| `materi` | `name`, `kategori`, `basisPenilaian` | `nilaiTuntas`, `description`, `tags`, `scopeId` |
| `materi_assignments` | `materiId`, `userIds`, `kelasId?` | `dueAt` |
| `sesi` | `kelasId`, `tanggal`, `jamMulai` | `materiId`, `jamSelesai` |
| `students` (legacy) | `name`, `kelompok`, `level` | as today's importer |
| `teachers` (legacy) | `name`, `kelompok`, `desa`, `daerah` | as today's importer |

CSV header names are camelCase to match JSON tags. Email or username may be used in place of `userId` for human-edited imports; the parser resolves them server-side.

## 5. Limits

- Max upload size: **5 MB** by default (≈ 50 k rows). Configurable via `BULK_MAX_BYTES`.
- Hard cap rows: **20 000** per request (rejected with 413 before parsing).
- Per-request DB time budget: **30 s**. Long imports should split.
- Per-row budget: **100 ms** (after which the row is marked failed with `error="row_timeout"`).

## 6. Frontend impact

`web/app/src/components/BulkImporter.tsx` is a reusable component:

```tsx
<BulkImporter entity="users" mode="upsert" headers={["email","name","role","scopeId"]} />
```

It:

- Accepts a CSV via drag-and-drop or file picker.
- Validates client-side against the headers (warns about missing columns).
- POSTs as `multipart/form-data`.
- Renders the per-row outcome with row numbers linked to a downloadable error CSV.

A separate `<BulkExporter entity="users" filters={...} />` component triggers the export endpoint and saves the response as a file.

## 7. Audit & idempotency

- The whole import is wrapped in a single audit_log entry of kind `bulk.import` (action=`<entity>.bulk_import`) with the file's SHA-256, mode, total row counts.
- Re-uploading the same file in `upsert` mode is safe: all rows match keys and outcomes become `updated`.

## 8. Test plan

`internal/bulk/bulk_test.go`:

- Parse + upsert flow with a 5-row CSV: 3 created, 1 updated, 1 failed.
- Dry-run produces results but writes nothing.
- BOM-prefixed UTF-8 files parse correctly.
- Comma-vs-semicolon detection: support both via `csv.Reader.Comma` heuristic.

`internal/handler/bulk_test.go`:

- POST without `mode` defaults to `create`.
- POST with too-large file → 413.
- DELETE bulk archive returns per-id outcomes.

## 9. CLI compatibility

The existing `server import-teachers <path>` command stays but is rewritten to call into `internal/bulk` so there is one code path. This keeps the operational habit available for operators who prefer the shell.

## 10. Open questions

- **Async imports**: for files near the cap, do we accept-and-queue rather than process inline? Recommendation: yes, behind a feature flag. Use the scheduler ([22](./22-sesi-system.md) §4) as the job runner.
- **Excel uploads**: support `.xlsx` directly or require CSV conversion? Recommendation: CSV only in v1.
- **Schema discovery endpoint**: `GET /api/{entity}/bulk/schema` returns `Headers()` and per-column rules — useful for the frontend to render a column mapping UI.
