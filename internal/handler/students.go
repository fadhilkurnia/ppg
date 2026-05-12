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

type Students struct {
	students  *store.Students
	validator *validator.Validate
}

func NewStudents(students *store.Students) *Students {
	return &Students{students: students, validator: validator.New()}
}

var errBadJSON = errors.New("invalid JSON body")

type studentBody struct {
	Name        string  `json:"name"        validate:"required,max=200"`
	Nickname    *string `json:"nickname,omitempty"     validate:"omitempty,max=200"`
	DateOfBirth *string `json:"dateOfBirth,omitempty"  validate:"omitempty,datetime=2006-01-02"`
	Gender      string  `json:"gender"      validate:"required,oneof=male female"`
	Level       string  `json:"level"                  validate:"required,oneof=Caberawit 'Pra Remaja' Remaja 'Pra Nikah'"`
	Kelompok    string  `json:"kelompok"               validate:"required,oneof=California Chicago 'New Hampshire' Canada"`
	City        *string `json:"city,omitempty"         validate:"omitempty,max=200"`
	JoinedAt    *string `json:"joinedAt,omitempty"     validate:"omitempty,datetime=2006-01-02"`
	LeftAt      *string `json:"leftAt,omitempty"       validate:"omitempty,datetime=2006-01-02"`
	LeaveReason *string `json:"leaveReason,omitempty"  validate:"omitempty,max=500"`
	Status      string  `json:"status"      validate:"required,oneof=active left"`
	ParentName  *string `json:"parentName,omitempty"   validate:"omitempty,max=200"`
	ParentPhone *string `json:"parentPhone,omitempty"  validate:"omitempty,max=64"`
	ParentEmail *string `json:"parentEmail,omitempty"  validate:"omitempty,email"`
}

func (h *Students) parse(r *http.Request) (store.StudentInput, error) {
	var b studentBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.StudentInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.StudentInput{}, err
	}

	in := store.StudentInput{
		Name:        strings.TrimSpace(b.Name),
		Nickname:    trimPtr(b.Nickname),
		Gender:      b.Gender,
		Level:       model.StudentLevel(b.Level),
		Kelompok:    b.Kelompok,
		City:        trimPtr(b.City),
		LeaveReason: trimPtr(b.LeaveReason),
		Status:      model.StudentStatus(b.Status),
		ParentName:  trimPtr(b.ParentName),
		ParentPhone: trimPtr(b.ParentPhone),
		ParentEmail: trimPtr(b.ParentEmail),
	}
	if t, err := parseOptionalDate(b.DateOfBirth); err != nil {
		return store.StudentInput{}, err
	} else {
		in.DateOfBirth = t
	}
	if t, err := parseOptionalDate(b.JoinedAt); err != nil {
		return store.StudentInput{}, err
	} else {
		in.JoinedAt = t
	}
	if t, err := parseOptionalDate(b.LeftAt); err != nil {
		return store.StudentInput{}, err
	} else {
		in.LeftAt = t
	}
	return in, nil
}

func parseOptionalDate(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (h *Students) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	gender := q.Get("gender")
	if gender != "" && gender != "male" && gender != "female" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "gender harus 'male' atau 'female'")
		return
	}

	res, err := h.students.List(r.Context(), store.ListParams{
		Query:    q.Get("q"),
		Status:   q.Get("status"),
		Kelompok: q.Get("kelompok"),
		Gender:   gender,
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar Generus")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Students) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	st, err := h.students.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Generus tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data Generus")
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

func (h *Students) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	st, err := h.students.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan Generus")
		return
	}
	httpx.JSON(w, http.StatusCreated, st)
}

func (h *Students) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	st, err := h.students.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Generus tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui Generus")
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

func (h *Students) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.students.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Generus tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus Generus")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
