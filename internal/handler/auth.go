package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Auth struct {
	users        *store.Users
	jwt          *auth.JWT
	cookieSecure bool
}

func NewAuth(users *store.Users, jwtSvc *auth.JWT, cookieSecure bool) *Auth {
	return &Auth{users: users, jwt: jwtSvc, cookieSecure: cookieSecure}
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

	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(a.jwt.TTL().Seconds()),
	})

	httpx.JSON(w, http.StatusOK, user)
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
