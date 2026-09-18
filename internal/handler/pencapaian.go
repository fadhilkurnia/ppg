package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Pencapaian struct {
	p         *store.PencapaianStore
	validator *validator.Validate
}

func NewPencapaian(p *store.PencapaianStore) *Pencapaian {
	return &Pencapaian{p: p, validator: validator.New()}
}

type pencapaianBody struct {
	StudentID    string  `json:"studentId"    validate:"required,min=1"`
	MateriAjarID string  `json:"materiAjarId" validate:"required,min=1"`
	Status       string  `json:"status"       validate:"required,oneof=belum proses tuntas"`
	NilaiAngka   *int    `json:"nilaiAngka,omitempty" validate:"omitempty,min=0,max=100"`
	Tanggal      *string `json:"tanggal,omitempty" validate:"omitempty,datetime=2006-01-02"`
	Catatan      *string `json:"catatan,omitempty" validate:"omitempty,max=2000"`
}

type noteBody struct {
	StudentID    string  `json:"studentId"    validate:"required,min=1"`
	MateriAjarID string  `json:"materiAjarId" validate:"required,min=1"`
	Note         string  `json:"note"         validate:"required,min=1,max=2000"`
	Status       *string `json:"status,omitempty" validate:"omitempty,oneof=belum proses tuntas"`
	NilaiAngka   *int    `json:"nilaiAngka,omitempty" validate:"omitempty,min=0,max=100"`
}

// List returns one student's pencapaian across ALL tingkat (all-ages view).
func (h *Pencapaian) List(w http.ResponseWriter, r *http.Request) {
	studentID := r.URL.Query().Get("studentId")
	if studentID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "studentId wajib diisi")
		return
	}
	rows, err := h.p.ListByStudent(r.Context(), studentID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil pencapaian")
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

func (h *Pencapaian) ListNotes(w http.ResponseWriter, r *http.Request) {
	studentID := r.URL.Query().Get("studentId")
	materiAjarID := r.URL.Query().Get("materiAjarId")
	if studentID == "" || materiAjarID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "studentId dan materiAjarId wajib diisi")
		return
	}
	notes, err := h.p.ListNotes(r.Context(), studentID, materiAjarID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil catatan")
		return
	}
	httpx.JSON(w, http.StatusOK, notes)
}

func (h *Pencapaian) CreateNote(w http.ResponseWriter, r *http.Request) {
	if !canManageAchievement(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		return
	}
	var b noteBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	c, _ := auth.ClaimsFrom(r.Context())
	note, err := h.p.CreateNote(r.Context(), store.CreateNoteInput{
		StudentID:    b.StudentID,
		MateriAjarID: b.MateriAjarID,
		Note:         b.Note,
		Status:       b.Status,
		NilaiAngka:   b.NilaiAngka,
		AuthorID:     c.UserID,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan catatan")
		return
	}
	httpx.JSON(w, http.StatusCreated, note)
}

// ClassReport returns the Khayri-style per-tingkat semester report.
func (h *Pencapaian) ClassReport(w http.ResponseWriter, r *http.Request) {
	tingkatID := r.URL.Query().Get("tingkatId")
	semester, _ := strconv.Atoi(r.URL.Query().Get("semester"))
	if tingkatID == "" || semester == 0 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "tingkatId dan semester wajib diisi")
		return
	}
	rows, err := h.p.ClassReport(r.Context(), tingkatID, semester)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil laporan")
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

func (h *Pencapaian) Upsert(w http.ResponseWriter, r *http.Request) {
	if !canManageAchievement(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Akses tidak diizinkan")
		return
	}
	var b pencapaianBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	c, _ := auth.ClaimsFrom(r.Context())
	if b.Status == "belum" {
		b.Tanggal = nil
		b.NilaiAngka = nil
	}
	p, err := h.p.Upsert(r.Context(), store.PencapaianInput{
		StudentID:    b.StudentID,
		MateriAjarID: b.MateriAjarID,
		Status:       b.Status,
		NilaiAngka:   b.NilaiAngka,
		Tanggal:      b.Tanggal,
		Catatan:      trimPtr(b.Catatan),
		RecordedBy:   c.UserID,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan pencapaian")
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

func (h *Pencapaian) Delete(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok || c.Role != model.RoleAdmin {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Hanya admin yang dapat menghapus riwayat penilaian")
		return
	}
	err := h.p.Delete(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "not_found", "Pencapaian tidak ditemukan")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus pencapaian")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Pencapaian) DeleteNote(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok || c.Role != model.RoleAdmin {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Hanya admin yang dapat menghapus riwayat penilaian")
		return
	}
	err := h.p.DeleteNote(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "not_found", "Catatan tidak ditemukan")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus catatan")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// MatrixImport handles POST /pencapaian/matrix/import (admin group). It
// ingests the assessment matrix CSV scoped to one student, tingkat, and
// semester, resolving materi by nomor and applying delta-only updates.
func (h *Pencapaian) MatrixImport(w http.ResponseWriter, r *http.Request) {
	studentID := r.URL.Query().Get("studentId")
	tingkatID := r.URL.Query().Get("tingkatId")
	semester, _ := strconv.Atoi(r.URL.Query().Get("semester"))
	if studentID == "" || tingkatID == "" || semester == 0 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "studentId, tingkatId, dan semester wajib diisi")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, defaultMaxBytes)
	if err := r.ParseMultipartForm(defaultMaxBytes); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large",
				fmt.Sprintf("file exceeds %d bytes", defaultMaxBytes))
			return
		}
		httpx.Error(w, http.StatusBadRequest, "bad_request", "expected multipart/form-data with a 'file' field")
		return
	}

	mode := bulk.ModeUpsert
	if raw := r.FormValue("mode"); raw != "" {
		var err error
		if mode, err = bulk.ParseMode(raw); err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "missing 'file' field")
		return
	}
	defer file.Close()

	body, err := readAllCapped(file, defaultMaxBytes)
	if err != nil {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large",
			fmt.Sprintf("file exceeds %d bytes", defaultMaxBytes))
		return
	}

	imp := store.NewPencapaianMatrix(h.p, studentID, tingkatID, semester)
	report, err := bulk.Process[store.MatrixRow](r.Context(), newBytesReader(body), imp, mode)
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
