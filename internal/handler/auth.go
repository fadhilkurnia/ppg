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
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "email and password are required")
		return
	}

	user, err := a.users.FindByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "incorrect email or password")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to look up user")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credentials", "incorrect email or password")
		return
	}

	tok, err := a.jwt.Issue(user.ID, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to issue token")
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
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "user not found")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}
