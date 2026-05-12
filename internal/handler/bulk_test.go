package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func newBulkRouter(t *testing.T) (*chi.Mux, *store.Teachers) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := store.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	teachers := store.NewTeachers(db)
	h := NewBulk(BulkOptions{
		Teachers: store.NewTeachersBulk(teachers),
	})
	r := chi.NewRouter()
	r.Post("/{entity}/bulk", h.Import)
	r.Get("/{entity}/export.csv", h.Export)
	r.Delete("/{entity}/bulk", h.Delete)
	r.Get("/{entity}/bulk/schema", h.Schema)
	return r, teachers
}

func multipartForm(t *testing.T, mode, csv string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if mode != "" {
		_ = mw.WriteField("mode", mode)
	}
	fw, err := mw.CreateFormFile("file", "data.csv")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write([]byte(csv)); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, mw.FormDataContentType()
}

func TestBulkImport_TeachersCreate(t *testing.T) {
	r, _ := newBulkRouter(t)
	csv := "name,nickname,kelompok,desa,daerah,joinedAt,retiredAt,status,notes\n" +
		"Alice,,Pabeta,Malili,Luwu Timur,2024-01-15,,active,\n" +
		"Bob,,Pabeta,Malili,Luwu Timur,2024-02-01,,active,\n"

	body, ct := multipartForm(t, "create", csv)
	req := httptest.NewRequest(http.MethodPost, "/teachers/bulk", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d, want 200; body=%s", w.Code, w.Body.String())
	}
	var report bulk.Report
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if report.Summary.Created != 2 {
		t.Errorf("created = %d, want 2; body=%s", report.Summary.Created, w.Body.String())
	}
}

func TestBulkImport_DefaultModeIsCreate(t *testing.T) {
	r, _ := newBulkRouter(t)
	csv := "name,nickname,kelompok,desa,daerah,joinedAt,retiredAt,status,notes\nAlice,,Pabeta,Malili,Luwu Timur,2024-01-15,,active,\n"

	body, ct := multipartForm(t, "", csv)
	req := httptest.NewRequest(http.MethodPost, "/teachers/bulk", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", w.Code)
	}
}

func TestBulkImport_UpsertOnDuplicate(t *testing.T) {
	r, _ := newBulkRouter(t)
	csv := "name,nickname,kelompok,desa,daerah,joinedAt,retiredAt,status,notes\nAlice,,Pabeta,Malili,Luwu Timur,2024-01-15,,active,\n"

	body, ct := multipartForm(t, "create", csv)
	req := httptest.NewRequest(http.MethodPost, "/teachers/bulk", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("first import status %d", w.Code)
	}

	body, ct = multipartForm(t, "upsert", csv)
	req = httptest.NewRequest(http.MethodPost, "/teachers/bulk", body)
	req.Header.Set("Content-Type", ct)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("second import status %d", w.Code)
	}
	var report bulk.Report
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Summary.Updated != 1 {
		t.Errorf("updated = %d, want 1", report.Summary.Updated)
	}
}

func TestBulkImport_UnknownEntity_404(t *testing.T) {
	r, _ := newBulkRouter(t)
	body, ct := multipartForm(t, "create", "name\nfoo\n")
	req := httptest.NewRequest(http.MethodPost, "/nope/bulk", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("status %d, want 404", w.Code)
	}
}

func TestBulkExport_StreamsCSV(t *testing.T) {
	r, teachers := newBulkRouter(t)
	if _, err := teachers.Create(context.Background(), store.TeacherInput{
		Name: "Alice", Kelompok: "Pabeta", Desa: "Malili", Daerah: "Luwu Timur", Status: "active",
	}); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/teachers/export.csv", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	if got := w.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/csv") {
		t.Errorf("Content-Type = %q", got)
	}
	if !strings.Contains(w.Body.String(), "Alice") {
		t.Errorf("body missing Alice; got: %s", w.Body.String())
	}
}

func TestBulkDelete_Archive(t *testing.T) {
	r, teachers := newBulkRouter(t)
	created, err := teachers.Create(context.Background(), store.TeacherInput{
		Name: "Alice", Kelompok: "Pabeta", Desa: "Malili", Daerah: "Luwu Timur", Status: "active",
	})
	if err != nil {
		t.Fatal(err)
	}
	body := bytes.NewBufferString(`{"ids":["` + created.ID + `"],"mode":"archive"}`)
	req := httptest.NewRequest(http.MethodDelete, "/teachers/bulk", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, body=%s", w.Code, w.Body.String())
	}
	var rep bulk.DeleteReport
	if err := json.Unmarshal(w.Body.Bytes(), &rep); err != nil {
		t.Fatal(err)
	}
	if rep.Summary.Archived != 1 {
		t.Errorf("archived = %d, want 1", rep.Summary.Archived)
	}
}

func TestBulkSchema_ReturnsHeaders(t *testing.T) {
	r, _ := newBulkRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/teachers/bulk/schema", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	headers, _ := got["headers"].([]any)
	if len(headers) == 0 {
		t.Errorf("expected non-empty headers; got: %s", w.Body.String())
	}
}
