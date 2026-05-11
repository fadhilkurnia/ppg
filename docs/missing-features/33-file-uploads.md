---
topic: file uploads and media bank
depends-on: [10-domain-model-evolution.md, 12-user-and-roles.md]
enables: [21-materi-system.md]
key-concepts: [content-addressed-storage, sha256, dedup, quota, mime-allowlist, antivirus-hook]
---

# 33 — File Uploads & Media Bank

## TL;DR

Add a `media_bank` table for uploaded files and a content-addressed storage layout under `data/media/<sha256[0:2]>/<sha256>`. Reuse the storage across all owners — `materi`, `sesi_notes`, `users` (avatars), `chat`. Limit per-upload size (default 50 MB), enforce MIME allowlist, and stream uploads through `multipart.Reader` to avoid buffering. Expose `POST /api/media`, `GET /api/media/{id}`, `GET /api/media/{id}/download`.

Checklist:

- [ ] Migration `020_add_media_bank`.
- [ ] Add `internal/store/media.go`.
- [ ] Add `internal/storage/` for the content-addressed disk layer (separate from store for testability).
- [ ] Add `internal/handler/media.go`.
- [ ] Wire `/api/media/*`.
- [ ] Add a daily orphan-sweeper (scheduler job) for unreferenced media files.

---

## 1. Why this is needed

A material may need an attached PDF/slide. A sesi note may include a recording. A user may want a profile photo. ppgus currently has no upload path at all. Sitrac uses `multer` and stores files in a path-based scheme; gnrs has no uploads. We adopt content-addressed storage so that re-uploading the same file dedupes automatically.

## 2. Data model

```sql
CREATE TABLE media_bank (
    id              TEXT PRIMARY KEY,
    owner_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename        TEXT NOT NULL,
    mime            TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    sha256          TEXT NOT NULL,
    width_px        INTEGER,
    height_px       INTEGER,
    duration_sec    REAL,
    visibility      TEXT NOT NULL DEFAULT 'authenticated'
                    CHECK (visibility IN ('public','authenticated','scope','owner')),
    scope_id        TEXT REFERENCES scopes(id) ON DELETE RESTRICT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_media_owner  ON media_bank(owner_user_id);
CREATE INDEX idx_media_sha256 ON media_bank(sha256);
CREATE INDEX idx_media_scope  ON media_bank(scope_id);
```

Multiple `media_bank` rows can share the same `sha256` (when different owners upload identical files). Disk storage is a single file per hash.

### 2.1 Disk layout

```
$DATA_DIR/media/
├── 4a/4a8f0b...c9d2.bin
├── 9c/9c123...f0e7.bin
└── ...
```

Files are renamed to `<sha256>.bin` and live in a sub-directory derived from the first two chars of the hash.

### 2.2 Storage abstraction

```go
// internal/storage/blob.go
type Blob interface {
    Put(ctx context.Context, sha256 string, r io.Reader, size int64) error
    Get(ctx context.Context, sha256 string) (io.ReadCloser, error)
    Stat(ctx context.Context, sha256 string) (Info, error)
    Delete(ctx context.Context, sha256 string) error
}

type LocalBlob struct{ root string }
```

A later S3 / Cloudflare R2 implementation slots in without touching handlers.

## 3. Upload pipeline

1. Client POSTs `multipart/form-data` with one `file` part.
2. Handler enforces:
   - `Content-Length` ≤ `MEDIA_MAX_BYTES` (default 50 MB).
   - MIME from the Content-Type header is in the allowlist (see §4) OR the sniffed MIME from the first 512 bytes is in the allowlist.
   - User has not exceeded `MEDIA_QUOTA_BYTES_PER_USER` (default 1 GiB).
3. Handler computes SHA-256 while streaming to a tmpfile inside `$DATA_DIR/tmp/`.
4. On success, `rename()` to the final path. Compute width/height for images, duration for media if `ffprobe` is available.
5. Insert `media_bank` row. If the hash already exists, skip the disk write (still insert the row).

