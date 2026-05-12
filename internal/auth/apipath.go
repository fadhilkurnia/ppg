package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
)

// APIPathCookieName holds the per-session dynamic API prefix. It is a
// 12-character lowercase hex string. See docs/missing-features/50-security-hardening.md §3.
const APIPathCookieName = "auth_path"

// apiPathByteLen is the raw entropy in bytes (12 hex chars = 6 bytes).
const apiPathByteLen = 6

// APIPathHexLen is the expected hex-encoded length of a dynamic API prefix.
const APIPathHexLen = apiPathByteLen * 2

// GeneratePath returns a 12-lowercase-hex random API prefix.
func GeneratePath() (string, error) {
	b := make([]byte, apiPathByteLen)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("read random api path: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// IsValidPath reports whether s is a syntactically valid dynamic API path
// (exactly APIPathHexLen lowercase hex characters).
func IsValidPath(s string) bool {
	if len(s) != APIPathHexLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
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
