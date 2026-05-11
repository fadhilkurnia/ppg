---
topic: glossary and bilingual terminology
depends-on: []
enables: []
key-concepts: [bilingual-terms, acronyms, role-names, domain-vocabulary]
---

# 99 — Glossary

> Bilingual (Indonesian ↔ English) terminology and acronyms used across the doc set. Skim this once before reading the implementation guides.

## A

- **Absensi** — attendance. In ppgus, both the legacy `attendances` table and the new `sesi_attendances` carry the concept.
- **Active (sesi)** — a session that has started but not ended (status `active`).
- **Admin** — system superuser role. See [12](./12-user-and-roles.md).
- **API path (dynamic)** — a 12-hex per-session prefix injected by the gnrs Worker to mitigate CSRF. See [50](./50-security-hardening.md) §3.
- **Aktifitas** — activity (as in lesson "activity" entry in `compact_ajar`).
- **Anak** — child. Used in the ortu (parent) UI: `/_authed/anak`.
- **Archived** — soft-deleted status for organisational entities. Row stays; lists hide it.
- **Asmaul Husna** — the 99 names of Allah. A `compact_ajar` kind.
- **Audit log** — append-only record of mutating actions. See [34](./34-audit-log.md).
- **Ayat** — verse (of Qur'an).

## B

- **Basis penilaian** — grading basis. `skill` (numeric pass threshold) vs `completion` (done/not-done). See [21](./21-materi-system.md).
- **Bcrypt** — password hashing algorithm in use today.
- **Bulk** — CSV-driven multi-row import/export. See [24](./24-bulk-operations.md).

## C

- **Caberawit** — youngest age tier in the PPG mentorship program.
- **Chi (go-chi/chi)** — the existing HTTP router in ppgus.
- **CSP** — Content-Security-Policy header.
- **CSRF** — Cross-Site Request Forgery.

## D

- **Daerah** — region. Top level of the scope hierarchy. See [11](./11-scope-hierarchy.md).
- **Daerah, desa, kelompok** — three levels of organisational scope.
- **Desa** — village / branch. Middle level of scope.
- **Doa** — prayer / supplication. A `compact_ajar` kind.

## E

- **Ended (sesi)** — completed session.
- **Envelope** — JSON wrapper for WebSocket events. See [30](./30-real-time-websockets.md).

## G

- **Generus** — the youth community served by PPG ("Pengajian Generus"). The current "students" entity in ppgus represents Generus.
- **gnrs** — short name for the Vue 3 frontend at `/workspace/fevue/frontend/gnrs`.
- **Guru** — teacher.

## H

- **Hadir** — present (attendance status).
- **Hadits / Hadist** — sayings of the Prophet Muhammad. Both spellings appear in the codebases.
- **Hafalan** — memorisation. A `kind` value on Qur'an / Hadits progress rows.
- **HMAC** — Hash-based Message Authentication Code, used for the QR token signature.
- **HttpOnly** — cookie attribute preventing JS access.

## I

- **Izin (murid / guru)** — excused absence (by student / by teacher).

## J

- **Jam mulai / selesai** — start time / end time of a sesi.
- **JWT** — JSON Web Token.

## K

- **Kategori (materi)** — `baru` (new), `lanjutan` (continuation), `mengulang` (revision).
- **Kelas** — class / cohort.
- **Kelas template** — pre-defined class shape that can be cloned. See [20](./20-kelas-system.md).
- **Kelompok** — group / cell / congregation. Smallest level of scope hierarchy.

## L

- **Level (student)** — `Caberawit`, `Pra Remaja`, `Remaja`, `Pra Nikah`.
- **LiveKit** — video-conferencing SDK used by sitrac (not yet in ppgus).

## M

- **Makna** — meaning. A `kind` value (alongside `bacaan` and `hafalan`) on Qur'an / Hadits progress.
- **Manageable roles** — list of role IDs a role may grant or manage. See [12](./12-user-and-roles.md) §6.
- **Manqul** — discussion notes from a guru about a specific ayat or hadits, transcribed by a murid.
- **Materi (ajar)** — learning material. See [21](./21-materi-system.md).
- **Media bank** — file upload table + content-addressed storage. See [33](./33-file-uploads.md).
- **Mengajar Hari Ini** — "Teaching Today" — the guru home dashboard label in sitrac-v3.
- **Murid** — student / pupil.

## N

- **Nilai tuntas** — passing grade for a skill-based materi.

## O

- **Ortu** — short for *orang tua*, parent.
- **Otorisasi** — authorisation.

## P

- **Pencapaian** — achievement. The grade or status a student has for a material.
- **Pengajaran** — teaching.
- **Pengajian** — religious teaching session.
- **Pengurus** — staff / administrator (between guru and full admin).
- **PPG** — Pesantren Pendidikan Guru (teacher-training pesantren). The current ppgus codebase is for PPG mentorship.
- **PPG-Generus** — combination of program and audience that ppgus serves.
- **Pra Nikah** — "before marriage" age tier (oldest in the program).
- **Pra Remaja** — "pre-teenager" age tier.
- **Pustaka** — library. A consolidated UI page in sitrac-v3 for Qur'an / Doa / Hadits / Asmaul Husna.

## Q

- **QR token** — ephemeral signed string used for self-service attendance. See [23](./23-qr-attendance.md).

## R

- **Raport** — report card.
- **Rencana ajar** — long-term teaching plan.
- **Rencana bulanan** — monthly teaching plan.
- **Role-based access control (RBAC)** — permission system. ppgus moves from a hard-coded enum to a database-driven `roles` table.

## S

- **SameSite=Strict** — cookie attribute that prevents cross-site sending.
- **Scope** — a `daerah`, `desa`, or `kelompok` node in the org tree.
- **Scope hierarchy** — `daerah → desa → kelompok` tree. See [11](./11-scope-hierarchy.md).
- **Service worker** — browser feature for PWA. See [51](./51-frontend-evolution.md) §5.
- **Sesi** — session: a scheduled teaching event.
- **sitrac** — full-featured LMS at `/workspace/sitrac`.
- **sitrac-v3** — UX redesign of sitrac at `/workspace/sitrac-v3`.
- **SQLite** — the embedded database in use today.
- **Staff (role)** — legacy role in ppgus, mapped to `pengurus` semantics under the new role system.

## T

- **Tahun ajaran** — academic year (e.g. `"2026/2027"`).
- **TanStack Query** — React data-fetching library used by `web/app/`.
- **TanStack Router** — React routing library used by `web/app/`.
- **Tilawati** — a method for learning to read the Qur'an. A `compact_ajar` kind.
- **Tingkat** — grade level.
- **Tuntas** — completed and passed (achievement status).
- **Tugas (sesi)** — homework / task assigned in a session.

## U

- **ULID** — lexicographically sortable unique ID. The existing PK type in ppgus.

## V

- **Validator (go-playground)** — Go struct validation library; existing dependency.

## W

- **WebSocket** — real-time bidirectional channel. See [30](./30-real-time-websockets.md).
- **Worker (Cloudflare)** — serverless edge runtime used by gnrs.

## Z

- **Zod** — TypeScript-first schema validation library used by the React SPA.

---

## Cross-language quick map

| Indonesian | English / role | First mentioned in |
|---|---|---|
| Admin | Admin | 12 |
| Pengurus | Staff / Admin (scoped) | 12 |
| Guru | Teacher | 12 |
| Ortu (Orang Tua) | Parent | 42 |
| Murid | Student | 12 |
| Generus | Youth community member | 01 |
| Daerah | Region | 11 |
| Desa | Village / branch | 11 |
| Kelompok | Group / cell | 11 |
| Kelas | Class / cohort | 20 |
| Sesi | Session | 22 |
| Materi | Material | 21 |
| Pencapaian | Achievement | 21 |
| Raport | Report card | 41 |
| Tahun ajaran | Academic year | 20 |
| Hadir | Present | 22 |
| Izin | Excused | 22 |
| Alfa | Absent (unexcused) | 22 |
| Sakit | Sick | 22 |
| Tuntas | Completed | 21 |
| Proses | In progress | 21 |
| Belum | Not yet | 21 |
| Tugas | Task / homework | 22 |
