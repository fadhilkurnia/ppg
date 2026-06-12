# Kelas Jadwal Rutin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each kelas a recurring weekly schedule that lazily auto-generates `sesi` rows (rolling 8-week horizon, idempotent) when the class is opened; admin or the kelas wali may manage it.

**Architecture:** New `kelas_jadwal` table (one row per kelas, migration 045) + a `sesi.jadwal_id` back-reference. Generation is request-driven Go (no daemon): `KelasStore` gains jadwal CRUD plus `ExpandJadwal`/`GenerateJadwal`, wired to `SesiStore` via `AttachSesi` (mirrors the existing `SesiStore.AttachRencana`). The frontend adds a `KelasJadwalDialog` (modeled on `KelasAnggotaDialog`) reachable from a card icon (admin/wali), and `KelasSesiDialog` fires an idempotent generate-on-open.

**Tech Stack:** Go + chi + SQLite (mattn/go-sqlite3, golang-migrate, oklog/ulid, go-playground/validator); React 18 + TanStack Query + react-i18next + Tailwind; module `github.com/fadhilkurnia/ppg-dashboard`.

**Conventions to honor (verbatim from the codebase):**
- ULID: `ulid.Make().String()` (import `github.com/oklog/ulid/v2`).
- Timestamps: `time.Now().UTC().Format("2006-01-02T15:04:05.000Z")`; SQL default `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`.
- `tanggal` is wall-clock `"YYYY-MM-DD"` (no UTC drift); `mulai`/`selesai` are `"HH:MM"`.
- No SQL foreign keys — cross-table refs enforced in handlers/comments.
- Nullable cols modeled as Go `*string`, scanned directly.
- HTTP: `httpx.Error(w, status, "snake_code", "Pesan Indonesia")`; `httpx.JSON(w, status, payload)`; 204 = `httpx.JSON(w, http.StatusNoContent, nil)`.
- Tests: `make test` (`go test ./... -count=1`, CGO/sqlite — run in the golang container if Go isn't local). Type-check: `make typecheck`.

---

## Task 1: Migration 045 — `kelas_jadwal` table + `sesi.jadwal_id`

**Files:**
- Create: `internal/store/migrations/045_kelas_jadwal.up.sql`
- Create: `internal/store/migrations/045_kelas_jadwal.down.sql`

- [ ] **Step 1: Confirm 045 is the next free number**

Run: `ls internal/store/migrations/ | grep -oE '^[0-9]{3}' | sort -u | tail -1`
Expected: `044` (so 045 is free). If higher, use the next free number consistently everywhere below.

- [ ] **Step 2: Write `045_kelas_jadwal.up.sql`**

```sql
-- 045 — Jadwal rutin per kelas (recurring weekly schedule).
--
-- One row per kelas (UNIQUE kelas_id). `hari` is a CSV of weekday integers
-- (0=Minggu..6=Sabtu) the class meets; all selected days share one mulai/
-- selesai time. The schedule lazily auto-generates individual `sesi` rows on
-- class open, up to `horizon_minggu` weeks ahead (see internal/store/jadwal.go).
-- kelas_id references kelas.id (handler-enforced, no SQL FK — house style).
CREATE TABLE kelas_jadwal (
  id             TEXT PRIMARY KEY,
  kelas_id       TEXT NOT NULL UNIQUE,
  hari           TEXT NOT NULL,
  mulai          TEXT NOT NULL,
  selesai        TEXT,
  topik_default  TEXT,
  mulai_tanggal  TEXT,
  sampai_tanggal TEXT,
  horizon_minggu INTEGER NOT NULL DEFAULT 8,
  aktif          INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_kelas_jadwal_kelas ON kelas_jadwal(kelas_id);

-- Link generated sesi back to their schedule (NULL = manually created).
ALTER TABLE sesi ADD COLUMN jadwal_id TEXT;
CREATE INDEX idx_sesi_jadwal ON sesi(jadwal_id);
CREATE INDEX idx_sesi_kelas_tanggal ON sesi(kelas_id, tanggal);
```

- [ ] **Step 3: Write `045_kelas_jadwal.down.sql`** (reverse order; `DROP COLUMN` matches `014_kelas.down.sql` precedent)

```sql
DROP INDEX IF EXISTS idx_sesi_kelas_tanggal;
DROP INDEX IF EXISTS idx_sesi_jadwal;
ALTER TABLE sesi DROP COLUMN jadwal_id;
DROP INDEX IF EXISTS idx_kelas_jadwal_kelas;
DROP TABLE IF EXISTS kelas_jadwal;
```

- [ ] **Step 4: Verify migrations parse/run** (the embed picks them up automatically via `//go:embed migrations/*.sql`)

Run: `make test 2>&1 | tail -20` (the store test harness runs `Migrate` on a fresh DB; a broken SQL/down file fails here).
Expected: build + existing tests still pass (no migration error).

- [ ] **Step 5: Commit**

```bash
git add internal/store/migrations/045_kelas_jadwal.up.sql internal/store/migrations/045_kelas_jadwal.down.sql
git commit -m "feat(kelas): add 045 kelas_jadwal migration + sesi.jadwal_id"
```

---

## Task 2: Plumb `JadwalID` through the Sesi store

**Files:**
- Modify: `internal/store/sesi.go` (Sesi struct ~13-37, SesiInput ~50-65, `sesiCols` ~88-91, `Create` ~408-448, `scanSesi` ~605-619)
- Test: `internal/store/sesi_jadwal_test.go` (Create)

- [ ] **Step 1: Read the test-DB helper** — open `internal/store/students_test.go` (or any `internal/store/*_test.go`) and note the helper that opens a migrated SQLite DB + constructs stores (e.g. `openTestDB(t)` / `newTestStore(t)`). Reuse that exact helper name in all store tests below.

- [ ] **Step 2: Write the failing test** `internal/store/sesi_jadwal_test.go`

```go
package store

import (
	"context"
	"testing"
)

func TestSesiCreateWithJadwalID(t *testing.T) {
	db := openTestDB(t) // <-- match the helper name in students_test.go
	ss := NewSesi(db)
	jid := "JADWAL01"
	created, err := ss.Create(context.Background(), SesiInput{
		Tanggal:  "2026-06-15",
		Topik:    "Rutin",
		JadwalID: &jid,
	}, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.JadwalID == nil || *created.JadwalID != jid {
		t.Fatalf("JadwalID round-trip failed: got %v", created.JadwalID)
	}
}
```

- [ ] **Step 3: Run it — expect FAIL** (compile error: `SesiInput has no field JadwalID`)

Run: `make test 2>&1 | grep -A3 JadwalID | head` — Expected: compile failure.

- [ ] **Step 4: Add `JadwalID` to the Sesi struct** (after `UpdatedAt`, line ~37):

```go
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
	JadwalID      *string  `json:"jadwalId,omitempty"`
```

- [ ] **Step 5: Add `JadwalID` to `SesiInput`** (after `LibraryItems`, line ~64):

```go
	LibraryItems  []SesiLibraryItem
	JadwalID      *string
```

- [ ] **Step 6: Append `jadwal_id` to `sesiCols`** (line ~88-91 — keep it last so scan order matches):

```go
const sesiCols = `id, tanggal, mulai, selesai, topik, catatan, tingkat,
	materi_ajar_id, guru_id, kelas_id, library_kind, library_aspect, library_ref,
	started_at, ended_at, live_materi_id, live_display_mode,
	created_by, created_at, updated_at, jadwal_id`
```

- [ ] **Step 7: Update `Create`'s INSERT** (add `jadwal_id` column + a bound param at the end). Replace the INSERT statement and arg list in `SesiStore.Create`:

```go
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO sesi (id, tanggal, mulai, selesai, topik, catatan, tingkat,
		   materi_ajar_id, guru_id, kelas_id, library_kind, library_aspect, library_ref,
		   started_at, ended_at, live_materi_id, live_display_mode,
		   created_by, created_at, updated_at, jadwal_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
		id, in.Tanggal, in.Mulai, in.Selesai, in.Topik, in.Catatan, in.Tingkat,
		primary, in.GuruID, in.KelasID,
		in.LibraryKind, in.LibraryAspect, in.LibraryRef,
		createdByPtr, now, now, in.JadwalID,
	); err != nil {
		return nil, err
	}
```

- [ ] **Step 8: Append `&v.JadwalID` to `scanSesi`** (after `&v.UpdatedAt`, line ~617):

```go
		&v.CreatedBy,
		&v.CreatedAt, &v.UpdatedAt, &v.JadwalID,
```

- [ ] **Step 9: Run the test — expect PASS**

Run: `make test 2>&1 | tail -5` — Expected: `TestSesiCreateWithJadwalID` passes, no other test breaks (scanSesi/sesiCols stay aligned).

- [ ] **Step 10: Commit**

```bash
git add internal/store/sesi.go internal/store/sesi_jadwal_test.go
git commit -m "feat(sesi): carry jadwal_id through store Create/scan"
```

---

## Task 3: KelasJadwal types + CRUD + SesiStore wiring

**Files:**
- Create: `internal/store/jadwal.go`
- Modify: `internal/store/kelas.go` (add `sesi *SesiStore` field to `KelasStore` struct + `AttachSesi`)
- Test: `internal/store/jadwal_test.go`

- [ ] **Step 1: Add the `sesi` field + `AttachSesi` to `KelasStore`** — in `internal/store/kelas.go`, find `type KelasStore struct { ... }` and add a `sesi *SesiStore` field; then add:

```go
// AttachSesi wires the sesi store so jadwal generation can materialize sesi
// rows. Best-effort — nil-safe (generation no-ops when unset).
func (s *KelasStore) AttachSesi(se *SesiStore) { s.sesi = se }
```

- [ ] **Step 2: Write the failing test** `internal/store/jadwal_test.go`

```go
package store

import (
	"context"
	"testing"
)

func mkKelas(t *testing.T, ks *KelasStore, guru *string) string {
	t.Helper()
	k, err := ks.Create(context.Background(), KelasInput{Nama: "3A " + t.Name(), Tingkat: "PAUD", GuruUserID: guru, Tahun: 2026})
	if err != nil {
		t.Fatalf("create kelas: %v", err)
	}
	return k.ID
}

func TestJadwalUpsertGetDelete(t *testing.T) {
	db := openTestDB(t)
	ks := NewKelas(db) // <-- match the real KelasStore constructor name/signature
	id := mkKelas(t, ks, nil)

	got, err := ks.GetJadwal(context.Background(), id)
	if err != nil || got != nil {
		t.Fatalf("expected nil jadwal, got %v err %v", got, err)
	}

	sel := "17:00"
	j, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", Selesai: &sel, HorizonMinggu: 8, Aktif: true,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if len(j.Hari) != 2 || j.Hari[0] != 1 || j.Hari[1] != 3 || j.Mulai != "16:00" || !j.Aktif {
		t.Fatalf("bad jadwal: %+v", j)
	}

	// Upsert again updates the same row (UNIQUE kelas_id).
	j2, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{Hari: []int{5}, Mulai: "08:00", HorizonMinggu: 4, Aktif: true})
	if err != nil || j2.ID != j.ID || len(j2.Hari) != 1 || j2.Hari[0] != 5 {
		t.Fatalf("upsert update failed: %+v err %v", j2, err)
	}

	if err := ks.DeleteJadwal(context.Background(), id); err != nil {
		t.Fatalf("delete: %v", err)
	}
	got, _ = ks.GetJadwal(context.Background(), id)
	if got != nil {
		t.Fatalf("expected nil after delete, got %+v", got)
	}
}
```

- [ ] **Step 3: Run it — expect FAIL** (undefined `KelasJadwalInput`, `GetJadwal`, etc.)

Run: `make test 2>&1 | tail -10`

- [ ] **Step 4: Create `internal/store/jadwal.go`** with types, hari codec, and CRUD:

```go
package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// KelasJadwal is a kelas's recurring weekly schedule (one per kelas). The
// selected weekdays (`Hari`, 0=Minggu..6=Sabtu) share one mulai/selesai time.
// It auto-generates sesi rows lazily via GenerateJadwal.
type KelasJadwal struct {
	ID            string  `json:"id"`
	KelasID       string  `json:"kelasId"`
	Hari          []int   `json:"hari"`
	Mulai         string  `json:"mulai"`
	Selesai       *string `json:"selesai,omitempty"`
	TopikDefault  *string `json:"topikDefault,omitempty"`
	MulaiTanggal  *string `json:"mulaiTanggal,omitempty"`
	SampaiTanggal *string `json:"sampaiTanggal,omitempty"`
	HorizonMinggu int     `json:"horizonMinggu"`
	Aktif         bool    `json:"aktif"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type KelasJadwalInput struct {
	Hari          []int
	Mulai         string
	Selesai       *string
	TopikDefault  *string
	MulaiTanggal  *string
	SampaiTanggal *string
	HorizonMinggu int
	Aktif         bool
}

// encodeHari renders a weekday set as a sorted, de-duplicated CSV "1,3".
func encodeHari(days []int) string {
	seen := map[int]bool{}
	var keep []int
	for _, d := range days {
		if d >= 0 && d <= 6 && !seen[d] {
			seen[d] = true
			keep = append(keep, d)
		}
	}
	// stable order
	for i := 0; i < len(keep); i++ {
		for j := i + 1; j < len(keep); j++ {
			if keep[j] < keep[i] {
				keep[i], keep[j] = keep[j], keep[i]
			}
		}
	}
	parts := make([]string, len(keep))
	for i, d := range keep {
		parts[i] = strconv.Itoa(d)
	}
	return strings.Join(parts, ",")
}

func decodeHari(s string) []int {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []int
	for _, p := range strings.Split(s, ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && n >= 0 && n <= 6 {
			out = append(out, n)
		}
	}
	return out
}

func (s *KelasStore) GetJadwal(ctx context.Context, kelasID string) (*KelasJadwal, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, kelas_id, hari, mulai, selesai, topik_default,
		        mulai_tanggal, sampai_tanggal, horizon_minggu, aktif,
		        created_at, updated_at
		   FROM kelas_jadwal WHERE kelas_id = ?`, kelasID)
	var j KelasJadwal
	var hari string
	var aktif int
	if err := row.Scan(&j.ID, &j.KelasID, &hari, &j.Mulai, &j.Selesai, &j.TopikDefault,
		&j.MulaiTanggal, &j.SampaiTanggal, &j.HorizonMinggu, &aktif,
		&j.CreatedAt, &j.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // no schedule configured
		}
		return nil, err
	}
	j.Hari = decodeHari(hari)
	j.Aktif = aktif != 0
	return &j, nil
}

func (s *KelasStore) UpsertJadwal(ctx context.Context, kelasID string, in KelasJadwalInput) (*KelasJadwal, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	hari := encodeHari(in.Hari)
	aktif := 0
	if in.Aktif {
		aktif = 1
	}
	horizon := in.HorizonMinggu
	if horizon <= 0 {
		horizon = 8
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var existing string
	_ = tx.QueryRowContext(ctx, `SELECT id FROM kelas_jadwal WHERE kelas_id = ?`, kelasID).Scan(&existing)
	if existing == "" {
		id := ulid.Make().String()
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO kelas_jadwal (id, kelas_id, hari, mulai, selesai, topik_default,
			   mulai_tanggal, sampai_tanggal, horizon_minggu, aktif, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, kelasID, hari, in.Mulai, in.Selesai, in.TopikDefault,
			in.MulaiTanggal, in.SampaiTanggal, horizon, aktif, now, now); err != nil {
			return nil, err
		}
	} else {
		if _, err := tx.ExecContext(ctx,
			`UPDATE kelas_jadwal SET hari = ?, mulai = ?, selesai = ?, topik_default = ?,
			   mulai_tanggal = ?, sampai_tanggal = ?, horizon_minggu = ?, aktif = ?, updated_at = ?
			 WHERE kelas_id = ?`,
			hari, in.Mulai, in.Selesai, in.TopikDefault,
			in.MulaiTanggal, in.SampaiTanggal, horizon, aktif, now, kelasID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	// Post-commit: keep generated sesi in sync with the (possibly changed) rule.
	s.regenerate(ctx, kelasID)
	return s.GetJadwal(ctx, kelasID)
}

func (s *KelasStore) DeleteJadwal(ctx context.Context, kelasID string) error {
	today := time.Now().UTC().Format("2006-01-02")
	_ = s.deleteFutureGenerated(ctx, kelasID, today)
	_, err := s.db.ExecContext(ctx, `DELETE FROM kelas_jadwal WHERE kelas_id = ?`, kelasID)
	return err
}
```

> NOTE: `ExpandJadwal`, `GenerateJadwal`, `regenerate`, and `deleteFutureGenerated` are added in Tasks 4–5; until then `UpsertJadwal`/`DeleteJadwal` reference undefined funcs. To keep the build green between commits, add temporary no-op stubs in this commit:
>
> ```go
> func (s *KelasStore) regenerate(ctx context.Context, kelasID string)                    {}
> func (s *KelasStore) deleteFutureGenerated(ctx context.Context, kelasID, today string) error { return nil }
> ```
> These are replaced with real bodies in Task 5.

- [ ] **Step 5: Run the test — expect PASS**

Run: `make test 2>&1 | tail -5` — Expected: `TestJadwalUpsertGetDelete` passes.

- [ ] **Step 6: Commit**

```bash
git add internal/store/jadwal.go internal/store/kelas.go internal/store/jadwal_test.go
git commit -m "feat(kelas): kelas_jadwal store types + CRUD + AttachSesi"
```

---

## Task 4: `ExpandJadwal` + date helpers

**Files:**
- Modify: `internal/store/jadwal.go`
- Test: `internal/store/jadwal_test.go`

- [ ] **Step 1: Write the failing test** (append to `jadwal_test.go`)

```go
func TestExpandJadwalWeekdays(t *testing.T) {
	db := openTestDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", HorizonMinggu: 8, Aktif: true, // Mon & Wed
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// 2026-06-15 is a Monday. Range covers Mon 15, Wed 17, Mon 22, Wed 24.
	cands, err := ks.ExpandJadwal(context.Background(), id, "2026-06-15", "2026-06-24")
	if err != nil {
		t.Fatalf("expand: %v", err)
	}
	want := []string{"2026-06-15", "2026-06-17", "2026-06-22", "2026-06-24"}
	if len(cands) != len(want) {
		t.Fatalf("got %d candidates, want %d: %+v", len(cands), len(want), cands)
	}
	for i, c := range cands {
		if c.Tanggal != want[i] {
			t.Fatalf("candidate %d = %s, want %s", i, c.Tanggal, want[i])
		}
		if c.Mulai == nil || *c.Mulai != "16:00" || c.JadwalID == nil || c.KelasID == nil || *c.KelasID != id {
			t.Fatalf("candidate %d missing fields: %+v", i, c)
		}
	}
}

func TestExpandJadwalRespectsBounds(t *testing.T) {
	db := openTestDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	start := "2026-06-17"
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", MulaiTanggal: &start, HorizonMinggu: 8, Aktif: true,
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	cands, _ := ks.ExpandJadwal(context.Background(), id, "2026-06-15", "2026-06-24")
	// Mon 15 is before mulai_tanggal 17 → excluded. First is Wed 17.
	if len(cands) == 0 || cands[0].Tanggal != "2026-06-17" {
		t.Fatalf("bounds not applied: %+v", cands)
	}
}
```

- [ ] **Step 2: Run — expect FAIL** (`ExpandJadwal` undefined). Run: `make test 2>&1 | tail -8`

- [ ] **Step 3: Add date helpers + `ExpandJadwal`** to `internal/store/jadwal.go`:

```go
func parseDate(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func addDays(s string, n int) string {
	t, ok := parseDate(s)
	if !ok {
		return s
	}
	return t.AddDate(0, 0, n).Format("2006-01-02")
}

// weekdayOf returns Go's Weekday int (Sunday=0..Saturday=6) for a YYYY-MM-DD.
func weekdayOf(s string) (int, bool) {
	t, ok := parseDate(s)
	if !ok {
		return 0, false
	}
	return int(t.Weekday()), true
}

func derefOr(p *string, def string) string {
	if p != nil && *p != "" {
		return *p
	}
	return def
}

// ExpandJadwal returns the SesiInput stubs the schedule implies within
// [from, to] (inclusive, YYYY-MM-DD), clamped to the rule's start/end dates.
// Returns nil when there is no active schedule.
func (s *KelasStore) ExpandJadwal(ctx context.Context, kelasID, from, to string) ([]SesiInput, error) {
	j, err := s.GetJadwal(ctx, kelasID)
	if err != nil || j == nil || !j.Aktif || len(j.Hari) == 0 {
		return nil, err
	}
	k, err := s.Get(ctx, kelasID)
	if err != nil {
		return nil, err
	}
	effFrom := from
	if j.MulaiTanggal != nil && *j.MulaiTanggal > effFrom {
		effFrom = *j.MulaiTanggal
	}
	effTo := to
	if j.SampaiTanggal != nil && *j.SampaiTanggal != "" && *j.SampaiTanggal < effTo {
		effTo = *j.SampaiTanggal
	}
	dayset := map[int]bool{}
	for _, d := range j.Hari {
		dayset[d] = true
	}
	topik := derefOr(j.TopikDefault, k.Nama)
	tingkat := k.Tingkat
	mulai := j.Mulai
	var out []SesiInput
	for d := effFrom; d <= effTo; d = addDays(d, 1) {
		wd, ok := weekdayOf(d)
		if !ok || !dayset[wd] {
			continue
		}
		date := d
		jid := j.ID
		out = append(out, SesiInput{
			Tanggal:  date,
			Mulai:    &mulai,
			Selesai:  j.Selesai,
			Topik:    topik,
			Tingkat:  &tingkat,
			GuruID:   k.GuruUserID,
			KelasID:  &kelasID,
			JadwalID: &jid,
		})
	}
	return out, nil
}
```

> `k.GuruUserID` is the kelas wali (already `*string`). `&mulai`/`&tingkat`/`&kelasID` capture loop-stable locals.

- [ ] **Step 4: Run — expect PASS.** Run: `make test 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add internal/store/jadwal.go internal/store/jadwal_test.go
git commit -m "feat(kelas): ExpandJadwal weekday expansion with date bounds"
```

---

## Task 5: `GenerateJadwal` (idempotent) + regen helpers

**Files:**
- Modify: `internal/store/jadwal.go` (replace the Task-3 stubs `regenerate`/`deleteFutureGenerated`; add `GenerateJadwal`, `sesiExistsOnDate`)
- Test: `internal/store/jadwal_test.go`

- [ ] **Step 1: Write the failing tests** (append to `jadwal_test.go`)

```go
func countSesi(t *testing.T, db *sql.DB, kelasID string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sesi WHERE kelas_id = ?`, kelasID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

func TestGenerateJadwalIdempotent(t *testing.T) {
	db := openTestDB(t)
	ks := NewKelas(db)
	ss := NewSesi(db)
	ks.AttachSesi(ss)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", HorizonMinggu: 4, Aktif: true,
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// UpsertJadwal already regenerates once; capture the count.
	first := countSesi(t, db, id)
	if first == 0 {
		t.Fatalf("expected generated sesi, got 0")
	}
	// Explicit generate again → no new rows.
	created, err := ks.GenerateJadwal(context.Background(), id)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if created != 0 || countSesi(t, db, id) != first {
		t.Fatalf("not idempotent: created=%d count=%d first=%d", created, countSesi(t, db, id), first)
	}
}

func TestRegenerateOnDisablePreservesHistory(t *testing.T) {
	db := openTestDB(t)
	ks := NewKelas(db)
	ss := NewSesi(db)
	ks.AttachSesi(ss)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{0, 1, 2, 3, 4, 5, 6}, Mulai: "16:00", HorizonMinggu: 4, Aktif: true,
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	before := countSesi(t, db, id)
	if before == 0 {
		t.Fatalf("expected generated rows")
	}
	// Mark the earliest generated sesi as started (history that must survive).
	if _, err := db.Exec(
		`UPDATE sesi SET started_at = '2020-01-01T00:00:00.000Z'
		   WHERE kelas_id = ? AND jadwal_id IS NOT NULL
		   ORDER BY tanggal ASC LIMIT 1`, id); err != nil {
		t.Fatalf("mark started: %v", err)
	}
	// Add a manual sesi (jadwal_id NULL) that must never be touched.
	if _, err := ss.Create(context.Background(), SesiInput{Tanggal: "2026-12-31", Topik: "Manual", KelasID: &id}, ""); err != nil {
		t.Fatalf("manual: %v", err)
	}
	// Disable the schedule → future un-started generated removed.
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1}, Mulai: "16:00", HorizonMinggu: 4, Aktif: false,
	}); err != nil {
		t.Fatalf("disable: %v", err)
	}
	var started, manual int
	db.QueryRow(`SELECT COUNT(*) FROM sesi WHERE kelas_id=? AND started_at IS NOT NULL`, id).Scan(&started)
	db.QueryRow(`SELECT COUNT(*) FROM sesi WHERE kelas_id=? AND jadwal_id IS NULL`, id).Scan(&manual)
	if started != 1 {
		t.Fatalf("started/history sesi lost: %d", started)
	}
	if manual != 1 {
		t.Fatalf("manual sesi lost: %d", manual)
	}
}
```

- [ ] **Step 2: Run — expect FAIL** (`GenerateJadwal` undefined; stubs make tests fail assertions). Run: `make test 2>&1 | tail -10`

- [ ] **Step 3: Replace the Task-3 stubs and add the real generation logic** in `internal/store/jadwal.go`:

```go
func (s *KelasStore) sesiExistsOnDate(ctx context.Context, kelasID, tanggal string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM sesi WHERE kelas_id = ? AND tanggal = ?`, kelasID, tanggal).Scan(&n)
	return n > 0, err
}

// deleteFutureGenerated removes schedule-generated, not-yet-started sesi from
// `today` onward so a rule change/disable/delete can cleanly regenerate
// without touching history or manually-created sessions.
func (s *KelasStore) deleteFutureGenerated(ctx context.Context, kelasID, today string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM sesi
		   WHERE kelas_id = ? AND jadwal_id IS NOT NULL AND started_at IS NULL AND tanggal >= ?`,
		kelasID, today)
	return err
}

