package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type TahunAjaran struct {
	s         *store.TahunAjaranStore
	validator *validator.Validate
}

func NewTahunAjaran(s *store.TahunAjaranStore) *TahunAjaran {
	return &TahunAjaran{s: s, validator: validator.New()}
}

type tahunAjaranBody struct {
	Nama                string  `json:"nama"                validate:"required,max=80"`
	Semester1StartMonth int     `json:"semester1StartMonth" validate:"omitempty,gte=1,lte=12"`
	Semester2StartMonth int     `json:"semester2StartMonth" validate:"omitempty,gte=1,lte=12"`
	TanggalMulai        *string `json:"tanggalMulai,omitempty"`
	TanggalSelesai      *string `json:"tanggalSelesai,omitempty"`
}

func (h *TahunAjaran) parse(r *http.Request) (store.TahunAjaranInput, error) {
	var b tahunAjaranBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.TahunAjaranInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.TahunAjaranInput{}, err
	}
	in := store.TahunAjaranInput{
		Nama:                strings.TrimSpace(b.Nama),
		Semester1StartMonth: b.Semester1StartMonth,
		Semester2StartMonth: b.Semester2StartMonth,
		TanggalMulai:        trimPtr(b.TanggalMulai),
		TanggalSelesai:      trimPtr(b.TanggalSelesai),
	}
	if in.Semester1StartMonth == 0 {
		in.Semester1StartMonth = 7
	}
	if in.Semester2StartMonth == 0 {
		in.Semester2StartMonth = 1
	}
	return in, nil
}

func (h *TahunAjaran) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.s.List(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar tahun ajaran")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *TahunAjaran) Active(w http.ResponseWriter, r *http.Request) {
	t, err := h.s.Active(r.Context())
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.JSON(w, http.StatusOK, nil)
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil tahun ajaran aktif")
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *TahunAjaran) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	t, err := h.s.Create(r.Context(), in)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama tahun ajaran sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan tahun ajaran")
		return
	}
	httpx.JSON(w, http.StatusCreated, t)
}

func (h *TahunAjaran) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	t, err := h.s.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Tahun ajaran tidak ditemukan")
			return
		}
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama tahun ajaran sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui tahun ajaran")
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *TahunAjaran) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Tahun ajaran tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus tahun ajaran")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *TahunAjaran) SetActive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	t, err := h.s.SetActive(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Tahun ajaran tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengaktifkan tahun ajaran")
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}
