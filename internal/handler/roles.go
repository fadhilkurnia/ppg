package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

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

var validRoleID = regexp.MustCompile(`^[a-z0-9_-]+$`)

type createRoleBody struct {
	ID                string    `json:"id" validate:"required,min=2,max=64"`
	Label             string    `json:"label" validate:"required,min=1,max=200"`
	CanLogin          *bool     `json:"canLogin,omitempty"`
	ManageableRoleIDs *[]string `json:"manageableRoleIds,omitempty" validate:"omitempty,max=20,dive,max=64"`
	SortOrder         *int      `json:"sortOrder,omitempty"`
}

type roleUpdateBody struct {
	NewID             *string   `json:"newId,omitempty"             validate:"omitempty,min=2,max=64"`
	Label             *string   `json:"label,omitempty"             validate:"omitempty,max=200"`
	CanLogin          *bool     `json:"canLogin,omitempty"`
	ManageableRoleIDs *[]string `json:"manageableRoleIds,omitempty" validate:"omitempty,max=20,dive,max=64"`
	SortOrder         *int      `json:"sortOrder,omitempty"`
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

func (h *Roles) Create(w http.ResponseWriter, r *http.Request) {
	var b createRoleBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	cleanID := strings.ToLower(strings.TrimSpace(b.ID))
	if !validRoleID.MatchString(cleanID) {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "ID role hanya boleh berisi huruf kecil, angka, strip, atau garis bawah")
		return
	}
	canLogin := true
	if b.CanLogin != nil {
		canLogin = *b.CanLogin
	}
	var manageable []string
	if b.ManageableRoleIDs != nil {
		manageable = *b.ManageableRoleIDs
	}
	sortOrder := 0
	if b.SortOrder != nil {
		sortOrder = *b.SortOrder
	}

	rr, err := h.roles.Create(r.Context(), store.CreateRoleInput{
		ID:                cleanID,
		Label:             b.Label,
		CanLogin:          canLogin,
		ManageableRoleIDs: manageable,
		SortOrder:         sortOrder,
	})
	if err != nil {
		if errors.Is(err, store.ErrRoleConflict) {
			httpx.Error(w, http.StatusConflict, "conflict", "ID role sudah digunakan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambahkan role")
		return
	}
	httpx.JSON(w, http.StatusCreated, rr)
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
	cleanID := strings.ToLower(strings.TrimSpace(id))
	var newIDPtr *string
	if b.NewID != nil {
		cleanNewID := strings.ToLower(strings.TrimSpace(*b.NewID))
		if !validRoleID.MatchString(cleanNewID) {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "ID role baru hanya boleh berisi huruf kecil, angka, strip, atau garis bawah")
			return
		}
		newIDPtr = &cleanNewID
	}

	rr, err := h.roles.Update(r.Context(), cleanID, store.UpdateRoleInput{
		NewID:             newIDPtr,
		Label:             b.Label,
		CanLogin:          b.CanLogin,
		ManageableRoleIDs: b.ManageableRoleIDs,
		SortOrder:         b.SortOrder,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Role tidak ditemukan")
			return
		}
		if errors.Is(err, store.ErrRoleConflict) {
			httpx.Error(w, http.StatusConflict, "conflict", "ID role baru sudah digunakan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui role: "+err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, rr)
}

func (h *Roles) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	err := h.roles.Delete(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Role tidak ditemukan")
			return
		}
		if errors.Is(err, store.ErrSystemRole) {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Role sistem bawaan tidak dapat dihapus")
			return
		}
		if errors.Is(err, store.ErrRoleInUse) {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Role sedang digunakan oleh pengguna dan tidak dapat dihapus")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus role")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
