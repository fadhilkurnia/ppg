package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"net/http"
)

// APIPathCookieName holds the per-session dynamic API prefix. It is a
// 6-character lowercase alphanumeric (base36) string. See
// docs/missing-features/50-security-hardening.md §3.
const APIPathCookieName = "auth_path"

// APIPathLen is the length of a dynamic API prefix in characters.
const APIPathLen = 6

// apiPathAlphabet is the base36 alphabet (0-9, a-z) used to encode a
// dynamic API prefix. Lowercase keeps URLs case-stable and avoids the
// reader confusion that mixed-case identifiers cause.
const apiPathAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

// GeneratePath returns a random APIPathLen-character lowercase
// alphanumeric API prefix. Uses rejection sampling so each character is
// uniformly distributed over the 36-letter alphabet despite 36 not
// dividing 256.
func GeneratePath() (string, error) {
	const n = len(apiPathAlphabet) // 36
	// 252 is the largest multiple of 36 ≤ 255; bytes ≥ 252 are rejected
	// to keep the distribution unbiased.
	const maxAccept = 252

	out := make([]byte, APIPathLen)
	buf := make([]byte, APIPathLen)
	filled := 0
	for filled < APIPathLen {
		if _, err := rand.Read(buf); err != nil {
			return "", fmt.Errorf("read random api path: %w", err)
		}
		for _, b := range buf {
			if b >= maxAccept {
				continue
			}
			out[filled] = apiPathAlphabet[int(b)%n]
			filled++
			if filled == APIPathLen {
				break
			}
		}
	}
	return string(out), nil
}

// IsValidPath reports whether s is a syntactically valid dynamic API
// path (exactly APIPathLen lowercase alphanumeric characters).
func IsValidPath(s string) bool {
	if len(s) != APIPathLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'z':
		default:
			return false
		}
	}
	return true
}

// EqualPath compares two API-path strings in constant time. The caller is
// expected to have length-checked both inputs (via IsValidPath) before
// relying on the result for a security decision.
func EqualPath(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// SetAPIPathCookie writes the dynamic API path cookie. The cookie is
// HttpOnly and SameSite=Lax to match the existing access cookie, and uses
// the same TTL as the access JWT so both expire together.
func SetAPIPathCookie(w http.ResponseWriter, path string, secure bool, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     APIPathCookieName,
		Value:    path,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
	})
}

// ClearAPIPathCookie removes the dynamic API path cookie from the client.
func ClearAPIPathCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     APIPathCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// ReadAPIPathCookie returns the cookie value if present and well formed.
// The second return is false if the cookie is missing or malformed.
func ReadAPIPathCookie(r *http.Request) (string, bool) {
	c, err := r.Cookie(APIPathCookieName)
	if err != nil || c.Value == "" {
		return "", false
	}
	if !IsValidPath(c.Value) {
		return "", false
	}
	return c.Value, true
}
