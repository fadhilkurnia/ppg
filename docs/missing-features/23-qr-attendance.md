---
topic: QR code attendance proof
depends-on: [22-sesi-system.md]
enables: []
key-concepts: [ephemeral-token, rotating-qr, self-service-attendance, replay-protection]
---

# 23 — QR Attendance Proof

## TL;DR

Each `sesi` has an optional **ephemeral QR token** (`sesi.qr_token`, `sesi.qr_token_expires_at`) the guru can rotate from the Ruang Sesi page. Murid scan the QR with the SPA (or a future mobile app) and the SPA calls `POST /api/sesi/{id}/attendances/self` with the token. The server validates the token (signed HMAC over `sesi_id + nonce`), records the attendance as `via_qr=1`, and emits a real-time event so the guru's roster updates immediately.

Checklist:

- [ ] Already covered by [22-sesi-system.md](./22-sesi-system.md) schema (`qr_token`, `qr_token_expires_at`).
- [ ] Implement token rotation endpoint.
- [ ] Implement self-attendance endpoint.
- [ ] Implement QR display in the React SPA.
- [ ] Implement QR scanning in the React SPA (use `@zxing/browser`, the same library gnrs uses).
- [ ] Document the threat model.

---

## 1. Why this is needed

Manual attendance has two known failure modes:

1. **Guru workload**: in a 30-murid kelas the guru spends 5 minutes ticking names.
2. **Proxy attendance**: a guru can mark a murid present even if absent.

QR proof addresses both: the guru shows a code on screen; only murid physically present at the start of the session can scan it. Each scan creates a server-side audit row with `via_qr=1` and the server clock as `recorded_at`.

gnrs already has this UI (`AttendanceProofScanner.vue`, `gnrsQr.ts`). ppgus needs the same backend + a matching SPA component.

## 2. Token design

### 2.1 Shape

The QR encodes a string of the form:

```
ppgus:atd:1:<sesi_id>:<expires_unix>:<base64url_sig>
```

Where:

- `1` is a format version (room for evolution).
- `sesi_id` is the ULID.
- `expires_unix` is the token expiry in Unix seconds.
- `sig` = base64url( HMAC-SHA256( JWT_SECRET, "ppgus:atd:1:" + sesi_id + ":" + expires_unix ) )

The server validates by recomputing the HMAC. The token is **self-contained**: there is no per-token DB row to write.

### 2.2 Rotation cadence

The QR rotates every **30 seconds**. The SPA refetches the current QR on a 5-second interval; the backend always returns a token valid for at least 25 more seconds, generating a new one when ≤ 5 s remain.

```go
func (s *Sesi) CurrentQRToken(ctx context.Context, sesiID string, secret []byte) (string, time.Time, error) {
    now := time.Now().UTC()
    exp := now.Add(30 * time.Second).Round(time.Second)
    msg := fmt.Sprintf("ppgus:atd:1:%s:%d", sesiID, exp.Unix())
    mac := hmac.New(sha256.New, secret)
    mac.Write([]byte(msg))
    sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
    return msg + ":" + sig, exp, nil
}
```

The server may also cache `(sesi_id, qr_token, qr_token_expires_at)` on `sesi` for display, but verification does **not** require a DB lookup — only the secret.

### 2.3 Verification

```go
func (s *Sesi) VerifyQRToken(token, sesiID string, secret []byte, now time.Time) error {
    parts := strings.Split(token, ":")
    if len(parts) != 6 || parts[0] != "ppgus" || parts[1] != "atd" || parts[2] != "1" {
        return ErrBadToken
    }
    if parts[3] != sesiID {
        return ErrBadToken
    }
    exp, err := strconv.ParseInt(parts[4], 10, 64)
    if err != nil || time.Unix(exp, 0).Before(now) {
        return ErrExpired
    }
    msg := strings.Join(parts[:5], ":")
    expected := signHMAC(secret, msg)
    if !hmac.Equal([]byte(expected), []byte(parts[5])) {
        return ErrBadSignature
    }
    return nil
}
```

## 3. API contract

### 3.1 Get current QR (guru)

```
GET /api/sesi/{id}/qr
```

Response:

```json
{
  "data": {
    "token": "ppgus:atd:1:01HZQK...:1748000400:abc123",
    "expiresAt": "2026-05-12T18:00:00Z"
  }
}
```

Auth: requester must be the kelas's guru, or admin / pengurus in that scope.

### 3.2 Submit attendance (murid)

```
POST /api/sesi/{id}/attendances/self
{ "qrToken": "ppgus:atd:1:01HZQK...:1748000400:abc123" }
```

