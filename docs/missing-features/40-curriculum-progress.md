---
topic: curriculum planning and Qur'an / Hadits / Doa progress
depends-on: [20-kelas-system.md, 21-materi-system.md]
enables: [41-raport-system.md]
key-concepts: [rencana-ajar, rencana-bulanan, quran-progress, hadits-progress, manqul-note, tilawati]
---

# 40 — Curriculum Planning & Domain Progress

## TL;DR

Capture **what** is planned to be taught (and **when**) in a curriculum plan, and capture **how much** each murid has actually accomplished against Qur'an, Hadits, and Doa references. The feature is **optional** for ppgus — only relevant if the product evolves toward an Islamic-education domain similar to sitrac. The schema is documented here so a future implementer does not have to re-derive it.

Checklist (skip the section that does not match your product):

- [ ] Curriculum planning:
  - [ ] Migration `022_add_rencana_ajar` (`rencana_ajar`, `rencana_bulanan`).
  - [ ] Endpoints `/api/rencana-ajar/*`, `/api/rencana-bulanan/*`.
- [ ] Domain progress:
  - [ ] Migration `023_add_quran_progress` (`rencana_quran`, `progress_quran`, `quran_manqul_note`).
  - [ ] Migration `024_add_hadits_progress` (`rencana_hadist`, `progress_hadist`, `hadits_manqul_note`).
  - [ ] Migration `025_add_compact_ajar` for Doa / Asmaul Husna / Tilawati catalogs.
  - [ ] Endpoints under `/api/quran/*`, `/api/hadits/*`, `/api/doa/*`.

If the product direction does not include religious-text tracking, **stop here** and treat the rest of this doc as reference.

---

## 1. Curriculum planning

### 1.1 `rencana_ajar`

A long-running plan: which materials are intended for a kelas (or kelas-template) over the academic year.

```sql
CREATE TABLE rencana_ajar (
    id           TEXT PRIMARY KEY,
    kelas_id     TEXT NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    tahun_ajaran TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE rencana_ajar_materi (
    rencana_id              TEXT NOT NULL REFERENCES rencana_ajar(id) ON DELETE CASCADE,
    materi_id               TEXT NOT NULL REFERENCES materi(id) ON DELETE RESTRICT,
    target_kategori         TEXT,
    target_completion_date  TEXT,
    ordering                INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (rencana_id, materi_id)
);
```

### 1.2 `rencana_bulanan`

A month-of-year plan: which materials are delivered in a specific month.

```sql
CREATE TABLE rencana_bulanan (
    id          TEXT PRIMARY KEY,
    kelas_id    TEXT NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (kelas_id, year, month)
);

CREATE TABLE rencana_bulanan_materi (
    rencana_id    TEXT NOT NULL REFERENCES rencana_bulanan(id) ON DELETE CASCADE,
    materi_id     TEXT NOT NULL REFERENCES materi(id) ON DELETE RESTRICT,
    delivered_on  TEXT,
    delivered_by  TEXT REFERENCES users(id),
    ordering      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (rencana_id, materi_id)
);
```

### 1.3 API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/kelas/{id}/rencana-ajar` | one per tahun ajaran |
| POST | `/api/kelas/{id}/rencana-ajar` | `{ tahunAjaran, materi: [{materiId, ordering, targetKategori, targetCompletionDate}] }` |
| PATCH | `/api/rencana-ajar/{id}` | replace materi list |
| GET | `/api/kelas/{id}/rencana-bulanan?year=&month=` | one row |
| POST | `/api/kelas/{id}/rencana-bulanan` | `{ year, month, notes?, materi: [...] }` |
| POST | `/api/rencana-bulanan/{id}/deliver` | `{ materiId, deliveredOn }` marks one materi delivered |

## 2. Qur'an progress

### 2.1 Reference tables

A small reference catalog of surat metadata (114 rows) is bundled as a seed migration; production must not depend on a remote API for ayat counts.

```sql
CREATE TABLE quran_surat (
    number       INTEGER PRIMARY KEY,
    name_arabic  TEXT NOT NULL,
    name_latin   TEXT NOT NULL,
    ayat_count   INTEGER NOT NULL,
    juz_from     INTEGER NOT NULL,
    juz_to       INTEGER NOT NULL,
    revelation   TEXT NOT NULL CHECK (revelation IN ('makkiyah','madaniyah'))
);
```

### 2.2 Plan + progress

