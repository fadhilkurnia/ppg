package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

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

// SetMyPassword lets the current authenticated user change their own
// password without admin involvement. Bcrypt-hashed via store.SetPassword.
type setMyPasswordBody struct {
	Password string `json:"password"`
}

func (a *Auth) SetMyPassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "no claims in context")
		return
	}
	var b setMyPasswordBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	p := strings.TrimSpace(b.Password)
	if len(p) < 6 {
		httpx.Error(w, http.StatusBadRequest, "weak_password", "Password minimal 6 karakter")
		return
	}
	if len(p) > 200 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Password maksimal 200 karakter")
		return
	}
	if err := a.users.SetPassword(r.Context(), claims.UserID, p); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengubah password")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// UpdateMe lets any authenticated user edit a small subset of their own
// profile fields. Auth-sensitive fields (email, role, active) stay admin-
// only. Photo is handled by a separate multipart endpoint.
type meUpdateBody struct {
	Name     *string `json:"name,omitempty"`
	Nickname *string `json:"nickname,omitempty"`
	Timezone *string `json:"timezone,omitempty"`
	NoHP     *string `json:"noHp,omitempty"`
	Alamat   *string `json:"alamat,omitempty"`
	Desa     *string `json:"desa,omitempty"`
	Daerah   *string `json:"daerah,omitempty"`
	Kelompok *string `json:"kelompok,omitempty"`

	// Taaruf-style self-editable biodata.
	TempatLahir *string `json:"tempatLahir,omitempty"`
	Pendidikan  *string `json:"pendidikan,omitempty"`
	Pekerjaan   *string `json:"pekerjaan,omitempty"`
	Gender      *string `json:"gender,omitempty"`
	HideDob     *bool   `json:"hideDob,omitempty"`
	DateOfBirth *string `json:"dateOfBirth,omitempty"`
}

func (a *Auth) UpdateMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "no claims in context")
		return
	}
	var b meUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	in := store.UserUpdateInput{
		Name:        b.Name,
		Nickname:    b.Nickname,
		NoHP:        b.NoHP,
		Alamat:      b.Alamat,
		Desa:        b.Desa,
		Daerah:      b.Daerah,
		Kelompok:    b.Kelompok,
		TempatLahir: b.TempatLahir,
		Pendidikan:  b.Pendidikan,
		Pekerjaan:   b.Pekerjaan,
		Gender:      b.Gender,
		HideDob:     b.HideDob,
	}
	// Timezone: empty string clears, non-empty sets, nil = don't change.
	if b.Timezone != nil {
		v := strings.TrimSpace(*b.Timezone)
		if v == "" {
			in.ClearTimezone = true
		} else {
			in.Timezone = &v
		}
	}
	if b.DateOfBirth != nil {
		s := strings.TrimSpace(*b.DateOfBirth)
		if s == "" {
			in.ClearDateOfBirth = true
		} else if t, err := time.Parse("2006-01-02", s); err == nil {
			in.DateOfBirth = &t
		}
	}
	u, err := a.users.Update(r.Context(), claims.UserID, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui profil")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}