// GenerateJadwal materializes missing sesi from the kelas's active schedule
// up to its horizon, starting today. Idempotent: a date that already has any
// sesi for the kelas is skipped (manual or previously generated).
func (s *KelasStore) GenerateJadwal(ctx context.Context, kelasID string) (int, error) {
	if s.sesi == nil {
		return 0, nil
	}
	j, err := s.GetJadwal(ctx, kelasID)
	if err != nil || j == nil || !j.Aktif {
		return 0, err
	}
	today := time.Now().UTC().Format("2006-01-02")
	to := addDays(today, j.HorizonMinggu*7)
	cands, err := s.ExpandJadwal(ctx, kelasID, today, to)
	if err != nil {
		return 0, err
	}
	created := 0
	for _, c := range cands {
		exists, err := s.sesiExistsOnDate(ctx, kelasID, c.Tanggal)
		if err != nil {
			return created, err
		}
		if exists {
			continue
		}
		if _, err := s.sesi.Create(ctx, c, ""); err != nil {
			return created, err
		}
		created++
	}
	return created, nil
}

// regenerate refreshes the rolling window after a rule change: drop future
// un-started generated rows, then (re)generate if the schedule is active.
func (s *KelasStore) regenerate(ctx context.Context, kelasID string) {
	if s.sesi == nil {
		return
	}
	today := time.Now().UTC().Format("2006-01-02")
	_ = s.deleteFutureGenerated(ctx, kelasID, today)
	_, _ = s.GenerateJadwal(ctx, kelasID) // no-ops when schedule is inactive/absent
}
```

> Delete the two temporary stub funcs added in Task 3 Step 4 (they are now real).

- [ ] **Step 4: Run — expect PASS** (all jadwal tests green). Run: `make test 2>&1 | tail -6`

- [ ] **Step 5: Commit**

```bash
git add internal/store/jadwal.go internal/store/jadwal_test.go
git commit -m "feat(kelas): idempotent GenerateJadwal + regen on rule change"
```

---

## Task 6: Clean up `kelas_jadwal` on kelas delete

**Files:**
- Modify: `internal/store/kelas.go` (`KelasStore.Delete`, ~253-263)

- [ ] **Step 1: Add a failing assertion** to `jadwal_test.go`:

```go
func TestDeleteKelasRemovesJadwal(t *testing.T) {
	db := openTestDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{Hari: []int{1}, Mulai: "16:00", HorizonMinggu: 4, Aktif: true}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := ks.Delete(context.Background(), id); err != nil {
		t.Fatalf("delete kelas: %v", err)
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM kelas_jadwal WHERE kelas_id = ?`, id).Scan(&n)
	if n != 0 {
		t.Fatalf("kelas_jadwal not cleaned up: %d rows", n)
	}
}
```

- [ ] **Step 2: Run — expect FAIL** (orphan row remains). Run: `make test 2>&1 | grep -A2 RemovesJadwal | head`

- [ ] **Step 3: Add cleanup to `KelasStore.Delete`** — after the successful `DELETE FROM kelas` (before `return nil`), add:

```go
	_, _ = s.db.ExecContext(ctx, `DELETE FROM kelas_jadwal WHERE kelas_id = ?`, id)
	return nil
```

> (Generated `sesi` rows are intentionally left, mirroring the existing behavior of leaving a kelas's sesi when the kelas is deleted.)

- [ ] **Step 4: Run — expect PASS.** Run: `make test 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add internal/store/kelas.go internal/store/jadwal_test.go
git commit -m "feat(kelas): drop kelas_jadwal when its kelas is deleted"
```

---

## Task 7: HTTP handlers (admin-or-wali) + routes + main wiring

**Files:**
- Modify: `internal/handler/kelas.go` (add `jadwalBody`, `canManageJadwal`, 4 handlers, 2 imports)
- Modify: `cmd/server/main.go` (register 4 routes in the authenticated `p` group; `kelas.AttachSesi(sesi)` at store-construction)

- [ ] **Step 1: Add imports to `internal/handler/kelas.go`** (extend the import block, lines 3-15):

```go
	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
```

- [ ] **Step 2: Add the request body + auth helper** (after the existing `kelasBody`/`parse`, ~line 51):

```go
type jadwalBody struct {
	Hari          []int   `json:"hari"          validate:"required,min=1,max=7,dive,gte=0,lte=6"`
	Mulai         string  `json:"mulai"         validate:"required,len=5"`
	Selesai       *string `json:"selesai,omitempty"       validate:"omitempty,len=5"`
	TopikDefault  *string `json:"topikDefault,omitempty"`
	MulaiTanggal  *string `json:"mulaiTanggal,omitempty"  validate:"omitempty,len=10"`
	SampaiTanggal *string `json:"sampaiTanggal,omitempty" validate:"omitempty,len=10"`
	HorizonMinggu int     `json:"horizonMinggu" validate:"omitempty,gte=1,lte=52"`
	Aktif         bool    `json:"aktif"`
}

// canManageJadwal loads the kelas and authorizes the caller as admin OR the
// kelas wali (primary guru). On failure it writes the response and returns nil.
func (h *Kelas) canManageJadwal(w http.ResponseWriter, r *http.Request, id string) *store.Kelas {
	k, err := h.k.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kelas tidak ditemukan")
		} else {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil kelas")
		}
		return nil
	}
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return nil
	}
	isWali := k.GuruUserID != nil && *k.GuruUserID == claims.UserID
	if claims.Role != model.RoleAdmin && !isWali {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		return nil
	}
	return k
}
```

- [ ] **Step 3: Add the four handlers** (after the helper):

```go
func (h *Kelas) GetJadwal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	j, err := h.k.GetJadwal(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil jadwal")
		return
	}
	httpx.JSON(w, http.StatusOK, j) // nil → JSON null (no schedule yet)
}

func (h *Kelas) PutJadwal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if h.canManageJadwal(w, r, id) == nil {
		return
	}
	var b jadwalBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", errBadJSON.Error())
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in := store.KelasJadwalInput{
		Hari:          b.Hari,
		Mulai:         b.Mulai,
		Selesai:       trimPtr(b.Selesai),
		TopikDefault:  trimPtr(b.TopikDefault),
		MulaiTanggal:  trimPtr(b.MulaiTanggal),
		SampaiTanggal: trimPtr(b.SampaiTanggal),
		HorizonMinggu: b.HorizonMinggu,
		Aktif:         b.Aktif,
	}
	j, err := h.k.UpsertJadwal(r.Context(), id, in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan jadwal")
		return
	}
	httpx.JSON(w, http.StatusOK, j)
}

func (h *Kelas) DeleteJadwal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if h.canManageJadwal(w, r, id) == nil {
		return
	}
	if err := h.k.DeleteJadwal(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus jadwal")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Kelas) GenerateJadwal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if h.canManageJadwal(w, r, id) == nil {
		return
	}
	created, err := h.k.GenerateJadwal(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat sesi rutin")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"created": created})
}
```

- [ ] **Step 4: Register routes** in `cmd/server/main.go` — in the authenticated `p` group, right after the existing kelas GET routes (~line 304: `p.Get("/kelas/{id}/guru", kelasH.ListGuruAnggota)`), add:

```go
			p.Get("/kelas/{id}/jadwal", kelasH.GetJadwal)
			p.Put("/kelas/{id}/jadwal", kelasH.PutJadwal)
			p.Delete("/kelas/{id}/jadwal", kelasH.DeleteJadwal)
			p.Post("/kelas/{id}/jadwal/generate", kelasH.GenerateJadwal)
```

> These live in `p` (any authenticated user), NOT the `adm` group, because authorization is admin-OR-wali and is enforced inside `canManageJadwal`. `GetJadwal` is intentionally open to any authenticated user (read-only), matching the other kelas GETs.

- [ ] **Step 5: Wire `AttachSesi`** in `cmd/server/main.go` — find where the `kelas` and `sesi` stores are constructed (near the existing `sesi.AttachRencana(...)` call) and add:

```go
	kelas.AttachSesi(sesi)
```

- [ ] **Step 6: Build + full backend test**

Run: `make test 2>&1 | tail -10` then `CGO_ENABLED=1 go build ./... 2>&1 | tail` (or `make build`).
Expected: all green, binary builds.

- [ ] **Step 7: Commit**

```bash
git add internal/handler/kelas.go cmd/server/main.go
git commit -m "feat(kelas): jadwal HTTP endpoints (admin-or-wali) + route wiring"
```

---

## Task 8: Frontend API client (`kelas.ts` + `sesi.ts`)

**Files:**
- Modify: `web/app/src/api/kelas.ts` (append types + 4 clients)
- Modify: `web/app/src/api/sesi.ts` (add `jadwalId` to `Sesi`)

- [ ] **Step 1: Append to `web/app/src/api/kelas.ts`:**

```ts
export type KelasJadwal = {
  id: string
  kelasId: string
  /** Weekday ints, 0=Minggu..6=Sabtu. */
  hari: number[]
  mulai: string
  selesai?: string | null
  topikDefault?: string | null
  mulaiTanggal?: string | null
  sampaiTanggal?: string | null
  horizonMinggu: number
  aktif: boolean
  createdAt: string
  updatedAt: string
}

export type KelasJadwalInput = {
  hari: number[]
  mulai: string
  selesai?: string | null
  topikDefault?: string | null
  mulaiTanggal?: string | null
  sampaiTanggal?: string | null
  horizonMinggu: number
  aktif: boolean
}

export function getJadwal(kelasId: string) {
  return apiFetch<KelasJadwal | null>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal`)
}

export function putJadwal(kelasId: string, input: KelasJadwalInput) {
  return apiFetch<KelasJadwal>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal`, { method: 'PUT', body: input })
}

export function deleteJadwal(kelasId: string) {
  return apiFetch<void>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal`, { method: 'DELETE' })
}

