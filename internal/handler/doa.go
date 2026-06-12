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

type Doa struct {
	s         *store.DoaStore
	validator *validator.Validate
}

func NewDoa(s *store.DoaStore) *Doa { return &Doa{s: s, validator: validator.New()} }

type doaBody struct {
	Nama       string  `json:"nama"       validate:"required,max=200"`
	Deskripsi  *string `json:"deskripsi,omitempty"`
	Aktif      *bool   `json:"aktif,omitempty"`
	TeksArab   *string `json:"teksArab,omitempty"`
	TeksLatin  *string `json:"teksLatin,omitempty"`
	Terjemahan *string `json:"terjemahan,omitempty"`
	Sumber     *string `json:"sumber,omitempty"`
	QuranSurah *int    `json:"quranSurah,omitempty"`
	QuranAyat  *string `json:"quranAyat,omitempty"`
}

func (h *Doa) parse(r *http.Request) (store.DoaInput, error) {
	var b doaBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.DoaInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.DoaInput{}, err
	}
	aktif := true
	if b.Aktif != nil {
		aktif = *b.Aktif
	}
	return store.DoaInput{
		Nama:       strings.TrimSpace(b.Nama),
		Deskripsi:  trimPtr(b.Deskripsi),
		Aktif:      aktif,
		TeksArab:   trimPtr(b.TeksArab),
		TeksLatin:  trimPtr(b.TeksLatin),
		Terjemahan: trimPtr(b.Terjemahan),
		Sumber:     trimPtr(b.Sumber),
		QuranSurah: b.QuranSurah,
		QuranAyat:  trimPtr(b.QuranAyat),
	}, nil
}

func (h *Doa) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	d, err := h.s.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambah doa")
		return
	}
	httpx.JSON(w, http.StatusCreated, d)
}

func (h *Doa) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	d, err := h.s.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Doa tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui doa")
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

func (h *Doa) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Doa tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus doa")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Doa) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	list, err := h.s.List(r.Context(), store.DoaListParams{
		Query: strings.TrimSpace(q.Get("q")),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar doa")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Doa) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	d, err := h.s.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Doa tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil doa")
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

