package handler

import (
	cryptorand "crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type forgotPasswordRequest struct {
	Identifier string `json:"identifier"`
}

type forgotPasswordResponse struct {
	OK          bool      `json:"ok"`
	ResetToken  string    `json:"resetToken"`
	MaskedPhone string    `json:"maskedPhone"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

func (a *Auth) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	if a.pwResets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan reset kata sandi belum dikonfigurasi")
		return
	}

	var req forgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}

	identifier := strings.TrimSpace(req.Identifier)
	if identifier == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Email, nama pengguna, atau nomor WhatsApp wajib diisi")
		return
	}

	user, err := a.users.FindByIdentifier(r.Context(), identifier)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "user_not_found", "Pengguna atau nomor WhatsApp tidak ditemukan")
		return
	}

	if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
		httpx.Error(w, http.StatusForbidden, "user_archived", "Akun dinonaktifkan")
		return
	}

	// Find the phone to receive the OTP
	targetPhone := ""
	if a.userPhones != nil {
		phones, err := a.userPhones.ListByUserID(r.Context(), user.ID)
		if err == nil && len(phones) > 0 {
			for _, p := range phones {
				if p.IsPrimary {
					targetPhone = p.Phone
					break
				}
			}
			if targetPhone == "" {
				targetPhone = phones[0].Phone
			}
		}
	}
	if targetPhone == "" && user.Phone != nil && *user.Phone != "" {
		targetPhone = *user.Phone
	}

	if targetPhone == "" {
		httpx.Error(w, http.StatusBadRequest, "no_phone", "Akun ini belum memiliki nomor WhatsApp yang terdaftar. Silakan hubungi admin.")
		return
	}

	// Normalize target phone for WhatsApp
	normCandidates := store.NormalizePhone(targetPhone)
	for _, c := range normCandidates {
		if strings.HasPrefix(c, "62") {
			targetPhone = c
			break
		}
	}

	otpCode, err := generateNumericOTP(6)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghasilkan kode OTP")
		return
	}

	resetToken := ulid.Make().String() + "-" + randomHex(8)
	ttl := 15 * time.Minute

	challenge, err := a.pwResets.Create(r.Context(), user.ID, targetPhone, otpCode, resetToken, ttl)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat sesi reset kata sandi")
		return
	}

	// Enqueue to WhatsApp outbox
	userName := user.Name
	if user.Nickname != nil && *user.Nickname != "" {
		userName = *user.Nickname
	}
	msgText := fmt.Sprintf(
		"🔐 *KODE OTP RESET KATA SANDI PPG*\n\n"+
			"Halo *%s*,\n\n"+
			"Berikut kode OTP untuk mengatur ulang kata sandi akun PPG Dashboard Anda:\n\n"+
			"👉 *%s*\n\n"+
			"⏱️ Kode ini berlaku selama 15 menit.\n"+
			"⚠️ *PENTING:* Jangan bagikan kode ini kepada siapapun termasuk pihak PPG demi keamanan akun Anda.",
		userName, otpCode,
	)

	if a.waOutbox != nil {
		_, _ = a.waOutbox.Enqueue(r.Context(), targetPhone, msgText)
	}

	httpx.JSON(w, http.StatusOK, forgotPasswordResponse{
		OK:          true,
		ResetToken:  resetToken,
		MaskedPhone: maskPhone(targetPhone),
		ExpiresAt:   challenge.ExpiresAt,
	})
}

type resetPasswordWithOTPRequest struct {
	ResetToken      string `json:"resetToken"`
	OTP             string `json:"otp"`
	NewPassword     string `json:"newPassword"`
	ConfirmPassword string `json:"confirmPassword"`
}

func (a *Auth) ResetPasswordWithOTP(w http.ResponseWriter, r *http.Request) {
	if a.pwResets == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan reset kata sandi belum dikonfigurasi")
		return
	}

	var req resetPasswordWithOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format JSON tidak valid")
		return
	}

	req.ResetToken = strings.TrimSpace(req.ResetToken)
	req.OTP = strings.TrimSpace(req.OTP)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	req.ConfirmPassword = strings.TrimSpace(req.ConfirmPassword)

	if req.ResetToken == "" || req.OTP == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Token sesi dan kode OTP wajib diisi")
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

	challenge, err := a.pwResets.VerifyAndConsume(r.Context(), req.ResetToken, req.OTP)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_otp", err.Error())
		return
	}

	if err := a.users.SetPassword(r.Context(), challenge.UserID, req.NewPassword); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui kata sandi: "+err.Error())
		return
	}

	user, err := a.users.FindByID(r.Context(), challenge.UserID)
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

// WA Outbox internal endpoints for background daemon
func (a *Auth) GetPendingWAOutbox(w http.ResponseWriter, r *http.Request) {
	if a.waOutbox == nil {
		httpx.JSON(w, http.StatusOK, []model.WAOutboxItem{})
		return
	}

	items, err := a.waOutbox.GetPending(r.Context(), 10)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil {
		items = []model.WAOutboxItem{}
	}
	httpx.JSON(w, http.StatusOK, items)
}

func (a *Auth) MarkWAOutboxSent(w http.ResponseWriter, r *http.Request) {
	if a.waOutbox == nil {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Missing id")
		return
	}
	if err := a.waOutbox.MarkSent(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type markFailedRequest struct {
	Error string `json:"error"`
}

func (a *Auth) MarkWAOutboxFailed(w http.ResponseWriter, r *http.Request) {
	if a.waOutbox == nil {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Missing id")
		return
	}
	var req markFailedRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if err := a.waOutbox.MarkFailed(r.Context(), id, req.Error); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func generateNumericOTP(digits int) (string, error) {
	maxVal := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil)
	n, err := cryptorand.Int(cryptorand.Reader, maxVal)
	if err != nil {
		return "", err
	}
	format := fmt.Sprintf("%%0%dd", digits)
	return fmt.Sprintf(format, n.Int64()), nil
}

func maskPhone(phone string) string {
	clean := strings.TrimSpace(phone)
	if len(clean) <= 6 {
		return clean
	}
	return clean[:4] + "****" + clean[len(clean)-4:]
}
