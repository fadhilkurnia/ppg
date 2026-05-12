package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Roles struct {
	roles     *store.Roles
	validator *validator.Validate
}

func NewRoles(roles *store.Roles) *Roles {
	return &Roles{roles: roles, validator: validator.New()}
}

type roleUpdateBody struct {
	Label             *string   `json:"label,omitempty"             validate:"omitempty,max=200"`
	CanLogin          *bool     `json:"canLogin,omitempty"`
	ManageableRoleIDs *[]string `json:"manageableRoleIds,omitempty" validate:"omitempty,max=10,dive,max=64"`
}

func (h *Roles) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.roles.List(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar role")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Roles) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rr, err := h.roles.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Role tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil role")
		return
	}
	httpx.JSON(w, http.StatusOK, rr)
}

func (h *Roles) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b roleUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	rr, err := h.roles.Update(r.Context(), id, store.UpdateRoleInput{
		Label:             b.Label,
		CanLogin:          b.CanLogin,
		ManageableRoleIDs: b.ManageableRoleIDs,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Role tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui role")
		return
	}
	httpx.JSON(w, http.StatusOK, rr)
}
