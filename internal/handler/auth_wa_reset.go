package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type createResetWAChallengeResponse struct {
	Code        string    `json:"code"`
	PollToken   string    `json:"pollToken"`
	WALink      string    `json:"waLink"`
	MessageText string    `json:"messageText"`
	BotPhone    string    `json:"botPhone"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

func (a *Auth) CreateResetWAChallenge(w http.ResponseWriter, r *http.Request) {
	if a.waResets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan reset kata sandi WhatsApp belum dikonfigurasi")
		return
	}

	code, err := generateChallengeCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat kode reset")
		return
	}

	pollToken := ulid.Make().String()
	ttl := 15 * time.Minute

	challenge, err := a.waResets.Create(r.Context(), code, pollToken, ttl)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat sesi reset kata sandi")
		return
	}

	botPhone := a.botPhone
	if botPhone == "" {
		botPhone = "6287781485093"
	}

	msgText := "RESET " + code
	waLink := fmt.Sprintf("https://wa.me/%s?text=%s", botPhone, url.QueryEscape(msgText))

	httpx.JSON(w, http.StatusOK, createResetWAChallengeResponse{
		Code:        code,
		PollToken:   pollToken,
		WALink:      waLink,
		MessageText: msgText,
		BotPhone:    botPhone,
		ExpiresAt:   challenge.ExpiresAt,
	})
}

type pollResetWAStatusResponse struct {
	Status      string `json:"status"`
	PhoneMasked string `json:"phoneMasked,omitempty"`
	UserName    string `json:"userName,omitempty"`
}

func (a *Auth) PollResetWAStatus(w http.ResponseWriter, r *http.Request) {
	if a.waResets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan reset kata sandi belum dikonfigurasi")
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	pollToken := strings.TrimSpace(r.URL.Query().Get("pollToken"))
	if code == "" || pollToken == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parameter code dan pollToken wajib disertakan")
		return
	}

	challenge, err := a.waResets.GetByPoll(r.Context(), code, pollToken)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "Sesi reset tidak ditemukan")
		return
	}

	if challenge.IsExpired() {
		httpx.JSON(w, http.StatusOK, pollResetWAStatusResponse{Status: "expired"})
		return
	}

	var phoneMasked, userName string
	if challenge.Phone != nil && *challenge.Phone != "" {
		phoneMasked = maskPhone(*challenge.Phone)
	}
	if challenge.UserID != nil && *challenge.UserID != "" {
		if u, err := a.users.FindByID(r.Context(), *challenge.UserID); err == nil {
			userName = u.Name
		}
	}

	httpx.JSON(w, http.StatusOK, pollResetWAStatusResponse{
		Status:      string(challenge.Status),
		PhoneMasked: phoneMasked,
		UserName:    userName,
	})
}

type verifyResetWAOTPRequest struct {
	Code      string `json:"code"`
	PollToken string `json:"pollToken"`
	OTP       string `json:"otp"`
}

type verifyResetWAOTPResponse struct {
	OK                bool        `json:"ok"`
	ResetSessionToken string      `json:"resetSessionToken"`
	User              *model.User `json:"user"`
}

func (a *Auth) VerifyResetWAOTP(w http.ResponseWriter, r *http.Request) {
	if a.waResets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan reset kata sandi belum dikonfigurasi")
		return
	}

	var req verifyResetWAOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}

	req.Code = strings.TrimSpace(req.Code)
	req.PollToken = strings.TrimSpace(req.PollToken)
	req.OTP = strings.TrimSpace(req.OTP)

	if req.Code == "" || req.PollToken == "" || req.OTP == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Kode sesi, poll token, dan OTP wajib diisi")
		return
	}

	resetSessionToken := ulid.Make().String() + "-" + randomHex(16)

	challenge, err := a.waResets.VerifyOTP(r.Context(), req.Code, req.PollToken, req.OTP, resetSessionToken)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_otp", err.Error())
		return
	}

	if challenge.UserID == nil || *challenge.UserID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Akun pengguna belum teridentifikasi")
		return
	}

	user, err := a.users.FindByID(r.Context(), *challenge.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Pengguna tidak ditemukan")
		return
	}

	httpx.JSON(w, http.StatusOK, verifyResetWAOTPResponse{
		OK:                true,
		ResetSessionToken: resetSessionToken,
		User:              user,
	})
}

type completeResetWAPasswordRequest struct {
	ResetSessionToken string `json:"resetSessionToken"`
	NewPassword       string `json:"newPassword"`
	ConfirmPassword   string `json:"confirmPassword"`
}

func (a *Auth) CompleteResetWAPassword(w http.ResponseWriter, r *http.Request) {
	if a.waResets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan reset kata sandi belum dikonfigurasi")
		return
	}

	var req completeResetWAPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}

	req.ResetSessionToken = strings.TrimSpace(req.ResetSessionToken)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	req.ConfirmPassword = strings.TrimSpace(req.ConfirmPassword)

	if req.ResetSessionToken == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Sesi reset tidak valid")
		return
	}

	if len(req.NewPassword) < 6 {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Kata sandi baru minimal 6 karakter")
		return
	}

	if req.ConfirmPassword != "" && req.NewPassword != req.ConfirmPassword {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Konfirmasi kata sandi tidak cocok")
		return
	}

	challenge, err := a.waResets.GetByResetSessionToken(r.Context(), req.ResetSessionToken)
	if err != nil || challenge.Status != store.WAResetVerified || challenge.IsExpired() {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Sesi reset kata sandi tidak valid atau telah kedaluwarsa")
		return
	}

	if challenge.UserID == nil || *challenge.UserID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Pengguna tidak valid")
		return
	}

	if err := a.users.SetPassword(r.Context(), *challenge.UserID, req.NewPassword); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui kata sandi: "+err.Error())
		return
	}

	_ = a.waResets.MarkConsumed(r.Context(), req.ResetSessionToken)

	user, err := a.users.FindByID(r.Context(), *challenge.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
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