```sql
CREATE TABLE rencana_quran (
    id          TEXT PRIMARY KEY,
    kelas_id    TEXT REFERENCES kelas(id) ON DELETE CASCADE,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    surat_from  INTEGER NOT NULL REFERENCES quran_surat(number),
    ayat_from   INTEGER NOT NULL,
    surat_to    INTEGER NOT NULL REFERENCES quran_surat(number),
    ayat_to     INTEGER NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('bacaan','hafalan','makna')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE progress_quran (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    surat       INTEGER NOT NULL REFERENCES quran_surat(number),
    ayat        INTEGER NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('bacaan','hafalan','makna')),
    achieved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, surat, ayat, kind)
);
CREATE INDEX idx_progress_quran_user ON progress_quran(user_id, kind);
```

### 2.3 Manqul notes

Free-form discussion notes anchored to a specific ayat:

```sql
CREATE TABLE quran_manqul_note (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    surat       INTEGER NOT NULL REFERENCES quran_surat(number),
    ayat        INTEGER NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_quran_manqul_user ON quran_manqul_note(user_id, surat, ayat);
```

### 2.4 API sketch

| Method | Path |
|---|---|
| GET | `/api/quran/surat` |
| GET | `/api/users/{id}/quran/progress?kind=` |
| POST | `/api/users/{id}/quran/progress` body `{ surat, ayat, kind }` |
| DELETE | `/api/users/{id}/quran/progress/{surat}/{ayat}?kind=` |
| GET | `/api/users/{id}/quran/notes?surat=&ayat=` |
| POST | `/api/users/{id}/quran/notes` body `{ surat, ayat, body }` |
| PATCH | `/api/quran-notes/{id}` body `{ body }` |
| GET | `/api/kelas/{id}/quran-summary` per-murid completion stats |

## 3. Hadits progress

Schema mirrors Qur'an progress:

```sql
CREATE TABLE hadits_kitab (
    id            TEXT PRIMARY KEY,           -- e.g. 'bukhari', 'muslim'
    name          TEXT NOT NULL,
    chapter_count INTEGER NOT NULL
);

CREATE TABLE rencana_hadist (
    id           TEXT PRIMARY KEY,
    kelas_id     TEXT REFERENCES kelas(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
    kitab_id     TEXT NOT NULL REFERENCES hadits_kitab(id),
    chapter_from INTEGER NOT NULL,
    chapter_to   INTEGER NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('bacaan','hafalan','makna'))
);

CREATE TABLE progress_hadist (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kitab_id    TEXT NOT NULL REFERENCES hadits_kitab(id),
    chapter     INTEGER NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('bacaan','hafalan','makna')),
    achieved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, kitab_id, chapter, kind)
);
```

`hadits_manqul_note` follows the same pattern as `quran_manqul_note`.

## 4. Doa / Asmaul Husna / Tilawati ("compact ajar")

A flexible catalog table covers static reference material:

```sql
CREATE TABLE compact_ajar (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('doa','asmaul_husna','tilawati','adab','aktifitas','nasihat')),
    title        TEXT NOT NULL,
    body_arabic  TEXT,
    body_latin   TEXT,
    body_meaning TEXT,
    ordering     INTEGER NOT NULL DEFAULT 0,
    tags         TEXT NOT NULL DEFAULT '[]',
    status       TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE progress_compact (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    compact_id   TEXT NOT NULL REFERENCES compact_ajar(id) ON DELETE RESTRICT,
    achieved_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, compact_id)
);
```

This single pair handles all "small lessons" (Doa, Asmaul Husna, Adab, Nasihat) without exploding into many tables.

## 5. Front-end

Pages to add (mirror sitrac-v3):

- `/_authed/pustaka` — landing: tiles for Quran / Doa / Hadits / Asmaul Husna.
- `/_authed/pustaka/quran` — surat list; click → ayat-level reader.
- `/_authed/pustaka/hadits/{kitabId}` — chapter list.
- `/_authed/me/quran` — personal Qur'an progress.
- `/_authed/me/hadits` — personal hadits progress.
- `/_authed/kelas/{id}/rencana-ajar` — guru editor.
- `/_authed/kelas/{id}/rencana-bulanan` — guru editor.

Right-to-left support: add `dir="rtl"` and `lang="ar"` on Arabic blocks. Adopt the Amiri webfont (open license).

## 6. Test plan (skeleton)

- `rencana_ajar` create/list/replace works.
- Progress insert is idempotent for the same `(user, surat, ayat, kind)`.
- `kelas/{id}/quran-summary` returns per-murid counts that match the rows.
- Manqul note CRUD permissions: author + guru of kelas (if any) + admin.

## 7. Open questions

- **Multi-script transliteration**: do we support multiple Latin transliteration variants? Recommendation: store one Latin column; expose alt schemes via a separate optional table later.
- **Audio anchors**: per-ayat audio file attachments (`media_bank`) via a `quran_audio` table. Defer.
- **Library cache**: an "official" cache of surat/ayat text from a CDN. Recommendation: seed once via migration; do not depend on a live external API at runtime.
