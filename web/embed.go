package web

import (
	"bytes"
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// apiBasePlaceholder is the literal token that the SPA's index.html ships
// with so the server can substitute the per-session API base at serve
// time. See docs/missing-features/50-security-hardening.md §3.3.
const apiBasePlaceholder = "__API_BASE__"

// Config configures the embedded SPA handler. APIBaseFor is invoked for
// every request that serves index.html and must return the API base the
// SPA should call (e.g. "/api" or "/a3f8d2e1b9c7"). Nil falls back to
// "/api" so the static SPA remains usable when the caller does not opt
// into the dynamic-path feature.
type Config struct {
	APIBaseFor func(r *http.Request) string
}

// Handler returns an http.Handler that serves the embedded SPA, falling
// back to index.html for any non-asset path so client-side routing works.
// The handler substitutes apiBasePlaceholder in index.html with the value
// returned by cfg.APIBaseFor. If the SPA bundle hasn't been built yet, it
// returns a helpful 503 instead.
func Handler(cfg Config) (http.Handler, error) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil, err
	}

	indexBytes, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("SPA bundle missing. Run `pnpm --dir web/app build` first, or set DEV=1 to skip serving the SPA."))
		}), nil
	}

	resolve := cfg.APIBaseFor
	if resolve == nil {
		resolve = func(*http.Request) string { return "/api" }
	}

	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		serveIndex := false
		if path == "" || path == "index.html" {
			serveIndex = true
		} else if _, err := fs.Stat(sub, path); err != nil {
			serveIndex = true
		}

		if serveIndex {
			writeIndex(w, indexBytes, resolve(r))
			return
		}
		fileServer.ServeHTTP(w, r)
	}), nil
}

func writeIndex(w http.ResponseWriter, tpl []byte, apiBase string) {
	rendered := bytes.ReplaceAll(tpl, []byte(apiBasePlaceholder), []byte(apiBase))
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	// index.html is now per-session, so caches must not share it across users.
	h.Set("Cache-Control", "no-store")
	_, _ = w.Write(rendered)
}
