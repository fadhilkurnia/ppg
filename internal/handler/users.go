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

type Users struct {
	users     *store.Users
	scopes    *store.Scopes
	roles     *store.Roles
	validator *validator.Validate
}

func NewUsers(users *store.Users, scopes *store.Scopes, roles *store.Roles) *Users {
	return &Users{users: users, scopes: scopes, roles: roles, validator: validator.New()}
}

type userCreateBody struct {
	Email          string  `json:"email"          validate:"required,email,max=200"`
	Username       *string `json:"username,omitempty" validate:"omitempty,max=64"`
	Password       string  `json:"password"       validate:"required,min=8,max=200"`
	Name           string  `json:"name"           validate:"required,max=200"`
	RoleID         string  `json:"roleId"         validate:"required,max=64"`
	PrimaryScopeID *string `json:"primaryScopeId,omitempty" validate:"omitempty,max=64"`
}

type userUpdateBody struct {
	Name     *string `json:"name,omitempty"     validate:"omitempty,max=200"`
	Email    *string `json:"email,omitempty"    validate:"omitempty,email,max=200"`
	Username *string `json:"username,omitempty" validate:"omitempty,max=64"`
}

type passwordBody struct {
	CurrentPassword *string `json:"currentPassword,omitempty"`
	NewPassword     string  `json:"newPassword" validate:"required,min=8,max=200"`
}

type roleBindingBody struct {
	RoleID  string  `json:"roleId"            validate:"required,max=64"`
	ScopeID *string `json:"scopeId,omitempty" validate:"omitempty,max=64"`
}

func (h *Users) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	scopeID := q.Get("scopeId")
	if !requireAdmin(r) {
		if claims, ok := auth.ClaimsFrom(r.Context()); ok && scopeID != "" {
			if !auth.ScopeAllowed(claims, scopeID) {
				httpx.Error(w, http.StatusForbidden, "out_of_scope", "Scope di luar wewenang Anda")
				return
			}
		}
	}

	res, err := h.users.List(r.Context(), store.ListUsersFilter{
		Role:    q.Get("role"),
		ScopeID: scopeID,
		Query:   q.Get("q"),
		Status:  q.Get("status"),
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar pengguna")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Users) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
	}
	user.Password = ""
	httpx.JSON(w, http.StatusOK, user)
}

func (h *Users) Create(w http.ResponseWriter, r *http.Request) {
	var b userCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.ensureCanManage(r, b.RoleID); err != nil {
		writeForbidden(w, err)
		return
	}
	if !requireAdmin(r) && b.PrimaryScopeID != nil {
		if c, ok := auth.ClaimsFrom(r.Context()); ok && !auth.ScopeAllowed(c, *b.PrimaryScopeID) {
			httpx.Error(w, http.StatusForbidden, "out_of_scope", "Scope di luar wewenang Anda")
			return
		}
	}
	user, err := h.users.CreateWithBinding(r.Context(), store.CreateUserInput{
		Email:          b.Email,
		Username:       trimPtr(b.Username),
		Password:       b.Password,
		Name:           strings.TrimSpace(b.Name),
		Role:           model.Role(b.RoleID),
		PrimaryScopeID: trimPtr(b.PrimaryScopeID),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan pengguna: "+err.Error())
		return
	}
	user.Password = ""
	httpx.JSON(w, http.StatusCreated, user)
}

func (h *Users) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.ensureCanReachUser(r, id); err != nil {
		writeForbidden(w, err)
		return
	}
	var b userUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	user, err := h.users.Update(r.Context(), id, store.UpdateUserInput{
		Name:     b.Name,
		Email:    b.Email,
		Username: b.Username,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui pengguna")
		return
	}
	user.Password = ""
	httpx.JSON(w, http.StatusOK, user)
}

func (h *Users) Password(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
		return
	}
	if !auth.IsAdmin(claims) && claims.UserID != id {
		httpx.Error(w, http.StatusForbidden, "forbidden", "Tidak diizinkan mengganti kata sandi pengguna lain")
		return
	}

	var b passwordBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.users.SetPassword(r.Context(), id, b.NewPassword); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengganti kata sandi")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Users) Archive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.ensureCanReachUser(r, id); err != nil {
		writeForbidden(w, err)
		return
	}
	if err := h.users.Archive(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengarsipkan pengguna")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Users) AddRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b roleBindingBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.ensureCanManage(r, b.RoleID); err != nil {
		writeForbidden(w, err)
		return
	}
	if err := h.roles.AddBinding(r.Context(), id, b.RoleID, b.ScopeID, false); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menambah role")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Users) RemoveRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	roleID := chi.URLParam(r, "roleId")
	if err := h.ensureCanManage(r, roleID); err != nil {
		writeForbidden(w, err)
		return
	}
	scopeQ := r.URL.Query().Get("scopeId")
	var scope *string
	if scopeQ != "" {
		scope = &scopeQ
	}
	if err := h.roles.RemoveBinding(r.Context(), id, roleID, scope); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Binding tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus role")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Users) ensureCanManage(r *http.Request, targetRoleID string) error {
	if requireAdmin(r) {
		return nil
	}
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return errors.New("unauthorized")
	}
	actorRoleID := string(c.Role)
	if actorRoleID == "" {
		return errors.New("role_not_manageable")
	}
	role, err := h.roles.Get(r.Context(), actorRoleID)
	if err != nil {
		return errors.New("role_not_manageable")
	}
	if !store.CanManage(role, targetRoleID) {
		return errors.New("role_not_manageable")
	}
	return nil
}

func (h *Users) ensureCanReachUser(r *http.Request, targetUserID string) error {
	if requireAdmin(r) {
		return nil
	}
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return errors.New("unauthorized")
	}
	if c.UserID == targetUserID {
		return nil
	}
	tgt, err := h.users.FindByID(r.Context(), targetUserID)
	if err != nil {
		return err
	}
	if err := h.ensureCanManage(r, string(tgt.Role)); err != nil {
		return err
	}
	if h.scopes != nil {
		tgtScopes, _, err := h.scopes.EffectiveIDs(r.Context(), tgt.ID)
		if err != nil {
			return err
		}
		for sid := range tgtScopes {
			if auth.ScopeAllowed(c, sid) {
				return nil
			}
		}
		if len(tgtScopes) == 0 {
			return errors.New("out_of_scope")
		}
		return errors.New("out_of_scope")
	}
	return nil
}

func writeForbidden(w http.ResponseWriter, err error) {
	code := "forbidden"
	if err != nil {
		switch err.Error() {
		case "role_not_manageable":
			code = "role_not_manageable"
		case "out_of_scope":
			code = "out_of_scope"
		case "unauthorized":
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
			return
		}
	}
	httpx.Error(w, http.StatusForbidden, code, "Akses tidak diizinkan")
}
