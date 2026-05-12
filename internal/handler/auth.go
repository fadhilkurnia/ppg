package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

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
	jwt            *auth.JWT
	cookieSecure   bool
	dynamicAPIPath bool
}

func NewAuth(users *store.Users, jwtSvc *auth.JWT, cookieSecure, dynamicAPIPath bool) *Auth {
	return &Auth{
		users:          users,
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
	// Emails are stored lowercase; usernames as-is. Lowercase only when it
	// looks like an email so usernames aren't mangled.
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

	tok, err := a.jwt.Issue(user.ID, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat token")
		return
	}

	ttl := int(a.jwt.TTL().Seconds())
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   ttl,
	})

	apiBase := defaultAPIBase
	if a.dynamicAPIPath {
		path, err := auth.GeneratePath()
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat jalur API")
			return
		}
		auth.SetAPIPathCookie(w, path, a.cookieSecure, ttl)
		apiBase = "/" + path
	}

	httpx.JSON(w, http.StatusOK, authResponse{User: user, APIBase: apiBase})
}

func (a *Auth) Logout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
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
