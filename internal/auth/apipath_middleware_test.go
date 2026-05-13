package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// echoHandler returns the request path it received so we can assert on
// how the middleware rewrote (or preserved) the URL.
func echoHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Echo-Path", r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
}

func newReq(t *testing.T, method, target, cookieVal string) *http.Request {
	t.Helper()
	r := httptest.NewRequest(method, target, nil)
	if cookieVal != "" {
		r.AddCookie(&http.Cookie{Name: APIPathCookieName, Value: cookieVal})
	}
	return r
}

func TestDynamicAPIPath_Disabled_PassesThrough(t *testing.T) {
	h := DynamicAPIPath(false)(echoHandler())
	r := newReq(t, http.MethodGet, "/a3f8d2/students", "a3f8d2")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if got, want := w.Header().Get("X-Echo-Path"), "/a3f8d2/students"; got != want {
		t.Errorf("path = %q, want %q (disabled middleware must not rewrite)", got, want)
	}
}

func TestDynamicAPIPath_NoPrefix_PassesThrough(t *testing.T) {
	h := DynamicAPIPath(true)(echoHandler())
	cases := []string{
		"/",
		"/healthz",
		"/api/students",
		"/login",
		"/assets/main.js",
		"/a3f8", // too short
	}
	for _, p := range cases {
		t.Run(p, func(t *testing.T) {
			r := newReq(t, http.MethodGet, p, "")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if got := w.Header().Get("X-Echo-Path"); got != p {
				t.Errorf("path = %q, want %q (non-prefix request must pass through)", got, p)
			}
			if w.Result().StatusCode != http.StatusOK {
				t.Errorf("status = %d, want 200", w.Result().StatusCode)
			}
		})
	}
}

func TestDynamicAPIPath_NotAPrefixSegment_PassesThrough(t *testing.T) {
	// "/a3f8d2continued" looks like a 6-alphanumeric prefix but is followed
	// by more characters in the same segment. Must not be rewritten.
	h := DynamicAPIPath(true)(echoHandler())
	r := newReq(t, http.MethodGet, "/a3f8d2continued", "a3f8d2")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if got := w.Header().Get("X-Echo-Path"); got != "/a3f8d2continued" {
		t.Errorf("path = %q, want passthrough", got)
	}
}

func TestDynamicAPIPath_ValidPrefix_RewritesToCanonical(t *testing.T) {
	h := DynamicAPIPath(true)(echoHandler())
	cases := []struct {
		in   string
		want string
	}{
		{"/a3f8d2", "/api"},
		{"/a3f8d2/", "/api/"},
		{"/a3f8d2/auth/me", "/api/auth/me"},
		{"/a3f8d2/students/abc-123", "/api/students/abc-123"},
		{"/xyz789/auth/me", "/api/auth/me"}, // alphanumeric beyond hex range
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			cookie := tc.in[1:7]
			r := newReq(t, http.MethodGet, tc.in, cookie)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if got := w.Header().Get("X-Echo-Path"); got != tc.want {
				t.Errorf("path = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestDynamicAPIPath_MissingCookie_Forbidden(t *testing.T) {
	h := DynamicAPIPath(true)(echoHandler())
	r := newReq(t, http.MethodGet, "/a3f8d2/students", "")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", w.Result().StatusCode)
	}
	if w.Header().Get("X-Echo-Path") != "" {
		t.Error("downstream handler should not have run")
	}
}

func TestDynamicAPIPath_MismatchedCookie_Forbidden(t *testing.T) {
	h := DynamicAPIPath(true)(echoHandler())
	r := newReq(t, http.MethodGet, "/a3f8d2/students", "deadbe")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", w.Result().StatusCode)
	}
}

func TestDynamicAPIPath_InvalidCookieValue_Forbidden(t *testing.T) {
	// Cookie value is a 6-alphanumeric-looking string but with uppercase;
	// the IsValidPath check inside ReadAPIPathCookie rejects it, so the
	// middleware should refuse the request.
	h := DynamicAPIPath(true)(echoHandler())
	r := newReq(t, http.MethodGet, "/a3f8d2/students", "A3F8D2")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("status = %d, want 403", w.Result().StatusCode)
	}
}
