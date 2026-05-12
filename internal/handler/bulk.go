package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Bulk wires HTTP routes around the generic bulk pipeline. Each entity is
// registered with its three adapter halves: an import function (closure
// over the typed bulk.Process), an Exporter, and a Deleter.
type Bulk struct {
	maxBytes int64
	imports  map[string]bulkImport
	exports  map[string]bulk.Exporter
	deletes  map[string]bulk.Deleter
}

type bulkImport struct {
	name string
	run  func(ctx context.Context, body []byte, mode bulk.Mode) (*bulk.Report, error)
}

type BulkOptions struct {
	MaxBytes    int64
	Teachers    *store.TeachersBulk
	Students    *store.StudentsBulk
	Attendances *store.AttendancesBulk
	Users       *store.UsersBulk
}

func NewBulk(opt BulkOptions) *Bulk {
	if opt.MaxBytes <= 0 {
		opt.MaxBytes = defaultMaxBytes
	}
	b := &Bulk{
		maxBytes: opt.MaxBytes,
		imports:  map[string]bulkImport{},
		exports:  map[string]bulk.Exporter{},
		deletes:  map[string]bulk.Deleter{},
	}
	if opt.Teachers != nil {
		registerImport(b, opt.Teachers)
		b.exports["teachers"] = opt.Teachers
		b.deletes["teachers"] = opt.Teachers
	}
	if opt.Students != nil {
		registerImport(b, opt.Students)
		b.exports["students"] = opt.Students
		b.deletes["students"] = opt.Students
	}
	if opt.Attendances != nil {
		registerImport(b, opt.Attendances)
		b.exports["attendances"] = opt.Attendances
		b.deletes["attendances"] = opt.Attendances
	}
	if opt.Users != nil {
		registerImport(b, opt.Users)
		b.exports["users"] = opt.Users
		b.deletes["users"] = opt.Users
	}
	return b
}

// registerImport captures the entity's generic type T in a closure so the
// dispatcher can fan out by entity name without exposing T at the HTTP
// boundary.
func registerImport[T any](b *Bulk, imp bulk.Importer[T]) {
	b.imports[imp.Name()] = bulkImport{
		name: imp.Name(),
		run: func(ctx context.Context, body []byte, mode bulk.Mode) (*bulk.Report, error) {
			return bulk.Process[T](ctx, newBytesReader(body), imp, mode)
		},
	}
}

const (
	defaultMaxBytes = 5 * 1024 * 1024 // 5 MB
	maxRows         = 20000
)

// Import handles POST /api/{entity}/bulk.
func (h *Bulk) Import(w http.ResponseWriter, r *http.Request) {
	entity := chi.URLParam(r, "entity")
	imp, ok := h.imports[entity]
	if !ok {
		httpx.Error(w, http.StatusNotFound, "not_found", fmt.Sprintf("bulk import for %q is not supported", entity))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.maxBytes)
	if err := r.ParseMultipartForm(h.maxBytes); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large",
				fmt.Sprintf("file exceeds %d bytes", h.maxBytes))
			return
		}
		httpx.Error(w, http.StatusBadRequest, "bad_request", "expected multipart/form-data with a 'file' field")
		return
	}

	mode, err := bulk.ParseMode(r.FormValue("mode"))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "missing 'file' field")
		return
	}
	defer file.Close()

	body, err := readAllCapped(file, h.maxBytes)
	if err != nil {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large",
			fmt.Sprintf("file exceeds %d bytes", h.maxBytes))
		return
	}

	report, err := imp.run(r.Context(), body, mode)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if report.Summary.Total > maxRows {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large",
			fmt.Sprintf("csv has %d rows; max is %d", report.Summary.Total, maxRows))
		return
	}
	httpx.JSON(w, http.StatusOK, report)
}

// Export handles GET /api/{entity}/export.csv. Streams CSV.
func (h *Bulk) Export(w http.ResponseWriter, r *http.Request) {
	entity := chi.URLParam(r, "entity")
	exp, ok := h.exports[entity]
	if !ok {
		httpx.Error(w, http.StatusNotFound, "not_found", fmt.Sprintf("bulk export for %q is not supported", entity))
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, entity))
	if err := bulk.WriteCSV(r.Context(), w, exp, r.URL.Query()); err != nil {
		// Headers are already on the wire; degrade by closing the connection
		// rather than appending an error payload to the CSV stream.
		return
	}
}

// Delete handles DELETE /api/{entity}/bulk. Body shape:
// `{"ids": ["..."], "mode": "archive" | "hard"}`.
func (h *Bulk) Delete(w http.ResponseWriter, r *http.Request) {
	entity := chi.URLParam(r, "entity")
	del, ok := h.deletes[entity]
	if !ok {
		httpx.Error(w, http.StatusNotFound, "not_found", fmt.Sprintf("bulk delete for %q is not supported", entity))
		return
	}

	var body struct {
		IDs  []string `json:"ids"`
		Mode string   `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	if len(body.IDs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "'ids' is required")
		return
	}
	if len(body.IDs) > maxRows {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large",
			fmt.Sprintf("too many ids: %d; max %d", len(body.IDs), maxRows))
		return
	}
	mode, err := bulk.ParseDeleteMode(body.Mode)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	results := del.BulkDelete(r.Context(), body.IDs, mode)
	httpx.JSON(w, http.StatusOK, bulk.BuildDeleteReport(results, mode))
}

// Schema handles GET /api/{entity}/bulk/schema. Returns the entity's
// expected column names so the frontend can render a column-mapping UI.
func (h *Bulk) Schema(w http.ResponseWriter, r *http.Request) {
	entity := chi.URLParam(r, "entity")
	if exp, ok := h.exports[entity]; ok {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"entity":  entity,
			"headers": exp.Headers(),
		})
		return
	}
	httpx.Error(w, http.StatusNotFound, "not_found", fmt.Sprintf("bulk schema for %q is not supported", entity))
}

// ParseMaxBytesEnv reads BULK_MAX_BYTES; falls back to the default if
// unset, blank, or unparseable.
func ParseMaxBytesEnv(raw string) int64 {
	if raw == "" {
		return defaultMaxBytes
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return defaultMaxBytes
	}
	return n
}

// --- helpers -----------------------------------------------------------

func newBytesReader(body []byte) *bytesReader { return &bytesReader{b: body} }

type bytesReader struct {
	b []byte
	i int
}

func (r *bytesReader) Read(p []byte) (int, error) {
	if r.i >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += n
	return n, nil
}

// readAllCapped reads up to max+1 bytes; returns an error if the source
// would exceed max. Avoids io.ReadAll's unbounded growth.
func readAllCapped(r io.Reader, max int64) ([]byte, error) {
	buf := make([]byte, 0, 64*1024)
	tmp := make([]byte, 32*1024)
	var total int64
	for {
		n, err := r.Read(tmp)
		if n > 0 {
			total += int64(n)
			if total > max {
				return nil, errors.New("upload too large")
			}
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return buf, nil
			}
			return nil, err
		}
	}
}
