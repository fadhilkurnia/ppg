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

type Karakter struct {
	s         *store.KarakterStore
	validator *validator.Validate
}

func NewKarakter(s *store.KarakterStore) *Karakter {
	return &Karakter{s: s, validator: validator.New()}
}

type karakterBody struct {
	Parent       string  `json:"parent"       validate:"required,max=200"`
	ParentEn     *string `json:"parentEn,omitempty"`
	ParentUrutan int     `json:"parentUrutan" validate:"gte=0,lte=1000"`
	LabelID      string  `json:"labelId"      validate:"required,max=300"`
	LabelEn      *string `json:"labelEn,omitempty"`
	ItemUrutan   int     `json:"itemUrutan"   validate:"gte=0,lte=1000"`
	Catatan      *string `json:"catatan,omitempty"`
}

func (h *Karakter) parse(r *http.Request) (store.KarakterInput, error) {
	var b karakterBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.KarakterInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.KarakterInput{}, err
	}
	return store.KarakterInput{
		Parent:       strings.TrimSpace(b.Parent),
		ParentEn:     trimPtr(b.ParentEn),
		ParentUrutan: b.ParentUrutan,
		LabelID:      strings.TrimSpace(b.LabelID),
		LabelEn:      trimPtr(b.LabelEn),
		ItemUrutan:   b.ItemUrutan,
		Catatan:      trimPtr(b.Catatan),
	}, nil
}

func (h *Karakter) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.s.List(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar karakter")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Karakter) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	v, err := h.s.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan karakter")
		return
	}
	httpx.JSON(w, http.StatusCreated, v)
}

func (h *Karakter) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	v, err := h.s.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Karakter tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui karakter")
		return
	}
	httpx.JSON(w, http.StatusOK, v)
}

func (h *Karakter) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Karakter tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus karakter")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// Group-level operations -------------------------------------------------

type groupRenameBody struct {
	Parent       string  `json:"parent"       validate:"required,max=200"`
	ParentEn     *string `json:"parentEn,omitempty"`
	ParentUrutan *int    `json:"parentUrutan,omitempty"`
}

func (h *Karakter) RenameGroup(w http.ResponseWriter, r *http.Request) {
	old := chi.URLParam(r, "parent")
	if old == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parent wajib")
		return
	}
	var b groupRenameBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	n, err := h.s.RenameGroup(r.Context(), old, strings.TrimSpace(b.Parent), trimPtr(b.ParentEn), b.ParentUrutan)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Grup karakter tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui grup")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"updated": n})
}

func (h *Karakter) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	parent := chi.URLParam(r, "parent")
	if parent == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parent wajib")
		return
	}
	n, err := h.s.DeleteGroup(r.Context(), parent)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Grup karakter tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus grup")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"deleted": n})
}