Response:

```json
{ "data": { "sesiId": "01HZQK...", "userId": "01HZQM...", "status": "hadir", "recordedAt": "2026-05-12T17:59:45Z" } }
```

Side effects:

- Inserts `sesi_attendances` row with `status='hadir'`, `via_qr=1`, `recorded_by_user_id=NULL`.
- Emits `sesi:attendance_updated` to the kelas room.
- Increments rate-limit counter (see §5).

### 3.3 Stop QR (guru)

```
POST /api/sesi/{id}/qr/stop
```

Sets `qr_token=NULL` so display refresh returns 404 — useful to lock attendance after a grace period.

## 4. Frontend

### 4.1 QR display (guru)

`web/app/src/components/SesiQRDisplay.tsx`:

- Uses `qrcode` npm package (same as gnrs) to render `token` to a `<canvas>`.
- Refetches via TanStack Query every 5 s.
- Counts down `expiresAt - now` to show a progress ring.
- Optional "Stop QR" button.

### 4.2 Scanner (murid)

`web/app/src/routes/_authed/sesi/$sesiId/scan.tsx`:

- Uses `@zxing/browser` (added to `web/app/package.json` as a new dep).
- Asks for camera permission; falls back to manual entry.
- On detect, POSTs `/api/sesi/{id}/attendances/self`.
- On success, shows confirmation; on 410/expired, asks to scan again.

Bundle impact: zxing ≈ 95 kB gzipped. Lazy-load via TanStack Router's code-splitting so non-murid bundles don't carry it.

## 5. Threat model & mitigations

| Threat | Mitigation |
|---|---|
| **Replay** — a murid scans a token, then forwards it to absent friends | 30-second TTL caps replay window. Server checks `recorded_at` against `qr_token_expires_at` (stored on sesi for current display) — too-late submissions return `410 token_expired`. |
| **Cross-sesi reuse** — a murid scans Sesi A's token, then submits to Sesi B's endpoint | Token embeds `sesi_id`; signature would fail for any other sesi. |
| **Token forgery** | HMAC with `JWT_SECRET`. Without the secret, no valid signature can be produced. |
| **Camera/photo leak** — a screenshot of the QR shared in chat | Rotation every 30 s makes screenshots stale quickly. The guru can also "Stop QR" once attendance window closes. |
| **Identity spoofing** | The endpoint requires an authenticated murid session. The token alone is not enough; the murid must be logged in. |
| **Brute-force signature** | HMAC-SHA256 with a 32-byte secret resists brute-force. Rate-limit `/attendances/self` to 5 requests / minute per user to slow online attempts. |
| **Multiple devices for one user** | The unique key `(sesi_id, user_id)` makes the second submission a no-op (idempotent). |
| **Pre-emptive scan before sesi starts** | Endpoint returns `409 sesi_not_active` unless `status='active'`. |

### 5.1 Rate limiting

Add a tiny in-memory token-bucket limiter keyed by user_id:

```go
// internal/middleware/rate_limit.go
func PerUserLimiter(per time.Duration, burst int) func(http.Handler) http.Handler { ... }
```

Apply to `/api/sesi/*/attendances/self`. If the burst is exceeded → 429 with `Retry-After`.

## 6. Validation rules

`SelfAttendanceRequest`:

| Field | Rule |
|---|---|
| `qrToken` | `required,min=20,max=512` |

Server-side post-validation:

- Sesi must be `status='active'`.
- Requester must be enrolled in the sesi's kelas.
- Token signature must validate; expiry must be in the future.

## 7. Test plan

`internal/store/sesi_test.go` (additions):

- `VerifyQRToken` accepts a freshly-generated token.
- `VerifyQRToken` rejects expired tokens with `ErrExpired`.
- `VerifyQRToken` rejects mismatched sesi_id with `ErrBadToken`.
- `VerifyQRToken` rejects forged signature with `ErrBadSignature`.

`internal/handler/sesi_test.go`:

- POST self-attendance with a valid token returns 200; row has `via_qr=1`.
- POST with an expired token returns 410.
- POST when sesi is `upcoming` returns 409.
- POST twice with the same token by the same user is idempotent.

## 8. Open questions

- **Geofence**: should self-attendance require a coarse GPS check (within ~250 m of the kelompok address)? Defer; not in v1.
- **Offline scans**: should a scan that happens during a network drop queue and submit later? Defer; requires service worker support ([51](./51-frontend-evolution.md)).
- **Audible / tactile confirmation**: nice to have; not blocking.
