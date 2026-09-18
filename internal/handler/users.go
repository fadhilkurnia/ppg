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
	roles     *store.Roles
	validator *validator.Validate
}

func NewUsers(users *store.Users, roles *store.Roles) *Users {
	return &Users{users: users, roles: roles, validator: validator.New()}
}

type userCreateBody struct {
	Email    string  `json:"email"              validate:"required,email,max=200"`
	Username *string `json:"username,omitempty" validate:"omitempty,max=64"`
	Nickname *string `json:"nickname,omitempty" validate:"omitempty,max=100"`
	Phone    *string `json:"phone,omitempty"    validate:"omitempty,max=32"`
	Password string  `json:"password"           validate:"required,min=6,max=200"`
	Name     string  `json:"name"               validate:"required,max=200"`
	RoleID   string  `json:"roleId"             validate:"required,max=64"`
}

type userUpdateBody struct {
	Name     *string `json:"name,omitempty"     validate:"omitempty,max=200"`
	Nickname *string `json:"nickname,omitempty" validate:"omitempty,max=100"`
	Email    *string `json:"email,omitempty"    validate:"omitempty,email,max=200"`
	Username *string `json:"username,omitempty" validate:"omitempty,max=64"`
	Phone    *string `json:"phone,omitempty"    validate:"omitempty,max=32"`
	Daerah   *string `json:"daerah,omitempty"   validate:"omitempty,max=200"`
	Desa     *string `json:"desa,omitempty"     validate:"omitempty,max=200"`
	Kelompok *string `json:"kelompok,omitempty" validate:"omitempty,max=200"`
	Role     *string `json:"role,omitempty"     validate:"omitempty,max=64"`
	Status   *string `json:"status,omitempty"   validate:"omitempty,oneof=active archived pending"`
}

type passwordBody struct {
	CurrentPassword *string `json:"currentPassword,omitempty"`
	NewPassword     string  `json:"newPassword" validate:"required,min=6,max=200"`
}

type roleBindingBody struct {
	RoleID string `json:"roleId" validate:"required,max=64"`
}

func (h *Users) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	res, err := h.users.List(r.Context(), store.ListUsersFilter{
		Role:   q.Get("role"),
		Query:  q.Get("q"),
		Status: q.Get("status"),
		Limit:  limit,
		Offset: offset,
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
	user, err := h.users.CreateWithBinding(r.Context(), store.CreateUserInput{
		Email:    b.Email,
		Username: trimPtr(b.Username),
		Nickname: trimPtr(b.Nickname),
		Phone:    trimPtr(b.Phone),
		Password: b.Password,
		Name:     strings.TrimSpace(b.Name),
		Role:     model.Role(b.RoleID),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan pengguna: "+err.Error())
		return
	}
	user.Password = ""
	httpx.JSON(w, http.StatusCreated, user)
}

type checkUsernameResponse struct {
	Available bool   `json:"available"`
	Message   string `json:"message,omitempty"`
}

func (h *Users) CheckUsername(w http.ResponseWriter, r *http.Request) {
	username := strings.TrimSpace(r.URL.Query().Get("username"))
	excludeID := strings.TrimSpace(r.URL.Query().Get("excludeUserId"))

	if username == "" {
		httpx.JSON(w, http.StatusOK, checkUsernameResponse{
			Available: true,
		})
		return
	}

	if len(username) < 3 {
		httpx.JSON(w, http.StatusOK, checkUsernameResponse{
			Available: false,
			Message:   "Username minimal 3 karakter",
		})
		return
	}

	taken, err := h.users.IsUsernameTaken(r.Context(), username, excludeID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memeriksa username")
		return
	}

	if taken {
		httpx.JSON(w, http.StatusOK, checkUsernameResponse{
			Available: false,
			Message:   "Username sudah digunakan",
		})
		return
	}

	httpx.JSON(w, http.StatusOK, checkUsernameResponse{
		Available: true,
		Message:   "Username tersedia",
	})
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
	var rolePtr *model.Role
	var statusPtr *string
	phonePtr := b.Phone
	if requireAdmin(r) {
		if b.Role != nil && *b.Role != "" {
			r := model.Role(*b.Role)
			rolePtr = &r
		}
		statusPtr = b.Status
	} else if b.Phone != nil {
		trimmed := strings.TrimSpace(*b.Phone)
		if trimmed == "" {
			empty := ""
			phonePtr = &empty
		} else {
			curUser, err := h.users.FindByID(r.Context(), id)
			if err != nil {
				httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
				return
			}
			curPhone := ""
			if curUser.Phone != nil {
				curPhone = strings.TrimSpace(*curUser.Phone)
			}
			if trimmed != curPhone {
				httpx.Error(w, http.StatusForbidden, "forbidden", "Penambahan atau perubahan nomor WhatsApp harus melalui verifikasi WhatsApp")
				return
			}
		}
	}
	user, err := h.users.Update(r.Context(), id, store.UpdateUserInput{
		Name:     b.Name,
		Nickname: b.Nickname,
		Email:    b.Email,
		Username: b.Username,
		Phone:    phonePtr,
		Daerah:   b.Daerah,
		Desa:     b.Desa,
		Kelompok: b.Kelompok,
		Role:     rolePtr,
		Status:   statusPtr,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui pengguna: "+err.Error())
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
	if err := h.roles.AddBinding(r.Context(), id, b.RoleID, false); err != nil {
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
	if err := h.roles.RemoveBinding(r.Context(), id, roleID); err != nil {
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
	return h.ensureCanManage(r, string(tgt.Role))
}

// requireAdmin reports whether the request's claims grant global admin.
func requireAdmin(r *http.Request) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	return auth.IsAdmin(c)
}

func writeForbidden(w http.ResponseWriter, err error) {
	code := "forbidden"
	if err != nil {
		switch err.Error() {
		case "role_not_manageable":
			code = "role_not_manageable"
		case "unauthorized":
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
			return
		}
	}
	httpx.Error(w, http.StatusForbidden, code, "Akses tidak diizinkan")
}
