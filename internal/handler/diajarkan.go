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

type Diajarkan struct {
	s         *store.DiajarkanStore
	validator *validator.Validate
}

func NewDiajarkan(s *store.DiajarkanStore) *Diajarkan {
	return &Diajarkan{s: s, validator: validator.New()}
}

func (h *Diajarkan) List(w http.ResponseWriter, r *http.Request) {
	sesiID := chi.URLParam(r, "id")
	list, err := h.s.ListBySesi(r.Context(), sesiID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memuat materi diajarkan")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

type diajarkanCreateBody struct {
	Kind          string  `json:"kind"          validate:"required,oneof=kurikulum quran hadits tilawati doa"`
	MateriAjarID  *string `json:"materiAjarId,omitempty"`
	Ref           *string `json:"ref,omitempty"`
	Label         *string `json:"label,omitempty"`
	LibraryAspect *string `json:"libraryAspect,omitempty" validate:"omitempty,oneof=reciting memorizing review manqul"`
}

func (h *Diajarkan) Create(w http.ResponseWriter, r *http.Request) {
	sesiID := chi.URLParam(r, "id")
	var b diajarkanCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	v, err := h.s.Create(r.Context(), sesiID, store.MateriDiajarkanInput{
		Kind:          b.Kind,
		MateriAjarID:  trimPtr(b.MateriAjarID),
		Ref:           trimPtr(b.Ref),
		Label:         trimPtr(b.Label),
		LibraryAspect: trimPtr(b.LibraryAspect),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mencatat materi diajarkan")
		return
	}
	httpx.JSON(w, http.StatusCreated, v)
}

type diajarkanUpdateBody struct {
	NeedsParentReview *bool   `json:"needsParentReview,omitempty"`
	ParentNote        *string `json:"parentNote,omitempty"`
	Completed         *bool   `json:"completed,omitempty"`
}

func (h *Diajarkan) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	var b diajarkanUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	in := store.MateriDiajarkanUpdate{
		NeedsParentReview: b.NeedsParentReview,
		Completed:         b.Completed,
	}
	if b.ParentNote != nil {
		s := strings.TrimSpace(*b.ParentNote)
		in.ParentNote = &s
	}
	v, err := h.s.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Item tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui")
		return
	}
	httpx.JSON(w, http.StatusOK, v)
}

func (h *Diajarkan) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Item tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
