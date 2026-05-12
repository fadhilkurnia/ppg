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

type Scopes struct {
	scopes    *store.Scopes
	validator *validator.Validate
}

func NewScopes(scopes *store.Scopes) *Scopes {
	return &Scopes{scopes: scopes, validator: validator.New()}
}

type scopeCreateBody struct {
	Kind     string  `json:"kind"     validate:"required,oneof=daerah desa kelompok"`
	Name     string  `json:"name"     validate:"required,max=200"`
	ParentID *string `json:"parentId,omitempty" validate:"omitempty,max=64"`
	Code     *string `json:"code,omitempty"     validate:"omitempty,max=20"`
}

type scopeUpdateBody struct {
	Name   *string `json:"name,omitempty"   validate:"omitempty,max=200"`
	Code   *string `json:"code,omitempty"   validate:"omitempty,max=20"`
	Status *string `json:"status,omitempty" validate:"omitempty,oneof=active archived"`
}

func (h *Scopes) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	items, total, err := h.scopes.List(r.Context(), store.ScopeListParams{
		Kind:     q.Get("kind"),
		ParentID: q.Get("parentId"),
		Status:   q.Get("status"),
		Query:    q.Get("q"),
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar scope")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "total": total})
}

func (h *Scopes) Tree(w http.ResponseWriter, r *http.Request) {
	roots, err := h.scopes.Tree(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membangun pohon scope")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"data": roots})
}

func (h *Scopes) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sc, err := h.scopes.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Scope tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil scope")
		return
	}
	httpx.JSON(w, http.StatusOK, sc)
}

func (h *Scopes) Create(w http.ResponseWriter, r *http.Request) {
	var b scopeCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in := store.CreateScopeInput{
		Kind:     model.ScopeKind(b.Kind),
		Name:     strings.TrimSpace(b.Name),
		ParentID: b.ParentID,
		Code:     b.Code,
	}
	sc, err := h.scopes.Create(r.Context(), in)
	if err != nil {
		if errors.Is(err, store.ErrInvalidParent) {
			httpx.Error(w, http.StatusBadRequest, "invalid_parent", "Parent scope tidak sesuai untuk kind ini")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan scope")
		return
	}
	httpx.JSON(w, http.StatusCreated, sc)
}

func (h *Scopes) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b scopeUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in := store.UpdateScopeInput{Name: b.Name, Code: b.Code}
	if b.Status != nil {
		s := model.ScopeStatus(*b.Status)
		in.Status = &s
	}
	sc, err := h.scopes.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Scope tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui scope")
		return
	}
	httpx.JSON(w, http.StatusOK, sc)
}

func (h *Scopes) Archive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.scopes.Archive(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Scope tidak ditemukan")
			return
		}
		if errors.Is(err, store.ErrHasDescendants) {
			httpx.Error(w, http.StatusConflict, "has_descendants", "Scope masih memiliki turunan aktif")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengarsipkan scope")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// requireAdmin reports whether the request's claims grant global admin.
func requireAdmin(r *http.Request) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	return auth.IsAdmin(c)
}
