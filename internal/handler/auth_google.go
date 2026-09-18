package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type googleTokenInfoResponse struct {
	Iss              string `json:"iss"`
	Sub              string `json:"sub"`
	Azp              string `json:"azp"`
	Aud              string `json:"aud"`
	Email            string `json:"email"`
	EmailVerified    any    `json:"email_verified"`
	Name             string `json:"name"`
	Picture          string `json:"picture"`
	GivenName        string `json:"given_name"`
	FamilyName       string `json:"family_name"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

func isEmailVerified(v any) bool {
	switch val := v.(type) {
	case bool:
		return val
	case string:
		return strings.EqualFold(val, "true")
	default:
		return false
	}
}

func verifyGoogleToken(ctx context.Context, token string) (*googleTokenInfoResponse, error) {
	var endpoint string
	if strings.Count(token, ".") == 2 {
		endpoint = "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(token)
	} else {
		endpoint = "https://oauth2.googleapis.com/tokeninfo?access_token=" + url.QueryEscape(token)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gagal menghubungi server Google: %w", err)
	}
	defer resp.Body.Close()

	var info googleTokenInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("respons token Google tidak valid: %w", err)
	}

	if resp.StatusCode != http.StatusOK || info.Error != "" {
		errMsg := info.ErrorDescription
		if errMsg == "" {
			errMsg = info.Error
		}
		if errMsg == "" {
			errMsg = "token tidak valid atau telah kedaluwarsa"
		}
		return nil, errors.New(errMsg)
	}

	if info.Iss != "" && info.Iss != "https://accounts.google.com" && info.Iss != "accounts.google.com" {
		return nil, errors.New("penerbit token Google tidak valid")
	}

	return &info, nil
}

func (a *Auth) GetGoogleConfig(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"enabled":  a.googleClientID != "",
		"clientId": a.googleClientID,
	})
}

func (a *Auth) VerifyGoogleCredential(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Credential string `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}

	credential := strings.TrimSpace(req.Credential)
	if credential == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Token kredensial Google wajib disertakan")
		return
	}

	info, err := verifyGoogleToken(r.Context(), credential)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credential", "Verifikasi Google gagal: "+err.Error())
		return
	}

	if !isEmailVerified(info.EmailVerified) {
		httpx.Error(w, http.StatusBadRequest, "email_not_verified", "Email Google Anda belum diverifikasi oleh Google")
		return
	}

	if a.googleClientID != "" && info.Aud != a.googleClientID && info.Azp != a.googleClientID {
		httpx.Error(w, http.StatusUnauthorized, "invalid_aud", "Kredensial Google ditujukan untuk aplikasi lain")
		return
	}

	email := strings.ToLower(strings.TrimSpace(info.Email))
	sub := strings.TrimSpace(info.Sub)

	user, err := a.users.FindByEmailOrGoogleID(r.Context(), email, sub)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "user_not_found",
			fmt.Sprintf("Email (%s) belum terdaftar.", email))
		return
	}

	if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
		httpx.Error(w, http.StatusUnauthorized, "account_archived", "Akun Anda saat ini dinonaktifkan")
		return
	}

	if sub != "" && (user.GoogleID == nil || *user.GoogleID == "") {
		_ = a.users.LinkGoogleID(r.Context(), user.ID, sub)
	}

	if err := a.issueSession(r, w, user); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat sesi login")
		return
	}

	apiBase := defaultAPIBase
	if a.dynamicAPIPath {
		path, err := auth.GeneratePath()
		if err == nil {
			auth.SetAPIPathCookie(w, path, a.cookieSecure, int(a.jwt.TTL().Seconds()))
			apiBase = "/" + path
		}
	}

	httpx.JSON(w, http.StatusOK, authResponse{
		User:    user,
		APIBase: apiBase,
	})
}

func (a *Auth) LinkGoogleCredential(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Autentikasi diperlukan")
		return
	}

	var req struct {
		Credential string `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}

	credential := strings.TrimSpace(req.Credential)
	if credential == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Token kredensial Google wajib disertakan")
		return
	}

	info, err := verifyGoogleToken(r.Context(), credential)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid_credential", "Verifikasi Google gagal: "+err.Error())
		return
	}

	if !isEmailVerified(info.EmailVerified) {
		httpx.Error(w, http.StatusBadRequest, "email_not_verified", "Email Google Anda belum diverifikasi oleh Google")
		return
	}

	if a.googleClientID != "" && info.Aud != a.googleClientID && info.Azp != a.googleClientID {
		httpx.Error(w, http.StatusUnauthorized, "invalid_aud", "Kredensial Google ditujukan untuk aplikasi lain")
		return
	}

	email := strings.ToLower(strings.TrimSpace(info.Email))
	sub := strings.TrimSpace(info.Sub)

	user, err := a.users.LinkGoogleAccount(r.Context(), claims.UserID, email, sub)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			httpx.Error(w, http.StatusConflict, "conflict", fmt.Sprintf("Email Google (%s) sudah digunakan oleh akun lain", email))
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menautkan akun Google")
		return
	}

	httpx.JSON(w, http.StatusOK, user)
}
