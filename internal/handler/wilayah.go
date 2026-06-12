package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Wilayah serves the master Daerah -> Desa -> Kelompok tree and its CRUD.
// The read endpoint is available to any authenticated user (the cascading
// dropdowns need it); mutations are admin-gated by the router.
type Wilayah struct {
	wilayah *store.Wilayah
}

func NewWilayah(w *store.Wilayah) *Wilayah { return &Wilayah{wilayah: w} }

type wilayahNameBody struct {
	Name string `json:"name"`
}

func (h *Wilayah) tree(w http.ResponseWriter, r *http.Request) {
	tree, err := h.wilayah.Tree(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data wilayah")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"daerah": tree})
}

// Tree is the public read endpoint.
func (h *Wilayah) Tree(w http.ResponseWriter, r *http.Request) { h.tree(w, r) }

func decodeWilayahName(r *http.Request) (string, bool) {
	var b wilayahNameBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return "", false
	}
	name := strings.TrimSpace(b.Name)
	return name, name != "" && len(name) <= 200
}

// writeMutationResult maps a store mutation error to an HTTP response, or
// re-renders the whole tree on success so the client can replace its state.
func (h *Wilayah) writeMutationResult(w http.ResponseWriter, r *http.Request, err error) {
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Data wilayah tidak ditemukan")
			return
		}
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama sudah dipakai di tingkat yang sama")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan data wilayah")
		return
	}
	h.tree(w, r)
}

// --- Daerah ---------------------------------------------------------------

func (h *Wilayah) CreateDaerah(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeWilayahName(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nama daerah wajib diisi (maks 200)")
		return
	}
	_, err := h.wilayah.CreateDaerah(r.Context(), name)
	h.writeMutationResult(w, r, err)
}

func (h *Wilayah) RenameDaerah(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeWilayahName(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nama daerah wajib diisi (maks 200)")
		return
	}
	h.writeMutationResult(w, r, h.wilayah.RenameDaerah(r.Context(), chi.URLParam(r, "id"), name))
}

func (h *Wilayah) DeleteDaerah(w http.ResponseWriter, r *http.Request) {
	h.writeMutationResult(w, r, h.wilayah.DeleteDaerah(r.Context(), chi.URLParam(r, "id")))
}

// --- Desa -----------------------------------------------------------------

func (h *Wilayah) CreateDesa(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeWilayahName(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nama desa wajib diisi (maks 200)")
		return
	}
	_, err := h.wilayah.CreateDesa(r.Context(), chi.URLParam(r, "daerahId"), name)
	h.writeMutationResult(w, r, err)
}

func (h *Wilayah) RenameDesa(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeWilayahName(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nama desa wajib diisi (maks 200)")
		return
	}
	h.writeMutationResult(w, r, h.wilayah.RenameDesa(r.Context(), chi.URLParam(r, "id"), name))
}

func (h *Wilayah) DeleteDesa(w http.ResponseWriter, r *http.Request) {
	h.writeMutationResult(w, r, h.wilayah.DeleteDesa(r.Context(), chi.URLParam(r, "id")))
}

// --- Kelompok -------------------------------------------------------------

func (h *Wilayah) CreateKelompok(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeWilayahName(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nama kelompok wajib diisi (maks 200)")
		return
	}
	_, err := h.wilayah.CreateKelompok(r.Context(), chi.URLParam(r, "desaId"), name)
	h.writeMutationResult(w, r, err)
}

func (h *Wilayah) RenameKelompok(w http.ResponseWriter, r *http.Request) {
	name, ok := decodeWilayahName(r)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nama kelompok wajib diisi (maks 200)")
		return
	}
	h.writeMutationResult(w, r, h.wilayah.RenameKelompok(r.Context(), chi.URLParam(r, "id"), name))
}

func (h *Wilayah) DeleteKelompok(w http.ResponseWriter, r *http.Request) {
	h.writeMutationResult(w, r, h.wilayah.DeleteKelompok(r.Context(), chi.URLParam(r, "id")))
}
