package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Attendances struct {
	attendances *store.Attendances
	validator   *validator.Validate
}

func NewAttendances(a *store.Attendances) *Attendances {
	return &Attendances{attendances: a, validator: validator.New()}
}

type attendanceBody struct {
	Date        string  `json:"date"               validate:"required,datetime=2006-01-02"`
	DurationMin *int    `json:"durationMin,omitempty" validate:"omitempty,min=0,max=1440"`
	TeacherID   string  `json:"teacherId"          validate:"required,min=1"`
	StudentID   string  `json:"studentId"          validate:"required,min=1"`
	Status      string  `json:"status"             validate:"required,oneof=hadir izin_murid izin_guru by_vn"`
	Materi      *string `json:"materi,omitempty"   validate:"omitempty,max=20000"`
}

func (h *Attendances) parse(r *http.Request) (store.AttendanceInput, error) {
	var b attendanceBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.AttendanceInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.AttendanceInput{}, err
	}
	date, err := time.Parse("2006-01-02", b.Date)
	if err != nil {
		return store.AttendanceInput{}, err
	}
	return store.AttendanceInput{
		Date:        date,
		DurationMin: b.DurationMin,
		TeacherID:   b.TeacherID,
		StudentID:   b.StudentID,
		Status:      model.AttendanceStatus(b.Status),
		Materi:      trimPtr(b.Materi),
	}, nil
}

func (h *Attendances) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	p := store.AttendanceListParams{
		TeacherID: q.Get("teacherId"),
		StudentID: q.Get("studentId"),
		Status:    q.Get("status"),
		Limit:     limit,
		Offset:    offset,
	}
	if v := strings.TrimSpace(q.Get("dateFrom")); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateFrom = &t
		}
	}
	if v := strings.TrimSpace(q.Get("dateTo")); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateTo = &t
		}
	}

	res, err := h.attendances.List(r.Context(), p)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar kehadiran")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Attendances) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	att, err := h.attendances.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kehadiran tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data kehadiran")
		return
	}
	httpx.JSON(w, http.StatusOK, att)
}

func (h *Attendances) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	att, err := h.attendances.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan kehadiran")
		return
	}
	httpx.JSON(w, http.StatusCreated, att)
}

func (h *Attendances) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	att, err := h.attendances.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kehadiran tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui kehadiran")
		return
	}
	httpx.JSON(w, http.StatusOK, att)
}

func (h *Attendances) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.attendances.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kehadiran tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus kehadiran")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
