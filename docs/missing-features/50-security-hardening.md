---
topic: security hardening
depends-on: [12-user-and-roles.md]
enables: [30-real-time-websockets.md]
key-concepts: [httponly-cookie, dynamic-api-path, csrf, shared-secret, csp, rate-limit, refresh-rotation]
---

# 50 — Security Hardening

## TL;DR

Bring ppgus's security posture up to gnrs's: keep tokens HttpOnly (already done), add **refresh-token rotation**, an optional **dynamic per-session API path** for CSRF defense-in-depth, a shared-secret check between an upstream worker (when present) and ppgus, **CSP/HSTS** headers, and **rate limiting** on auth and self-attendance endpoints.

Checklist:

- [ ] Add refresh-token cookie + rotation (`auth_refresh`).
- [ ] Add `users.refresh_jti` for revocation.
- [ ] Add dynamic-API-path mounting (`/{apiPath}/` ↔ `/api/`).
- [ ] Add `X-PPGUS-Worker-Auth` shared-secret check.
- [ ] Add CSP, HSTS, X-Frame-Options, Referrer-Policy headers.
- [ ] Add per-user rate limiter middleware.
- [ ] Document the threat model.

---

## 1. Current state

From the codebase inspection:

- JWT HS256 in HttpOnly cookie `auth`, `SameSite=Strict`, `Secure` only when `COOKIE_SECURE=true`.
- No refresh token; access cookie TTL controlled by `JWT_TTL` (default 24h).
- No CSP / HSTS / X-Frame headers.
- No rate limiting.
- No shared-secret check; the API is open to any caller with a valid cookie.
- Static `/api/*` path; no per-session randomisation.

## 2. Refresh tokens

### 2.1 Cookies

| Cookie | Purpose | TTL | Path | Notes |
|---|---|---|---|---|
| `auth` | Access JWT | 15 minutes | `/` | HttpOnly, Secure (in prod), SameSite=Strict |
| `auth_refresh` | Refresh JWT | 30 days | `/api/auth` | HttpOnly, Secure (in prod), SameSite=Strict |

Limiting `auth_refresh` to `Path=/api/auth` keeps it out of every regular request.

### 2.2 Rotation

`POST /api/auth/refresh`:

1. Read `auth_refresh` cookie; verify signature and expiry.
2. Look up `users.refresh_jti`. If the claim's `jti` != stored → 401 (token reuse → revoke all).
3. Issue a new refresh token with a fresh `jti`; UPDATE `users.refresh_jti`.
4. Issue a new access token; set `auth` and `auth_refresh` cookies.
5. Audit-log `auth.refresh`.

### 2.3 Logout

`POST /api/auth/logout`:

- Clear both cookies (`Max-Age=0`).
- Clear `users.refresh_jti`.
- Audit-log `auth.logout`.

### 2.4 Re-use detection

If the same `jti` is presented twice, the second presentation means an attacker has a stale token (or two devices are racing). Default policy: **revoke** by clearing `refresh_jti`, force re-login on the legitimate user. Audit-log `auth.refresh_reuse_detected`.

## 3. Dynamic per-session API path