```go
func (h *Media) Upload(w http.ResponseWriter, r *http.Request) {
    rdr, err := r.MultipartReader()
    if err != nil { httpx.Error(...); return }
    for {
        part, err := rdr.NextPart()
        // ... stream + hash + tmpfile ...
    }
}
```

## 4. MIME allowlist

| Group | MIME |
|---|---|
| Image | `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml` (sanitised) |
| Document | `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| Audio | `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/mp4`, `audio/webm` |
| Video | `video/mp4`, `video/webm`, `video/quicktime` |
| Text | `text/plain`, `text/csv`, `text/markdown` |

SVG files are sanitised through `bluemonday`-style sanitiser to strip scripts before serving.

Reject any MIME not on the list with `415 unsupported_media_type`.

## 5. API contract

| Method | Path | Notes |
|---|---|---|
| POST | `/api/media` | multipart upload; returns the new row |
| GET | `/api/media/{id}` | metadata JSON |
| GET | `/api/media/{id}/download` | streams the file; sets `Content-Disposition`; sets `Content-Type` from row |
| DELETE | `/api/media/{id}` | flips `status='archived'`; physical file is not deleted yet (sweeper handles) |
| GET | `/api/media?ownerUserId=&mime=&status=&q=&limit=&offset=` | listing for the media-bank UI |

### 5.1 Visibility check

`GET /api/media/{id}/download` honours `visibility`:

- `public`: no auth required.
- `authenticated`: any logged-in user.
- `scope`: must share at least one scope with `media.scope_id`.
- `owner`: only the owner (or admin).

## 6. Orphan sweeper

A scheduled job runs daily:

1. Identify `media_bank` rows with `status='archived'` and `updated_at < now - 7 days`.
2. For each row: check if any other row (any owner) still references the same `sha256`. If not, delete the disk file.
3. Optionally hard-delete the archived row.

```go
type MediaSweepJob struct{ store *store.Media; blob storage.Blob }

func (j *MediaSweepJob) Name() string { return "media.sweep" }
```

## 7. Quota enforcement

`SUM(size_bytes)` over `media_bank WHERE owner_user_id=? AND status='active'` ≤ user's quota. The quota is configurable per-role:

| Role | Default quota |
|---|---|
| admin | 10 GiB |
| pengurus | 5 GiB |
| guru | 2 GiB |
| ortu, murid | 200 MiB |

Override via `roles.quota_bytes` (add to `roles` table later) or via env override.

## 8. Frontend

`web/app/src/components/MediaUpload.tsx`:

- Drag-and-drop or click-to-pick.
- Shows progress.
- On success calls back with the `mediaId` to attach.

`/_authed/media` page (admin / pengurus): media bank table with search, filter by owner / mime, and bulk archive.

## 9. Anti-virus hook (optional)

For a higher-trust deployment, allow plugging in ClamAV or similar:

```go
type Scanner interface {
    Scan(ctx context.Context, path string) (clean bool, err error)
}
```

If `MEDIA_AV_ENABLED=1` and a scanner is configured, scan in step 4 of §3. Reject `clean == false` with `422 infected`.

## 10. Test plan

`internal/storage/local_test.go`:

- Put + Get round-trip; Stat returns size.
- Put with an existing hash is idempotent (no second file write).
- Delete missing hash is a no-op (not an error).

`internal/handler/media_test.go`:

- Upload a 1 MiB PNG, verify row + disk file.
- Upload an `application/x-bogus` MIME → 415.
- Owner can fetch their own owner-visibility blob; admin can; guru cannot.
- Quota exceeded → 413.

## 11. Open questions

- **CDN**: serve via signed URLs from a CDN? Add later; the API contract is compatible (return `url` field instead of streaming).
- **Image variants**: thumbnails? Recommendation: lazy-generate on first request, cache under `<sha256>.<size>.webp`.
- **Encryption at rest**: out of scope for v1; SQLite + disk encryption belongs at infra layer.
