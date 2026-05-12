package auth

import (
	"net/http"
	"strings"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
)

// canonicalAPIPrefix is the path under which the API is always mounted on
// the chi router. The dynamic-prefix middleware rewrites any matching
// /{12hex}/* URL to /api/* before the request reaches chi routing.
const canonicalAPIPrefix = "/api"

// DynamicAPIPath returns a middleware that lets clients address the API
// through a per-session prefix that replaces /api. The prefix must:
//   - be the first path segment;
//   - be APIPathHexLen lowercase hex characters;
//   - match the auth_path cookie of the current request, byte-for-byte.
//
// When the prefix is present but the cookie is missing or mismatched the
// middleware refuses the request with 403 bad_api_path. When the URL has
// no dynamic prefix (i.e. starts with /api/ or anything else) the request
// passes through untouched, so canonical /api remains the fallback.
//
// If enabled is false the middleware is a no-op, so deployments with the
// feature flag off pay no cost.
func DynamicAPIPath(enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if !enabled {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := r.URL.Path
			if len(p) < 1+APIPathHexLen || p[0] != '/' {
				next.ServeHTTP(w, r)
				return
			}
			prefix := p[1 : 1+APIPathHexLen]
			if !IsValidPath(prefix) {
				next.ServeHTTP(w, r)
				return
			}
			rest := p[1+APIPathHexLen:]
			if rest != "" && !strings.HasPrefix(rest, "/") {
				next.ServeHTTP(w, r)
				return
			}

			cookieVal, ok := ReadAPIPathCookie(r)
			if !ok || !EqualPath(prefix, cookieVal) {
				httpx.Error(w, http.StatusForbidden, "bad_api_path", "Akses tidak diizinkan")
				return
			}

			newPath := canonicalAPIPrefix + rest
			r2 := r.Clone(r.Context())
			r2.URL.Path = newPath
			r2.URL.RawPath = ""
			next.ServeHTTP(w, r2)
		})
	}
}