(Reference: gnrs's worker injects a 12-hex API path so that browser code calls `/a3f8d2e1b9c7/user/...` instead of `/api/user/...`. This makes CSRF tokens redundant and frustrates automated scanners.)

### 3.1 Generation

On `POST /api/auth/login`:

1. Generate a 12-hex random path: `apiPath := hex.EncodeToString(random(6))`.
2. Set cookie `auth_path=<apiPath>; Path=/; HttpOnly; SameSite=Strict; Max-Age=<sessionTTL>`.
3. Return `{ data: { user, apiBase: "/" + apiPath } }` (the worker / SPA bootstrap reads this).

### 3.2 Routing

Mount routes on **both** the canonical `/api` and the dynamic prefix. The dynamic prefix middleware extracts the prefix from the URL, validates it against the requester's `auth_path` cookie, then strips it and forwards internally to the canonical mux:

```go
r.Use(dynamicAPIPath) // strips and validates
r.Mount("/api", apiRouter) // canonical
```

Validation:

- Must be 12 lowercase hex chars.
- Must match `auth_path` cookie.
- If mismatch or absent, 403 `bad_api_path`.

### 3.3 SPA bootstrap

The embedded SPA reads the path from a `<meta name="ppgus-api-base">` tag the server injects into `index.html` at serve time. The server replaces `__API_BASE__` placeholder with `/` + apiPath.

This is **optional**. If `DYNAMIC_API_PATH=false`, everything falls back to `/api/`.

## 4. Shared-secret worker auth

When ppgus is fronted by a Cloudflare Worker (the gnrs deployment), the worker proves it is the real upstream by sending:

```
X-PPGUS-Worker-Auth: <secret>
```

ppgus's middleware:

```go
if cfg.RequireWorkerAuth {
    if r.Header.Get("X-PPGUS-Worker-Auth") != cfg.WorkerAuthSecret {
        httpx.Error(w, 403, "no_worker_auth", "missing worker auth")
        return
    }
}
```

Env vars:

- `WORKER_AUTH_REQUIRED=true` (default false in dev).
- `WORKER_AUTH_SECRET=<32 byte hex>`.

When the SPA is served directly by Go (`go:embed`), this is off; the SPA path is in-process.

## 5. CSP, HSTS, and friends

Add a `secureHeaders` middleware to the mux:

```go
func secureHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Security-Policy",
            "default-src 'self'; img-src 'self' data: blob:; "+
            "media-src 'self' blob:; "+
            "connect-src 'self' wss: https:; "+
            "style-src 'self' 'unsafe-inline'; "+
            "script-src 'self'; "+
            "frame-ancestors 'none'; base-uri 'none'")
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("Referrer-Policy", "same-origin")
        w.Header().Set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")
        next.ServeHTTP(w, r)
    })
}
```

CSP needs `camera=(self)` to allow the QR scanner ([23](./23-qr-attendance.md)).

For media downloads, set `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`.

## 6. Rate limiting

Per-IP and per-user limiters using a tiny token bucket:

```go
// internal/middleware/ratelimit.go
type Limit struct { Per time.Duration; Burst int }
func PerIPLimiter(l Limit) func(http.Handler) http.Handler
func PerUserLimiter(l Limit) func(http.Handler) http.Handler
```

Apply:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | per-IP 10 / 5 min |
| `POST /api/auth/refresh` | per-user 30 / min |
| `POST /api/sesi/*/attendances/self` | per-user 5 / min |
| `POST /api/users` | per-user 60 / min |
| `POST /api/sesi/*/messages` | per-user 30 / min |

Bursts exceeded → 429 with `Retry-After`.

## 7. Password policy

Centralise in `internal/auth/password.go`:

- Minimum length 10.
- Reject the top-1000 passwords list (embed a tiny list; bigger list is bloat).
- Hash with bcrypt cost 12.
- Audit-log on change.

## 8. Login lockout

After 10 consecutive failed logins for the same identifier in 15 minutes → lock for 15 minutes. State is in `users` columns: `failed_login_count`, `locked_until`.

```sql
ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
```

## 9. Constant-time comparisons

- Always use `crypto/subtle.ConstantTimeCompare` for token comparisons.
- Bcrypt comparison is already constant-time.

## 10. Configuration

| Env var | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | required | HMAC for access + refresh + QR + realtime tokens |
| `JWT_TTL` | 15m | access |
| `JWT_REFRESH_TTL` | 720h | refresh |
| `COOKIE_SECURE` | false | set `Secure` flag |
| `DYNAMIC_API_PATH` | false | enable §3 |
| `WORKER_AUTH_REQUIRED` | false | enforce X-PPGUS-Worker-Auth |
| `WORKER_AUTH_SECRET` | — | shared secret |
| `RATE_LIMIT_LOGIN_PER_IP` | `10:5m` | configurable |
| `LOGIN_LOCKOUT_THRESHOLD` | 10 | failed logins before lock |
| `LOGIN_LOCKOUT_DURATION` | 15m | lock duration |

## 11. Threat model recap

| Threat | Mitigation |
|---|---|
| Stolen access cookie | Short TTL (15 min); refresh rotation; logout revokes |
| Stolen refresh cookie | One-time-use `jti`; rotation detects reuse |
| CSRF | SameSite=Strict + (optional) dynamic API path |
| XSS exfiltrating tokens | HttpOnly cookies (tokens never reach JS); CSP blocks inline scripts |
| Clickjacking | X-Frame-Options=DENY, CSP frame-ancestors none |
| Open redirect | Validate `redirect` query params against an allowlist of internal SPA routes |
| Brute-force login | Per-IP rate limit + per-user lockout |
| Bot scraping of `/api/users` | Dynamic API path + auth required + rate limit |
| Information leak in errors | Stable error codes (`unauthorized`, `forbidden`, `not_found`); never include internal stack traces in JSON |

## 12. Test plan

`internal/auth/jwt_test.go` (additions):

- Refresh with rotated jti succeeds; with stale jti returns 401 and revokes.
- Access token TTL respected.

`internal/handler/auth_test.go`:

- Login lockout activates after threshold.
- Login during lockout returns 423.

`internal/middleware/secure_headers_test.go`:

- All listed headers present.

## 13. Open questions

- **WebAuthn / passkeys**: future; not in v1.
- **Two-factor**: TOTP via `pquerna/otp`; defer.
- **Account recovery flow**: email-based reset via `users.recovery_jti`; defer until email integration ([32](./32-notifications.md) §6) lands.
