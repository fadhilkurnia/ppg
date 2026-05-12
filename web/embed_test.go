package web

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteIndex_SubstitutesPlaceholder(t *testing.T) {
	tpl := []byte(`<!doctype html><html><head>` +
		`<meta name="ppgus-api-base" content="__API_BASE__" />` +
		`</head><body></body></html>`)

	w := httptest.NewRecorder()
	writeIndex(w, tpl, "/a3f8d2e1b9c7")

	body := w.Body.String()
	if strings.Contains(body, "__API_BASE__") {
		t.Errorf("placeholder still present: %s", body)
	}
	if !strings.Contains(body, `content="/a3f8d2e1b9c7"`) {
		t.Errorf("api base not substituted: %s", body)
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type = %q, want text/html", ct)
	}
	if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", cc)
	}
}

func TestWriteIndex_NoPlaceholder_PassesThrough(t *testing.T) {
	tpl := []byte("<!doctype html><html><body>nothing here</body></html>")
	w := httptest.NewRecorder()
	writeIndex(w, tpl, "/api")

	if got, want := w.Body.Bytes(), tpl; !bytes.Equal(got, want) {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestWriteIndex_FallbackBaseCanonical(t *testing.T) {
	tpl := []byte(`<meta name="ppgus-api-base" content="__API_BASE__" />`)
	w := httptest.NewRecorder()
	writeIndex(w, tpl, "/api")

	if got := w.Body.String(); !strings.Contains(got, `content="/api"`) {
		t.Errorf("expected /api substitution, got: %s", got)
	}
}

func TestHandler_NoBundle_ReturnsServiceUnavailable(t *testing.T) {
	// The embedded dist/ in the repo contains only .gitkeep when tests
	// run without `pnpm build`, so Handler should expose a 503. When the
	// SPA bundle is present (e.g. CI after build), skip this assertion.
	h, err := Handler(Config{})
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Result().StatusCode != http.StatusServiceUnavailable {
		t.Skipf("dist/index.html appears to exist (status=%d); skipping no-bundle assertion", w.Result().StatusCode)
	}
}