export function generateJadwal(kelasId: string) {
  return apiFetch<{ created: number }>(`/api/kelas/${encodeURIComponent(kelasId)}/jadwal/generate`, { method: 'POST' })
}
```

- [ ] **Step 2: Add `jadwalId` to the `Sesi` type** in `web/app/src/api/sesi.ts` (after `createdBy`, ~line 31):

```ts
  createdBy?: string | null
  jadwalId?: string | null
  createdAt: string
```

- [ ] **Step 3: Type-check**

Run: `make typecheck 2>&1 | tail -15`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/api/kelas.ts web/app/src/api/sesi.ts
git commit -m "feat(web): kelas jadwal API client + sesi.jadwalId type"
```

---

## Task 9: `KelasJadwalDialog` component

**Files:**
- Create: `web/app/src/components/KelasJadwalDialog.tsx`

- [ ] **Step 1: Create the component** (modeled on `KelasAnggotaDialog`; single section, reuses `TimeRangePicker`):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Trash2 } from 'lucide-react'

import { deleteJadwal, getJadwal, putJadwal, type KelasJadwalInput } from '@/api/kelas'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { TimeRangePicker } from '@/components/TimeRangePicker'
import { DEFAULT_TIMEZONE } from '@/lib/timezones'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasJadwalDialog — configure a kelas's recurring weekly schedule. Pick
 * weekdays + one shared time; the backend lazily generates sesi rows on open.
 * Manageable by admin or the kelas wali (gated by the caller).
 */
