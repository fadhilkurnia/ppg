package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Kurikulum struct {
	k         *store.Kurikulum
	validator *validator.Validate
}

func NewKurikulum(k *store.Kurikulum) *Kurikulum {
	return &Kurikulum{k: k, validator: validator.New()}
}

type tingkatBody struct {
	Nama   string `json:"nama"   validate:"required,max=100"`
	Urutan int    `json:"urutan" validate:"min=0"`
	Umur   *int   `json:"umur,omitempty" validate:"omitempty,min=1,max=120"`
}

type materiAjarBody struct {
	TingkatID      string  `json:"tingkatId"      validate:"required,min=1"`
	Nomor          int     `json:"nomor"          validate:"min=1"`
	SumberNo       *int    `json:"sumberNo,omitempty" validate:"omitempty,min=1"`
	Tema           string  `json:"tema"           validate:"required,max=200"`
	SubTema        string  `json:"subTema"        validate:"required,max=200"`
	Rincian        *string `json:"rincian,omitempty" validate:"omitempty,max=500"`
	Materi         string  `json:"materi"         validate:"required,max=1000"`
	Cakupan        *string `json:"cakupan,omitempty" validate:"omitempty,max=200"`
	Jenis          string  `json:"jenis"          validate:"omitempty,oneof=baru lanjutan mengulang"`
	TargetSemester *string `json:"targetSemester,omitempty" validate:"omitempty,max=500"`
	Deskripsi      *string `json:"deskripsi,omitempty" validate:"omitempty,max=2000"`
	StatusPromes   *string `json:"statusPromes,omitempty" validate:"omitempty,max=500"`
	Keterangan     *string `json:"keterangan,omitempty" validate:"omitempty,max=500"`
	Semester       *int    `json:"semester,omitempty" validate:"omitempty,oneof=1 2"`
}

func (h *Kurikulum) ListTingkat(w http.ResponseWriter, r *http.Request) {
	ts, err := h.k.ListTingkat(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil tingkat")
		return
	}
	httpx.JSON(w, http.StatusOK, ts)
}

func (h *Kurikulum) ListMateriAjar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	semester, _ := strconv.Atoi(q.Get("semester"))
	ms, err := h.k.ListMateriAjar(r.Context(), store.MateriAjarListParams{
		TingkatID: q.Get("tingkatId"),
		Semester:  semester,
		Tema:      q.Get("tema"),
		Query:     q.Get("q"),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil materi ajar")
		return
	}
	httpx.JSON(w, http.StatusOK, ms)
}

func (h *Kurikulum) CreateTingkat(w http.ResponseWriter, r *http.Request) {
	var b tingkatBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	t, err := h.k.CreateTingkat(r.Context(), store.TingkatInput{Nama: b.Nama, Urutan: b.Urutan, Umur: b.Umur})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat tingkat")
		return
	}
	httpx.JSON(w, http.StatusCreated, t)
}

func (h *Kurikulum) UpdateTingkat(w http.ResponseWriter, r *http.Request) {
	var b tingkatBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	t, err := h.k.UpdateTingkat(r.Context(), chi.URLParam(r, "id"), store.TingkatInput{Nama: b.Nama, Urutan: b.Urutan, Umur: b.Umur})
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "not_found", "Tingkat tidak ditemukan")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui tingkat")
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *Kurikulum) DeleteTingkat(w http.ResponseWriter, r *http.Request) {
	err := h.k.DeleteTingkat(r.Context(), chi.URLParam(r, "id"))
	switch {
	case errors.Is(err, store.ErrTingkatInUse):
		httpx.Error(w, http.StatusConflict, "tingkat_in_use", "Tingkat masih memiliki materi ajar")
	case errors.Is(err, store.ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not_found", "Tingkat tidak ditemukan")
	case err != nil:
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus tingkat")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Kurikulum) CreateMateriAjar(w http.ResponseWriter, r *http.Request) {
	in, err := h.parseMateriAjar(r)
	if err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	m, err := h.k.CreateMateriAjar(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat materi ajar")
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

func (h *Kurikulum) UpdateMateriAjar(w http.ResponseWriter, r *http.Request) {
	in, err := h.parseMateriAjar(r)
	if err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, "validation", err.Error())
		return
	}
	m, err := h.k.UpdateMateriAjar(r.Context(), chi.URLParam(r, "id"), in)
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "not_found", "Materi ajar tidak ditemukan")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui materi ajar")
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

func (h *Kurikulum) DeleteMateriAjar(w http.ResponseWriter, r *http.Request) {
	err := h.k.DeleteMateriAjar(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, store.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "not_found", "Materi ajar tidak ditemukan")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus materi ajar")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Kurikulum) parseMateriAjar(r *http.Request) (store.MateriAjarInput, error) {
	var b materiAjarBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.MateriAjarInput{}, errors.New("JSON tidak valid")
	}
	if err := h.validator.Struct(b); err != nil {
		return store.MateriAjarInput{}, err
	}
	if b.Jenis == "" {
		b.Jenis = "baru"
	}
	return store.MateriAjarInput{
		TingkatID:      b.TingkatID,
		Nomor:          b.Nomor,
		SumberNo:       b.SumberNo,
		Tema:           strings.TrimSpace(b.Tema),
		SubTema:        strings.TrimSpace(b.SubTema),
		Rincian:        trimPtr(b.Rincian),
		Materi:         strings.TrimSpace(b.Materi),
		Cakupan:        trimPtr(b.Cakupan),
		Jenis:          b.Jenis,
		TargetSemester: trimPtr(b.TargetSemester),
		Deskripsi:      trimPtr(b.Deskripsi),
		StatusPromes:   trimPtr(b.StatusPromes),
		Keterangan:     trimPtr(b.Keterangan),
		Semester:       b.Semester,
	}, nil
}

// canManageAchievement gates achievement writes to admin/coordinator/teacher/guru/staff.
func canManageAchievement(r *http.Request) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	allowed := map[model.Role]bool{
		model.RoleAdmin: true,
		model.RoleGuru:  true,
		model.RoleStaff: true,
		"teacher":       true,
		"coordinator":   true,
	}
	if allowed[c.Role] {
		return true
	}
	for _, role := range c.Roles {
		if allowed[model.Role(role)] {
			return true
		}
	}
	return false
}
