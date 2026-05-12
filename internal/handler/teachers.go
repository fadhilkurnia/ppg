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

type Teachers struct {
	teachers  *store.Teachers
	validator *validator.Validate
}

func NewTeachers(teachers *store.Teachers) *Teachers {
	return &Teachers{teachers: teachers, validator: validator.New()}
}

type teacherBody struct {
	Name      string  `json:"name"      validate:"required,max=200"`
	Nickname  *string `json:"nickname,omitempty"     validate:"omitempty,max=200"`
	Gender    *string `json:"gender,omitempty"       validate:"omitempty,oneof=male female"`
	Kelompok  string  `json:"kelompok"  validate:"required,max=200"`
	Desa      string  `json:"desa"      validate:"required,max=200"`
	Daerah    string  `json:"daerah"    validate:"required,max=200"`
	JoinedAt  *string `json:"joinedAt,omitempty"     validate:"omitempty,datetime=2006-01-02"`
	RetiredAt *string `json:"retiredAt,omitempty"    validate:"omitempty,datetime=2006-01-02"`
	Status    string  `json:"status"    validate:"required,oneof=active retired"`
	Notes     *string `json:"notes,omitempty"        validate:"omitempty,max=2000"`
}

func (h *Teachers) parse(r *http.Request) (store.TeacherInput, error) {
	var b teacherBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.TeacherInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.TeacherInput{}, err
	}

	in := store.TeacherInput{
		Name:     strings.TrimSpace(b.Name),
		Nickname: trimPtr(b.Nickname),
		Gender:   trimPtr(b.Gender),
		Kelompok: strings.TrimSpace(b.Kelompok),
		Desa:     strings.TrimSpace(b.Desa),
		Daerah:   strings.TrimSpace(b.Daerah),
		Status:   model.TeacherStatus(b.Status),
		Notes:    trimPtr(b.Notes),
	}
	if b.JoinedAt != nil && *b.JoinedAt != "" {
		t, err := time.Parse("2006-01-02", *b.JoinedAt)
		if err != nil {
			return store.TeacherInput{}, err
		}
		in.JoinedAt = &t
	}
	if b.RetiredAt != nil && *b.RetiredAt != "" {
		t, err := time.Parse("2006-01-02", *b.RetiredAt)
		if err != nil {
			return store.TeacherInput{}, err
		}
		in.RetiredAt = &t
	}
	return in, nil
}

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

func (h *Teachers) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	// gender accepts "male" or "female"; anything else (including empty)
	// is ignored so the legacy two-arg query still works.
	gender := q.Get("gender")
	if gender != "" && gender != "male" && gender != "female" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "gender harus 'male' atau 'female'")
		return
	}

	res, err := h.teachers.List(r.Context(), store.TeacherListParams{
		Query:   q.Get("q"),
		Status:  q.Get("status"),
		Daerah:  q.Get("daerah"),
		Gender:  gender,
		SortBy:  q.Get("sortBy"),
		SortDir: q.Get("sortDir"),
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Teachers) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tt, err := h.teachers.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, tt)
}

func (h *Teachers) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	tt, err := h.teachers.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan Pengajar")
		return
	}
	httpx.JSON(w, http.StatusCreated, tt)
}

func (h *Teachers) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	tt, err := h.teachers.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, tt)
}

func (h *Teachers) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.teachers.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus Pengajar")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
