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

// defaultAPIBase is the canonical API prefix the SPA falls back to when
// no dynamic path is in effect.
const defaultAPIBase = "/api"

type Auth struct {
	users          *store.Users
	roles          *store.Roles
	jwt            *auth.JWT
	cookieSecure   bool
	dynamicAPIPath bool
}

func NewAuth(users *store.Users, roles *store.Roles, jwtSvc *auth.JWT, cookieSecure, dynamicAPIPath bool) *Auth {
	return &Auth{
		users:          users,
		roles:          roles,
		jwt:            jwtSvc,
		cookieSecure:   cookieSecure,
		dynamicAPIPath: dynamicAPIPath,
	}
}

type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

// authResponse extends the public user shape with the resolved API base
// for the current session. apiBase is always populated so callers do not
// have to special-case the dynamic-disabled deployment.
type authResponse struct {
	*model.User
	APIBase string `json:"apiBase"`
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

	apiBase := defaultAPIBase
	if a.dynamicAPIPath {
		path, err := auth.GeneratePath()
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat jalur API")
			return
		}
		auth.SetAPIPathCookie(w, path, a.cookieSecure, int(a.jwt.TTL().Seconds()))
		apiBase = "/" + path
	}

	httpx.JSON(w, http.StatusOK, authResponse{User: user, APIBase: apiBase})
}

func (a *Auth) Logout(w http.ResponseWriter, _ *http.Request) {
	a.clearCookie(w, auth.CookieName)
	a.clearCookie(w, auth.RefreshCookieName)
	auth.ClearAPIPathCookie(w, a.cookieSecure)
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
	apiBase := defaultAPIBase
	if a.dynamicAPIPath {
		if p, ok := auth.ReadAPIPathCookie(r); ok {
			apiBase = "/" + p
		}
	}
	httpx.JSON(w, http.StatusOK, authResponse{User: user, APIBase: apiBase})
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

	apiBase := defaultAPIBase
	if a.dynamicAPIPath {
		if p, ok := auth.ReadAPIPathCookie(r); ok {
			apiBase = "/" + p
		}
	}
	httpx.JSON(w, http.StatusOK, authResponse{User: user, APIBase: apiBase})
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
