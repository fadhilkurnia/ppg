---
topic: raport (report card) generation
depends-on: [21-materi-system.md, 40-curriculum-progress.md]
enables: []
key-concepts: [report-card, semester, grading-mode, computed-view, pdf-export]
---

# 41 — Raport (Report Card) System

## TL;DR

Compute a per-murid, per-semester report card from `materi_assignments`, `sesi_attendances`, `progress_quran`, `progress_hadist`, and `progress_compact`. The raport is **derived data**, not a separate table: compute on the fly from the source tables and cache the rendered output if needed. Provide a viewing endpoint and a PDF export.

Checklist:

- [ ] Decide grading mode (`angka` 0-100 vs `huruf` A-D) per scope.
- [ ] Add `system_settings` table for grading_mode + semester start months.
- [ ] Add `/api/raport/{userId}?year=&semester=` aggregator endpoint.
- [ ] Add a `pdf` content-type variant (server-side render or client-side print CSS).
- [ ] Add a printable HTML view in the React SPA.

---

## 1. Definitions

- **Tahun ajaran**: e.g. `"2026/2027"`.
- **Semester**: 1 (typically July–December) or 2 (January–June). Boundaries are scope-configurable.
- **Grading mode**: `'angka'` (numeric 0-100) or `'huruf'` (A / B / C / D, mapped from numeric thresholds).

## 2. System settings

```sql
CREATE TABLE system_settings (
    scope_id            TEXT REFERENCES scopes(id) ON DELETE CASCADE, -- NULL = global default
    grading_mode        TEXT NOT NULL DEFAULT 'angka' CHECK (grading_mode IN ('angka','huruf')),
    semester1_start_mm  INTEGER NOT NULL DEFAULT 7  CHECK (semester1_start_mm BETWEEN 1 AND 12),
    semester2_start_mm  INTEGER NOT NULL DEFAULT 1  CHECK (semester2_start_mm BETWEEN 1 AND 12),
    grade_thresholds    TEXT NOT NULL DEFAULT '{"A":85,"B":70,"C":55}',
    PRIMARY KEY (scope_id)
);

INSERT OR IGNORE INTO system_settings (scope_id) VALUES (NULL);
```

The effective setting for a user is the nearest-ancestor scope's row, falling back to the NULL (global) row.

## 3. Raport shape

The aggregator returns a structure of the form:

```json
{
  "data": {
    "userId": "01HZ...",
    "userName": "<display name>",
    "tahunAjaran": "2026/2027",
    "semester": 1,
    "gradingMode": "angka",
    "kelas": [
      {
        "id": "01HZ...",
        "name": "Caberawit California 2026/2027",
        "materi": [
          {
            "materiId": "01HZ...",
            "name": "Hafalan Asmaul Husna",
            "kategori": "baru",
            "basisPenilaian": "skill",
            "mark": 92,
            "status": "tuntas",
            "gradedAt": "2026-11-04T..."
          }
        ],
        "attendance": { "hadir": 12, "izin": 1, "sakit": 0, "alfa": 0 }
      }
    ],
    "domainProgress": {
      "quran": { "bacaan": { "ayatCompleted": 320 }, "hafalan": { "ayatCompleted": 88 } },
      "hadits": { "bukhari": { "chaptersCompleted": 5 } }
    },
    "summary": {
      "averageMark": 84.6,
      "tuntasCount": 7,
      "totalMateri": 8,
      "letterGrade": "B"
    }
  }
}
```

## 4. Aggregator pseudocode

```go
func (h *Raport) Get(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "userId")
    year := atoi(r.URL.Query().Get("year"))
    sem := atoi(r.URL.Query().Get("semester"))

    sett := h.settings.Effective(ctx, userID)
    from, to := semesterRange(year, sem, sett)

    kelas, _ := h.kelas.ListEnrolledKelas(ctx, userID, KelasFilter{ActiveBetween: [from, to]})
    rap := Raport{...}
    for _, k := range kelas {
        as, _ := h.assignments.List(ctx, ListAssignmentsFilter{UserID: &userID, KelasID: &k.ID, AssignedBetween: [from, to]})
        att, _ := h.sesi.AttendanceSummaryForUser(ctx, userID, k.ID, from, to)
        rap.Kelas = append(rap.Kelas, ...)
    }
    rap.DomainProgress = ...
    rap.Summary = computeSummary(rap, sett)
    httpx.JSON(w, 200, rap)
}
```

`semesterRange()` computes inclusive dates from `system_settings.semester{1,2}_start_mm` and the year.

## 5. API contract

| Method | Path | Notes |
|---|---|---|
| GET | `/api/raport/{userId}?year=2026&semester=1` | scoped read (self / parent / guru-of-kelas / admin) |
| GET | `/api/raport/{userId}.pdf?year=2026&semester=1` | PDF export |
| GET | `/api/kelas/{id}/raport?year=&semester=` | aggregated per-kelas raport (all enrolled) |
| GET | `/api/kelas/{id}/raport.csv` | spreadsheet export |

## 6. PDF rendering

Two reasonable strategies:

### 6.1 Print CSS (recommended, simpler)

Render an HTML page at `/_authed/raport/{userId}/print` styled for A4 (`@page` rules). The user clicks "Print → Save as PDF". No server-side PDF library needed.

### 6.2 Server-side `chromedp`

For automated generation (admin bulk export), embed [chromedp](https://github.com/chromedp/chromedp) and render the same HTML to PDF. Adds a Chromium dependency to the Docker image (~150 MB). Defer until needed.

## 7. Caching

If the raport endpoint becomes hot, materialise per-(user, year, semester) into a `raport_cache` table refreshed by an event-driven invalidation (on `materi.grade`, `sesi_attendance.record`, etc.). Cache key: `(user_id, year, semester, settings_hash)`.

```sql
CREATE TABLE raport_cache (
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year           INTEGER NOT NULL,
    semester       INTEGER NOT NULL,
    settings_hash  TEXT NOT NULL,
    body_json      TEXT NOT NULL,
    generated_at   TEXT NOT NULL,
    PRIMARY KEY (user_id, year, semester, settings_hash)
);
```

Not in v1; document for future.

## 8. Frontend

- `/_authed/me/raport` — murid's own raport with year/semester selector.
- `/_authed/anak/{muridId}/raport` — ortu's view of a child's raport.
- `/_authed/kelas/{id}/raport` — guru's view of the whole class.
- `/_authed/raport/{userId}/print` — printable layout.

## 9. Test plan

- `semesterRange(2026, 1)` returns `2026-07-01` to `2026-12-31` (with defaults).
- Aggregator sums attendance and grades correctly across multiple kelas.
- `huruf` mode maps thresholds correctly (A ≥ 85, B ≥ 70, C ≥ 55, otherwise D).
- Permissions: a guru cannot read a raport from another scope.

## 10. Open questions

- **Comments**: a guru-comment per raport per semester? Recommendation: add a `raport_comments` table later (one row per user/year/semester/author).
- **Signatures**: digitally signed raports? Defer; can be added by hashing the rendered PDF and storing in `media_bank`.
- **Historical settings**: if settings change mid-semester, the raport view should pin to the settings effective at the semester start. Store `settings_hash` per raport_cache row for traceability.
