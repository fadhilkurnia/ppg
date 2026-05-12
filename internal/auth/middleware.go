package auth

import (
	"context"
	"net/http"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

const (
	CookieName        = "auth"
	RefreshCookieName = "auth_refresh"
)

type ctxKey int

const claimsKey ctxKey = 1

// IsAdmin reports whether the claims grant global admin authority.
func IsAdmin(c *Claims) bool {
	if c == nil {
		return false
	}
	if c.Role == model.RoleAdmin {
		return true
	}
	for _, r := range c.Roles {
		if r == string(model.RoleAdmin) {
			return true
		}
	}
	return false
}

func Middleware(j *JWT) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(CookieName)
			if err != nil || c.Value == "" {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
				return
			}
			claims, err := j.Verify(c.Value)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid atau telah berakhir")
				return
			}
			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(role model.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, ok := ClaimsFrom(r.Context())
			if !ok || c.Role != role {
				httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func ClaimsFrom(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(claimsKey).(*Claims)
	return c, ok
}