export function KelasJadwalDialog({
  kelasId,
  kelasNama,
  onClose,
}: {
  kelasId: string
  kelasNama: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  // Sunday-first short weekday labels, locale-aware (matches calendar HARI).
  const HARI = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2000, 0, 2 + i)))
  }, [i18n.language])

  const [hari, setHari] = useState<number[]>([])
  const [mulai, setMulai] = useState('')
  const [selesai, setSelesai] = useState('')
  const [topik, setTopik] = useState('')
  const [mulaiTanggal, setMulaiTanggal] = useState('')
  const [sampaiTanggal, setSampaiTanggal] = useState('')
  const [horizon, setHorizon] = useState(8)
  const [aktif, setAktif] = useState(true)

  const { data: jadwal, isPending } = useQuery({
    queryKey: ['kelas-jadwal', kelasId],
    queryFn: () => getJadwal(kelasId),
  })

  useEffect(() => {
    if (!jadwal) return
    setHari(jadwal.hari ?? [])
    setMulai(jadwal.mulai ?? '')
    setSelesai(jadwal.selesai ?? '')
    setTopik(jadwal.topikDefault ?? '')
    setMulaiTanggal(jadwal.mulaiTanggal ?? '')
    setSampaiTanggal(jadwal.sampaiTanggal ?? '')
    setHorizon(jadwal.horizonMinggu ?? 8)
    setAktif(jadwal.aktif ?? true)
  }, [jadwal])

  const toggleHari = (d: number) =>
    setHari((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kelas-jadwal', kelasId] })
    qc.invalidateQueries({ queryKey: ['kelas-sesi', kelasId] })
    qc.invalidateQueries({ queryKey: ['sesi'] })
  }

  const saveMut = useMutation({
    mutationFn: (input: KelasJadwalInput) => putJadwal(kelasId, input),
    onSuccess: () => {
      toast(t('kelasSection.jadwal.saved'), 'success')
      invalidate()
      onClose()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.jadwal.saveFailed'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteJadwal(kelasId),
    onSuccess: () => {
      toast(t('kelasSection.jadwal.deleted'), 'success')
      invalidate()
      onClose()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.jadwal.deleteFailed'), 'error'),
  })

  const canSave = hari.length > 0 && /^\d{2}:\d{2}$/.test(mulai)

  const submit = () =>
    saveMut.mutate({
      hari,
      mulai,
      selesai: selesai || null,
      topikDefault: topik.trim() || null,
      mulaiTanggal: mulaiTanggal || null,
      sampaiTanggal: sampaiTanggal || null,
      horizonMinggu: horizon,
      aktif,
    })

  return (
    <Dialog title={t('kelasSection.jadwal.title', { name: kelasNama })} onClose={onClose} size="md">
      {isPending ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.hari')}</label>
            <div className="flex flex-wrap gap-1">
              {HARI.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleHari(d)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition',
                    hari.includes(d)
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.jam')}</label>
            <TimeRangePicker
              start={mulai}
              end={selesai}
              timezone={DEFAULT_TIMEZONE}
              onStartChange={setMulai}
              onEndChange={setSelesai}
              onTimezoneChange={() => {}}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.topik')}</label>
            <Input value={topik} onChange={(e) => setTopik(e.target.value)} placeholder={t('kelasSection.jadwal.topikPh')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.mulaiTanggal')}</label>
              <Input type="date" value={mulaiTanggal} onChange={(e) => setMulaiTanggal(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.sampaiTanggal')}</label>
              <Input type="date" value={sampaiTanggal} onChange={(e) => setSampaiTanggal(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.horizon')}</label>
            <Input
              type="number"
              min={1}
              max={52}
              value={String(horizon)}
              onChange={(e) => setHorizon(Math.max(1, Math.min(52, Number(e.target.value) || 8)))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} className="h-4 w-4" />
            {t('kelasSection.jadwal.aktif')}
          </label>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            {jadwal ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ message: t('kelasSection.jadwal.confirmDelete', { name: kelasNama }), danger: true })) {
                    deleteMut.mutate()
                  }
                }}
                disabled={deleteMut.isPending}
              >
                <Trash2 size={16} className="mr-1" />
                {t('kelasSection.jadwal.delete')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('common.close')}
              </Button>
              <Button onClick={submit} disabled={!canSave || saveMut.isPending}>
                <CalendarClock size={16} className="mr-1" />
                {saveMut.isPending ? t('kelasSection.jadwal.saving') : t('kelasSection.jadwal.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify `Input` forwards native props** — open `web/app/src/components/Input.tsx`. If it does NOT spread `...props` onto the `<input>` (so `type`/`min`/`max` are dropped), replace the date/number `Input` usages above with a styled native `<input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" ...>`. Otherwise leave as-is.

- [ ] **Step 3: Type-check.** Run: `make typecheck 2>&1 | tail -15` — Expected: no errors (component is referenced next task, but it compiles standalone).

- [ ] **Step 4: Commit**

```bash
git add web/app/src/components/KelasJadwalDialog.tsx
git commit -m "feat(web): KelasJadwalDialog (day toggles + shared time)"
```

---

## Task 10: Wire the jadwal button + dialog into `KelasListSection`

**Files:**
- Modify: `web/app/src/pages/sections/KelasListSection.tsx`

> Four edits (the component threads dialog state from the parent down to cards). The new button is gated to **admin OR wali** (`k.guruUserId === user?.id`).

- [ ] **Step 1: Imports** — line 7 add `CalendarClock` to the lucide import; add the dialog import near the other component imports:

```ts
import { CalendarClock, Pencil, Plus, Trash2, Users } from 'lucide-react'
```
```ts
import { KelasJadwalDialog } from '@/components/KelasJadwalDialog'
```

- [ ] **Step 2: Extend the dialog-state union** (lines ~57-62):

```ts
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; kelas: Kelas }
    | { kind: 'anggota'; kelas: Kelas }
    | { kind: 'jadwal'; kelas: Kelas }
    | null
  >(null)
```

- [ ] **Step 3: Thread `onJadwal` + a per-card `canManage` flag down.** In `KelasField`'s props type add `onJadwal: (k: Kelas) => void` and `currentUserId?: string`; thread both into each `KelasCard`. In `KelasCard`'s props type add `onJadwal: () => void` and `canManageJadwal: boolean`. At BOTH `<KelasField>` call sites (myKelas and otherKelas) pass:

```tsx
            onJadwal={(k) => setDialog({ kind: 'jadwal', kelas: k })}
            currentUserId={user?.id}
```

Inside `KelasField`, compute per card and pass to `KelasCard`:

```tsx
            canManageJadwal={isAdmin || (currentUserId != null && k.guruUserId === currentUserId)}
            onJadwal={() => onJadwal(k)}
```

- [ ] **Step 4: Render the new icon button + the dialog.** In `KelasCard`, the action-icons block is currently wrapped in `{isAdmin ? (...) : null}` (line ~275) and the card open-button uses `isAdmin && 'pr-24'` for padding (line ~264). Change so a non-admin wali sees ONLY the jadwal button:

Replace the wrapper condition `{isAdmin ? (` with `{(isAdmin || canManageJadwal) ? (`, keep the existing Users/Pencil/Trash2 buttons each gated by an inner `{isAdmin ? (...) : null}` if a wali should not edit/delete the kelas, and add the jadwal button (visible to admin or wali) as the first icon:

```tsx
          {(isAdmin || canManageJadwal) ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onJadwal()
              }}
              className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('kelasSection.jadwal.manage')}
              title={t('kelasSection.jadwal.manage')}
            >
              <CalendarClock size={16} />
            </button>
          ) : null}
```

Update the card-body padding condition to reserve space when icons show:

```tsx
        (isAdmin || canManageJadwal) && 'pr-28',
```

Then add the conditional dialog render at the bottom, after the `dialog?.kind === 'anggota'` block (~line 164):

```tsx
      {dialog?.kind === 'jadwal' ? (
        <KelasJadwalDialog
          kelasId={dialog.kelas.id}
          kelasNama={dialog.kelas.nama}
          onClose={() => setDialog(null)}
        />
      ) : null}
```

- [ ] **Step 5: Type-check.** Run: `make typecheck 2>&1 | tail -20` — Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/app/src/pages/sections/KelasListSection.tsx
git commit -m "feat(web): jadwal rutin button on kelas card (admin/wali)"
```

---

## Task 11: Generate-on-open + "Rutin" badge in `KelasSesiDialog`

**Files:**
- Modify: `web/app/src/components/KelasSesiDialog.tsx`

- [ ] **Step 1: Imports** — line 1, add `useEffect`; add the auth hook + generate client:

```ts
import { useEffect, useMemo, useState } from 'react'
```
```ts
import { useAuth } from '@/lib/auth'
import { generateJadwal } from '@/api/kelas'
```

- [ ] **Step 2: Compute `canManage` + fire idempotent generate on mount.** After the existing hooks in `KelasSesiDialog` (after `const { t } = useTranslation()`, ~line 67), add:

```tsx
  const { user } = useAuth()
  const canManage = isAdmin || (user?.id != null && k.guruUserId === user.id)

  // Auto-generate recurring sesi when an admin/wali opens the class (rolling,
  // idempotent). Best-effort: no schedule or no permission → silently ignored.
  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    generateJadwal(k.id)
      .then((res) => {
        if (!cancelled && res.created > 0) {
          qc.invalidateQueries({ queryKey: ['kelas-sesi', k.id] })
          qc.invalidateQueries({ queryKey: ['sesi'] })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.id, canManage])
```

- [ ] **Step 3: Add the "Rutin" badge.** Where each sesi row renders its topic/status (find the `sesiList.map(...)` row), add a pill when `s.jadwalId` is set:

```tsx
                {s.jadwalId ? (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {t('kelasSection.jadwal.badge')}
                  </span>
                ) : null}
```

- [ ] **Step 4: Type-check.** Run: `make typecheck 2>&1 | tail -15` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/app/src/components/KelasSesiDialog.tsx
git commit -m "feat(web): auto-generate recurring sesi on class open + Rutin badge"
```

---

## Task 12: i18n keys (both locales)

**Files:**
- Modify: `web/app/src/locales/id.json`
- Modify: `web/app/src/locales/en.json`

- [ ] **Step 1: Add `jadwal` under `kelasSection`** in `id.json` (sibling of `status`/`list`/`calendar`/`rencana`):

```json
    "jadwal": {
      "title": "Jadwal Rutin — {{name}}",
      "manage": "Atur jadwal rutin",
      "hari": "Hari",
      "jam": "Jam",
      "topik": "Topik default (opsional)",
      "topikPh": "mis. Tahsin rutin",
      "mulaiTanggal": "Mulai berlaku",
      "sampaiTanggal": "Sampai",
      "horizon": "Buat sesi (minggu ke depan)",
      "aktif": "Aktif",
      "save": "Simpan",
      "saving": "Menyimpan…",
      "delete": "Hapus jadwal",
      "confirmDelete": "Hapus jadwal rutin kelas \"{{name}}\"? Sesi rutin yang belum dimulai akan ikut dihapus.",
      "saved": "Jadwal rutin disimpan",
      "saveFailed": "Gagal menyimpan jadwal",
      "deleted": "Jadwal rutin dihapus",
      "deleteFailed": "Gagal menghapus jadwal",
      "badge": "Rutin"
    },
```

- [ ] **Step 2: Add the matching `jadwal` block under `kelasSection`** in `en.json`:

```json
    "jadwal": {
      "title": "Recurring schedule — {{name}}",
      "manage": "Set recurring schedule",
      "hari": "Days",
      "jam": "Time",
      "topik": "Default topic (optional)",
      "topikPh": "e.g. Routine tahsin",
      "mulaiTanggal": "Starts",
      "sampaiTanggal": "Until",
      "horizon": "Generate sessions ahead (weeks)",
      "aktif": "Active",
      "save": "Save",
      "saving": "Saving…",
      "delete": "Delete schedule",
      "confirmDelete": "Delete the recurring schedule for \"{{name}}\"? Upcoming not-yet-started recurring sessions will be removed.",
      "saved": "Recurring schedule saved",
      "saveFailed": "Failed to save schedule",
      "deleted": "Recurring schedule deleted",
      "deleteFailed": "Failed to delete schedule",
      "badge": "Routine"
    },
```

- [ ] **Step 3: Validate JSON + type-check.**

Run: `node -e "JSON.parse(require('fs').readFileSync('web/app/src/locales/id.json'));JSON.parse(require('fs').readFileSync('web/app/src/locales/en.json'));console.log('ok')"`
Then: `make typecheck 2>&1 | tail -5`
Expected: `ok` and no type errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/src/locales/id.json web/app/src/locales/en.json
git commit -m "i18n(kelas): jadwal rutin strings (id, en)"
```

---

## Task 13: Build, type-check, and dogfood UI verification

**Files:** none (verification)

- [ ] **Step 1: Full checks**

Run: `make test 2>&1 | tail -8` and `make typecheck 2>&1 | tail -8`
Expected: both green.

- [ ] **Step 2: Rebuild the dogfood instance** (operator override — `:8300`)

Run: `cd /home/anchor/Podman/GNRS/.claude/worktrees/kelas-jadwal-rutin && docker compose up -d --build 2>&1 | tail -15`
Then smoke: `curl -s http://127.0.0.1:8300/healthz` → `{"status":"ok"}`.

> Migration 045 runs against the shared `gnrs-data` volume on boot. It is additive (new table + nullable column) — safe. If irreplaceable local data exists, `podman volume export gnrs_gnrs-data -o backup.tar` first.

- [ ] **Step 3: UI test (per TEST.md flow / Chrome DevTools if available; else document manual steps).** Log in as admin, open Kelas → a class card; click the new clock icon; set days (e.g. Mon+Wed) + time 16:00–17:00 + horizon 8; Save. Reopen the class session list and verify recurring sessions appear on the correct weekdays with the **"Rutin"** badge. Edit the schedule (change a day/time) and confirm future un-started sessions regenerate while any started/manual sessions are untouched. Disable (Aktif off) and confirm future recurring sessions are removed. Log in as the wali guru of that class and confirm the clock icon + dialog are available; log in as an unrelated guru and confirm they are not. If the Chrome DevTools harness is unavailable, perform these manually on `:8300` and record the results in the PR instead of claiming automated verification.

- [ ] **Step 4: Open the PR** targeting `gnrs-evan` with the "Tested via Chrome DevTools" section (or an explicit note that UI was verified manually on `:8300`). Then follow the CLAUDE.md loop: auto-merge once green, clean up the worktree + dev artifacts.

---

## Self-review notes (author)

- **Spec coverage:** data model (T1), generation lazy+idempotent+horizon (T4–T5, T11), days+shared-time (T1/T9), admin-or-wali (T7/T10/T11), edit/disable/delete regen semantics (T5), generated-session content (T4), API (T7/T8), UI dialog + badge (T9–T11), i18n both locales (T12). ✔
- **Type consistency:** `KelasJadwal`/`KelasJadwalInput` field names match across Go (`internal/store/jadwal.go`), handler body (`jadwalBody`), and TS (`api/kelas.ts`); `JadwalID`/`jadwalId`/`jadwal_id` consistent across store, scan, SQL, and TS. ✔
- **Idempotency key** is `(kelas_id, tanggal)` everywhere (skip + index), matching decision D (manual wins). ✔
- **Deferred (YAGNI):** the JS date-utils consolidation from the spec is NOT required by this feature (expander is Go; dialog inlines `HARI`) — left as an optional future cleanup, not a task here.
