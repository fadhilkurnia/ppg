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
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Rencana struct {
	r         *store.RencanaStore
	validator *validator.Validate
}

func NewRencana(r *store.RencanaStore) *Rencana {
	return &Rencana{r: r, validator: validator.New()}
}

func (h *Rencana) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tahun, _ := strconv.Atoi(q.Get("tahun"))
	bulan, _ := strconv.Atoi(q.Get("bulan"))
	list, err := h.r.List(r.Context(), strings.TrimSpace(q.Get("kelasId")), tahun, bulan)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil rencana")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Rencana) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rb, err := h.r.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Rencana tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil rencana")
		return
	}
	httpx.JSON(w, http.StatusOK, rb)
}

type rencanaCreateBody struct {
	KelasID string `json:"kelasId" validate:"required"`
	Tahun   int    `json:"tahun"   validate:"required,gte=2000,lte=2200"`
	Bulan   int    `json:"bulan"   validate:"required,gte=1,lte=12"`
}

// Create acts as get-or-create — idempotent for (kelas, tahun, bulan).
func (h *Rencana) Create(w http.ResponseWriter, r *http.Request) {
	var b rencanaCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	var by string
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		by = c.UserID
	}
	rb, err := h.r.GetOrCreate(r.Context(), b.KelasID, b.Tahun, b.Bulan, by)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan rencana")
		return
	}
	httpx.JSON(w, http.StatusCreated, rb)
}

func (h *Rencana) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.r.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Rencana tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus rencana")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

type addItemsBody struct {
	MateriAjarIDs []string `json:"materiAjarIds" validate:"required,min=1"`
}

func (h *Rencana) AddItems(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b addItemsBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.r.AddItems(r.Context(), id, b.MateriAjarIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambah materi ke rencana")
		return
	}
	rb, _ := h.r.Get(r.Context(), id)
	httpx.JSON(w, http.StatusOK, rb)
}

type addLibraryItemBody struct {
	LibraryKind   string `json:"libraryKind"   validate:"required,oneof=quran hadits tilawati doa"`
	LibraryAspect string `json:"libraryAspect" validate:"omitempty,oneof=reciting memorizing review manqul"`
	LibraryRef    string `json:"libraryRef"    validate:"required,max=500"`
}

// AddLibraryItem appends one library-sourced (non-kurikulum) item to the
// rencana. Used by the "+ Library" button beside "+ Dari Kurikulum" in
// the Rencana Ajar tab.
func (h *Rencana) AddLibraryItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b addLibraryItemBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.r.AddLibraryItem(r.Context(), id, b.LibraryKind, b.LibraryAspect, b.LibraryRef); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambah item library")
		return
	}
	rb, _ := h.r.Get(r.Context(), id)
	httpx.JSON(w, http.StatusOK, rb)
}

type toggleItemBody struct {
	Selesai *bool `json:"selesai" validate:"required"`
}

func (h *Rencana) ToggleItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	var b toggleItemBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if b.Selesai == nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Field 'selesai' wajib diisi")
		return
	}
	if err := h.r.ToggleSelesai(r.Context(), itemID, *b.Selesai); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Item rencana tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui item rencana")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Rencana) RemoveItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	if err := h.r.RemoveItem(r.Context(), itemID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Item rencana tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus item rencana")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
