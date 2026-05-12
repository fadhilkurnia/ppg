package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/oklog/ulid/v2"
	"golang.org/x/crypto/bcrypt"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Auth struct {
	users        *store.Users
	roles        *store.Roles
	jwt          *auth.JWT
	cookieSecure bool
}

func NewAuth(users *store.Users, roles *store.Roles, jwtSvc *auth.JWT, cookieSecure bool) *Auth {
	return &Auth{users: users, roles: roles, jwt: jwtSvc, cookieSecure: cookieSecure}
}

type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	req.Identifier = strings.TrimSpace(req.Identifier)
	if req.Identifier == "" || req.Password == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Email/nama pengguna dan kata sandi wajib diisi")
		return
	}
	lookup := req.Identifier
	if strings.Contains(lookup, "@") {
		lookup = strings.ToLower(lookup)
	}

	user, err := a.users.FindByIdentifier(r.Context(), lookup)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "Email/nama pengguna atau kata sandi salah")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "Email/nama pengguna atau kata sandi salah")
		return
	}

	if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "Akun dinonaktifkan")
		return
	}

	if err := a.issueSession(r, w, user); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

func (a *Auth) Logout(w http.ResponseWriter, _ *http.Request) {
	a.clearCookie(w, auth.CookieName)
	a.clearCookie(w, auth.RefreshCookieName)
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (a *Auth) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "no claims in context")
		return
	}
	user, err := a.users.FindByID(r.Context(), claims.UserID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Pengguna tidak ditemukan")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

// Verify is an alias of Me so SPA boot-time checks have a distinct endpoint.
func (a *Auth) Verify(w http.ResponseWriter, r *http.Request) {
	a.Me(w, r)
}

// Refresh consumes the refresh cookie and rotates both tokens.
func (a *Auth) Refresh(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(auth.RefreshCookieName)
	if err != nil || c.Value == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Refresh token tidak ditemukan")
		return
	}
	claims, err := a.jwt.VerifyRefresh(c.Value)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Refresh token tidak valid")
		return
	}

	stored, err := a.users.GetRefreshJTI(r.Context(), claims.UserID)
	if err != nil || stored == "" || stored != claims.ID {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Refresh token telah dirotasi")
		return
	}

	user, err := a.users.FindByID(r.Context(), claims.UserID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Pengguna tidak ditemukan")
		return
	}

	if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Akun dinonaktifkan")
		return
	}

	if err := a.issueSession(r, w, user); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

func (a *Auth) issueSession(r *http.Request, w http.ResponseWriter, user *model.User) error {
	roles := []string{string(user.Role)}

	if a.roles != nil {
		bindings, err := a.roles.ListBindings(r.Context(), user.ID)
		if err == nil && len(bindings) > 0 {
			roles = roles[:0]
			seen := map[string]struct{}{}
			for _, b := range bindings {
				if _, ok := seen[b.RoleID]; ok {
					continue
				}
				seen[b.RoleID] = struct{}{}
				roles = append(roles, b.RoleID)
			}
		}
	}

	tok, err := a.jwt.IssueWithRoles(user.ID, user.Role, roles)
	if err != nil {
		return err
	}
	a.setCookie(w, auth.CookieName, tok, int(a.jwt.TTL().Seconds()))

	jti := ulid.Make().String()
	refresh, err := a.jwt.IssueRefresh(user.ID, jti)
	if err != nil {
		return err
	}
	if err := a.users.SetRefreshJTI(r.Context(), user.ID, jti); err != nil {
		return err
	}
	a.setCookie(w, auth.RefreshCookieName, refresh, int(a.jwt.RefreshTTL().Seconds()))
	return nil
}

func (a *Auth) setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
	})
}

func (a *Auth) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
