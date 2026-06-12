# Design — Per-Kelas Recurring Schedule (Jadwal Rutin)

Date: 2026-06-10
Track: `gnrs-evan`
Branch: `feat/kelas-jadwal-rutin`

## 1. Summary

Give each **kelas** its own recurring weekly schedule ("jadwal rutin"). The
schedule defines which weekdays the class meets and a single shared time. From
that, the system **auto-generates individual `sesi` rows** for a rolling window
into the future, so the teacher never has to hand-create the same weekly
sessions. Generation is **lazy and idempotent**: it runs when the class is
opened (no background daemon exists), filling in any missing upcoming sessions
up to a horizon, skipping ones that already exist.

## 2. Decisions (from brainstorming)

| # | Decision |
|---|----------|
| Purpose | **Auto-generate sessions** from the schedule (not display-only, not template-only). |
| Pattern | **Days + one shared time** — pick weekdays (e.g. Mon & Wed), one `mulai`/`selesai` applied to all. |
| Trigger | **Lazy rolling** — generate on class open, idempotent, up to an N-week horizon. |
| Permission | **Admin OR the kelas wali** (primary `guru_user_id`) may manage the schedule. |
| Horizon | Default **8 weeks** ahead (configurable per kelas). |
| Generated content | Date + time + default topik; **no materi** (filled per-session later). |
| Manual conflict | If a date already has a sesi for the kelas, **skip** (manual/existing wins). |

### Non-goals (YAGNI for v1)
- Biweekly / interval / monthly recurrence, or full RRULE. (Weekly only.)
- Different times per weekday. (One shared time — can extend later without a breaking migration.)
- Calendar-app "this session only vs this and following" series edit semantics.
- Per-jadwal timezone (use the app's single local wall-clock like `sesi` does today).
- Reminders / notifications.

## 3. Data model

### Migration `045_kelas_jadwal` (next free number; highest existing is `044_quran_manqul_share`)

New table `kelas_jadwal` — one row per kelas, mirroring the existing
`kelas_guru` / `kelas_anggota` 1-to-many style (no SQL FKs in this schema):

```sql
-- 045_kelas_jadwal.up.sql
CREATE TABLE kelas_jadwal (
  id             TEXT PRIMARY KEY,
  kelas_id       TEXT NOT NULL UNIQUE,        -- one schedule per kelas
  hari           TEXT NOT NULL,               -- CSV of weekday ints, 0=Sun..6=Sat, e.g. "1,3"
  mulai          TEXT NOT NULL,               -- "HH:MM"
  selesai        TEXT,                        -- "HH:MM", nullable
  topik_default  TEXT,                        -- default topic for generated sesi, nullable
  mulai_tanggal  TEXT,                        -- "YYYY-MM-DD" series start, nullable (default: today)
  sampai_tanggal TEXT,                        -- "YYYY-MM-DD" series end, nullable (open-ended)
  horizon_minggu INTEGER NOT NULL DEFAULT 8,  -- how many weeks ahead to generate
  aktif          INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_kelas_jadwal_kelas ON kelas_jadwal(kelas_id);

-- link generated sesi back to their schedule
ALTER TABLE sesi ADD COLUMN jadwal_id TEXT;   -- nullable; NULL = manually created
CREATE INDEX idx_sesi_jadwal ON sesi(jadwal_id);
CREATE INDEX idx_sesi_kelas_tanggal ON sesi(kelas_id, tanggal);  -- fast idempotency lookup
```

`hari` is stored as a small CSV because **expansion happens in Go, not SQL** —
no need to query-by-day in the database, so a normalized per-day table buys
nothing here and a single-row-per-kelas config is simpler.

### Down migration
`045_kelas_jadwal.down.sql` drops the two indexes + `kelas_jadwal` table, then
reverses the `sesi.jadwal_id` column. SQLite `DROP COLUMN` support must be
verified against the project's driver/version; if unsupported, write the down
as a table-rebuild. This runs against the shared `gnrs-data` volume, so the
down path must be correct (a bad down-migration is destructive).

## 4. Backend

### Store (`internal/store/kelas.go`, `internal/store/sesi.go`)

- `KelasJadwal` struct + `KelasJadwalInput` (write shape).
- `KelasStore.GetJadwal(ctx, kelasID) (*KelasJadwal, error)` — returns nil if none.
- `KelasStore.UpsertJadwal(ctx, kelasID, in) (*KelasJadwal, error)` — insert or update the single row.
- `KelasStore.DeleteJadwal(ctx, kelasID) error`.
- Add explicit `DELETE FROM kelas_jadwal WHERE kelas_id = ?` to existing
  `KelasStore.Delete` (no SQL FK cascade — must clean up manually).
- `Sesi` / `SesiInput` gain `JadwalID *string`; include `jadwal_id` in
  `sesiCols`, the INSERT in `Create`, and `scanSesi`.

### Generation (Go, request-driven — no daemon)

```
ExpandJadwal(ctx, kelasID, from, to) []SesiInput
  jadwal := GetJadwal(kelasID); if nil || !aktif → return nil
  effFrom := max(from, jadwal.mulai_tanggal or from)
  effTo   := min(to,   jadwal.sampai_tanggal or to)
  days    := parse(jadwal.hari)            // set of 0..6
  for d in [effFrom .. effTo]:
    if weekday(d) in days:
      emit SesiInput{
        Tanggal: d, Mulai: jadwal.mulai, Selesai: jadwal.selesai,
        Topik:   jadwal.topik_default or kelas.nama,
        Tingkat: kelas.tingkat, GuruID: kelas.guru_user_id (wali),
        KelasID: kelasID, JadwalID: jadwal.id,
      }
```

```
GenerateFromJadwal(ctx, kelasID) (created int)
  to := today + horizon_minggu*7
  for cand in ExpandJadwal(kelasID, today, to):
    if a sesi exists with (kelas_id=cand.KelasID AND tanggal=cand.Tanggal): continue  // skip (idempotent + manual wins)
    Sesi.Create(cand, createdBy)   // reuses syncSesiToRencana side-effect
  return created
```

- **Idempotent**: the skip check keys on `(kelas_id, tanggal)` so neither
  repeated generation nor a pre-existing manual sesi creates duplicates, and
  the downstream `syncSesiToRencana` / attendance / pencapaian effects don't
  double-fire.
- **Wall-clock dates**: all date math uses the existing `"YYYY-MM-DD"`
  local-wall-clock convention (no UTC) to avoid off-by-one-day drift.

### Edit / disable / delete semantics

A "regen" helper deletes only **future, un-started, schedule-generated** rows:
`DELETE FROM sesi WHERE kelas_id=? AND jadwal_id IS NOT NULL AND started_at IS NULL AND tanggal >= today`.

- **Upsert jadwal** (day/time change, or `aktif=1`): regen-delete, then
  `GenerateFromJadwal`. Past/started/ended sessions and manual sessions
  (`jadwal_id IS NULL`) are never touched.
- **Disable** (`aktif=0` via upsert): regen-delete only, do not regenerate.
- **Delete jadwal**: regen-delete, then delete the `kelas_jadwal` row.

### API

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/kelas/{id}/jadwal` | authenticated (same group as other kelas GETs) — returns the jadwal or `null` |
| `PUT` | `/api/kelas/{id}/jadwal` | **admin OR wali** — upsert |
| `DELETE` | `/api/kelas/{id}/jadwal` | **admin OR wali** |
| `POST` | `/api/kelas/{id}/jadwal/generate` | **admin OR wali** — idempotent sync, returns `{created}` |

Writes are **not** in the blanket `RequireRole("admin")` group. They register
in the authenticated group; the handler loads the kelas and enforces:

```go
claims, _ := auth.ClaimsFrom(r.Context())
if claims == nil || (claims.Role != model.RoleAdmin && kelas.GuruUserID != claims.UserID) {
    httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
    return
}
```

This mirrors the existing "admin-or-self" precedent in `internal/handler/users.go`.
`jadwalBody` uses go-playground/validator tags (each weekday 0–6, `mulai`/`selesai`
`len=5`, dates `len=10`, `horizon_minggu` min=1 max=52), with Indonesian error messages.

## 5. Frontend

- **`web/app/src/api/kelas.ts`**: `KelasJadwal` / `KelasJadwalInput` types and
  `getJadwal` / `putJadwal` / `deleteJadwal` / `generateJadwal` clients (follow
  the existing `listAnggota` / `addGuruAnggota` pattern).
- **`web/app/src/api/sesi.ts`**: add `jadwalId?: string | null` to `Sesi`.
- **`web/app/src/components/KelasJadwalDialog.tsx` (NEW)**: modeled on
  `KelasAnggotaDialog`. Reuses `Dialog`/`Button`/`Input`/`Field`,
  react-hook-form + zod, TanStack Query mutations, `useToast`/`useConfirm`.
  Fields: weekday toggles (reuse the locale-aware `HARI` labels from
  `KelasCalendarSection`), one `TimeRangePicker` (mulai–selesai, reused),
  optional default topik, optional start/end date, horizon weeks, an Aktif
  switch, and Save / Delete. On save → invalidate `['sesi']` / `['kelas-sesi', id]`.

  ```
  ┌ Jadwal Rutin — Kelas 3A ───────────────┐
  │ Hari:  [M][S][S][R][K][J][S]  (toggle)   │
  │ Jam :  [ 16:00 ] – [ 17:00 ]             │
  │ Topik default: [ Tahsin rutin         ] │
  │ Berlaku: [ hari ini ] – [ akhir t.ajaran ]│
  │ Buat sampai: [ 8 ] minggu ke depan       │
  │ Aktif: [●—]              [Hapus] [Simpan] │
  └──────────────────────────────────────────┘
  ```

- **`web/app/src/pages/sections/KelasListSection.tsx`**: add a clock/calendar
  icon button on the kelas card (visible to admin **or** the card's wali),
  alongside Users/Pencil/Trash2; extend the dialog-state union with
  `{ kind: 'jadwal'; kelas }` and render `KelasJadwalDialog`.
- **Auto-generate on open**: when `KelasSesiDialog` opens, if the current user
  is admin or the kelas wali, fire `generateJadwal(kelasId)` (idempotent) then
  refetch sessions. Other viewers just see existing sessions — no call, no 403.
- **Badge**: sessions with `jadwalId` set show a small "Rutin" pill in
  `KelasSesiDialog` (and optionally the calendar). `statusOf()` is unchanged.
- **Global calendar** (`KelasCalendarSection`, all classes) does **not** itself
  trigger generation — it renders whatever rows already exist. Generation is
  per-class, triggered when that class is opened. (A global "generate all" is
  out of scope for v1.)
- **Reuse as-is**: `TimeRangePicker`/`TimeDialPopup`, `MateriSourcePicker`
  (not needed for v1 generated content), calendar rendering.

## 6. i18n

Add a `kelasSection.jadwal` sub-namespace to **both** `id.json` and `en.json`
(identical structure — a missing key silently renders the raw key): dialog
title, weekday labels (or reuse existing), mulai/selesai labels, topik-default
label, berlaku/horizon labels, Aktif, Simpan/Hapus, the "Rutin" badge, and
success/error toasts. Keep Indonesian domain terms (jadwal, rutin, hari,
mulai, selesai) as the codebase does.

## 7. Date-utils consolidation (small, in-scope)

Extract the duplicated `localDate` / `pad2` / `shiftDate` (and a small
`weekday`/`addWeeks` helper the expander needs) into
`web/app/src/lib/dateUtils.ts`, and switch the duplicate definitions
(`SesiFormDialog`, `KelasSesiDialog`, `KelasCalendarSection`, etc.) to import
it. Scope strictly to these helpers — no unrelated refactor. Done as its own
commit before the feature wiring.

## 8. Risks / edge cases

- **No FK cascades** — `KelasStore.Delete` and jadwal-delete must explicitly
  clean `kelas_jadwal` and orphaned generated `sesi`.
- **Idempotency** — generation must skip existing `(kelas_id, tanggal)` to
  avoid duplicate sessions and duplicate attendance/pencapaian/rencana effects.
- **Wall-clock dates** — match the `"YYYY-MM-DD"` convention exactly in the
  expander (off-by-one risk).
- **Overlap** — `UNIQUE(kelas_id)` guarantees one schedule per class; weekday
  CSV is validated/deduped app-side.
- **Migration number collision** — confirm `gnrs-evan` head before committing
  `045` (other agents/tracks share this schema area).

## 9. Testing plan

- **Go tests** (`CGO_ENABLED=1`, sqlite): `ExpandJadwal` (weekday math, start/end
  clamping, horizon); `GenerateFromJadwal` idempotency (repeat = 0 new; pre-existing
  manual sesi not duplicated); upsert/disable/delete cleanup (future un-started
  generated removed, started/ended preserved, manual untouched); auth (admin or
  wali allowed, others 403).
- **Type-check**: `make typecheck`.
- **UI**: drive the flow per `TEST.md` against the local dogfood (`:8300`) — set
  a schedule, open the class, confirm sessions appear on the right weekdays with
  the "Rutin" badge, edit days/time and confirm future regen without touching
  started/manual sessions, disable and confirm cleanup. (If the Chrome DevTools
  harness is unavailable, document the manual verification instead of claiming it.)
```
