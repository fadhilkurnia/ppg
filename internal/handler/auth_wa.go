package handler

import (
	cryptorand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
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

type waChallengeResponse struct {
	Code        string    `json:"code"`
	PollToken   string    `json:"pollToken"`
	WALink      string    `json:"waLink"`
	MessageText string    `json:"messageText"`
	BotPhone    string    `json:"botPhone"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

func (a *Auth) CreateWAChallenge(w http.ResponseWriter, r *http.Request) {
	if a.challenges == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan login WhatsApp belum dikonfigurasi")
		return
	}

	code, err := generateChallengeCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat kode verifikasi")
		return
	}

	pollToken := ulid.Make().String()
	ttl := 10 * time.Minute

	challenge, err := a.challenges.Create(r.Context(), code, pollToken, ttl)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan tantangan login")
		return
	}

	botPhone := a.botPhone
	if botPhone == "" {
		botPhone = "6287781485093"
	}

	msgText := "LOGIN " + code
	waLink := fmt.Sprintf("https://wa.me/%s?text=%s", botPhone, url.QueryEscape(msgText))

	httpx.JSON(w, http.StatusOK, waChallengeResponse{
		Code:        code,
		PollToken:   pollToken,
		WALink:      waLink,
		MessageText: msgText,
		BotPhone:    botPhone,
		ExpiresAt:   challenge.ExpiresAt,
	})
}

type createUserWAChallengeRequest struct {
	Phone string `json:"phone"`
}

func (a *Auth) CreateUserWAChallenge(w http.ResponseWriter, r *http.Request) {
	if a.challenges == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan verifikasi WhatsApp belum dikonfigurasi")
		return
	}

	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
		return
	}

	var req createUserWAChallengeRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	targetPhone := strings.TrimSpace(req.Phone)
	if targetPhone != "" {
		candidates := store.NormalizePhone(targetPhone)
		if len(candidates) == 0 {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Format nomor WhatsApp tidak valid")
			return
		}
		if a.userPhones != nil {
			taken, err := a.userPhones.IsPhoneTaken(r.Context(), targetPhone, claims.UserID)
			if err == nil && taken {
				httpx.Error(w, http.StatusConflict, "conflict", "Nomor WhatsApp ini sudah digunakan oleh akun lain")
				return
			}
		} else if existing, err := a.users.FindByPhone(r.Context(), targetPhone); err == nil && existing.ID != claims.UserID {
			httpx.Error(w, http.StatusConflict, "conflict", "Nomor WhatsApp ini sudah digunakan oleh akun lain")
			return
		}
	}

	code, err := generateChallengeCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat kode verifikasi")
		return
	}

	pollToken := ulid.Make().String()
	ttl := 10 * time.Minute

	challenge, err := a.challenges.CreateForUser(r.Context(), code, pollToken, claims.UserID, targetPhone, ttl)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan tantangan verifikasi")
		return
	}

	botPhone := a.botPhone
	if botPhone == "" {
		botPhone = "6287781485093"
	}

	msgText := "LOGIN " + code
	waLink := fmt.Sprintf("https://wa.me/%s?text=%s", botPhone, url.QueryEscape(msgText))

	httpx.JSON(w, http.StatusOK, waChallengeResponse{
		Code:        code,
		PollToken:   pollToken,
		WALink:      waLink,
		MessageText: msgText,
		BotPhone:    botPhone,
		ExpiresAt:   challenge.ExpiresAt,
	})
}

func (a *Auth) DeleteUserWAPhone(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
		return
	}

	emptyPhone := ""
	_, err := a.users.Update(r.Context(), claims.UserID, store.UpdateUserInput{
		Phone: &emptyPhone,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus nomor WhatsApp: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type waPollResponse struct {
	Status  string      `json:"status"`
	User    *model.User `json:"user,omitempty"`
	APIBase string      `json:"apiBase,omitempty"`
}

func (a *Auth) PollWAChallenge(w http.ResponseWriter, r *http.Request) {
	if a.challenges == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Layanan login WhatsApp belum dikonfigurasi")
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	pollToken := strings.TrimSpace(r.URL.Query().Get("pollToken"))
	if code == "" || pollToken == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parameter code dan pollToken wajib disertakan")
		return
	}

	challenge, err := a.challenges.GetByPoll(r.Context(), code, pollToken)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "Sesi verifikasi tidak ditemukan")
		return
	}

	if challenge.IsExpired() {
		httpx.JSON(w, http.StatusOK, waPollResponse{Status: "expired"})
		return
	}

	if challenge.Status == store.WAChallengeApproved || challenge.Status == store.WAChallengeConsumed {
		if challenge.UserID == nil || *challenge.UserID == "" {
			httpx.JSON(w, http.StatusOK, waPollResponse{Status: "pending"})
			return
		}

		user, err := a.users.FindByID(r.Context(), *challenge.UserID)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Pengguna tidak ditemukan")
			return
		}

		if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Akun dinonaktifkan")
			return
		}

		if err := a.issueSession(r, w, user); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal membuat sesi login")
			return
		}

		if challenge.Status != store.WAChallengeConsumed {
			_ = a.challenges.MarkConsumed(r.Context(), code)
		}

		apiBase := defaultAPIBase
		if a.dynamicAPIPath {
			path, err := auth.GeneratePath()
			if err == nil {
				auth.SetAPIPathCookie(w, path, a.cookieSecure, int(a.jwt.TTL().Seconds()))
				apiBase = "/" + path
			}
		}

		httpx.JSON(w, http.StatusOK, waPollResponse{
			Status:  "approved",
			User:    user,
			APIBase: apiBase,
		})
		return
	}

	httpx.JSON(w, http.StatusOK, waPollResponse{Status: "pending"})
}

type internalWAVerifyRequest struct {
	Code     string `json:"code"`
	Phone    string `json:"phone"`
	Action   string `json:"action,omitempty"`
	SenderID string `json:"senderId,omitempty"`
}

type internalWAVerifyResponse struct {
	Ok        bool   `json:"ok"`
	Type      string `json:"type,omitempty"`
	Error     string `json:"error,omitempty"`
	Name      string `json:"name,omitempty"`
	Username  string `json:"username,omitempty"`
	MagicLink string `json:"magicLink,omitempty"`
	Role      string `json:"role,omitempty"`
	OTP       string `json:"otp,omitempty"`
}

func (a *Auth) InternalWAVerify(w http.ResponseWriter, r *http.Request) {
	var req internalWAVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Payload tidak valid"})
		return
	}

	code := strings.ToUpper(strings.TrimSpace(req.Code))
	phone := strings.TrimSpace(req.Phone)

	if code == "" || phone == "" {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Kode dan nomor telepon wajib diisi"})
		return
	}

	// Check if this is a password reset challenge
	isReset := strings.EqualFold(req.Action, "reset")
	var resetChallenge *store.WAResetChallenge
	if a.waResets != nil {
		if rc, err := a.waResets.GetByCode(r.Context(), code); err == nil {
			resetChallenge = rc
			isReset = true
		}
	}

	if isReset && resetChallenge != nil {
		if resetChallenge.IsExpired() {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
				Ok:    false,
				Type:  "reset",
				Error: "Kode reset verifikasi telah kedaluwarsa. Silakan minta kode baru di aplikasi.",
			})
			return
		}
		if resetChallenge.Status == store.WAResetConsumed {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
				Ok:    false,
				Type:  "reset",
				Error: "Sesi reset kata sandi ini sudah digunakan.",
			})
			return
		}

		user, err := a.users.FindByPhone(r.Context(), phone)
		if err != nil {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
				Ok:    false,
				Type:  "reset",
				Error: fmt.Sprintf("Nomor WhatsApp (%s) belum terdaftar pada akun PPG US manapun", phone),
			})
			return
		}

		if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
				Ok:    false,
				Type:  "reset",
				Error: "Akun Anda saat ini dinonaktifkan. Silakan hubungi admin.",
			})
			return
		}

		otpCode, err := generateNumericOTP(6)
		if err != nil {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
				Ok:    false,
				Type:  "reset",
				Error: "Gagal menghasilkan kode OTP",
			})
			return
		}

		if err := a.waResets.RecordOTPSent(r.Context(), code, phone, user.ID, otpCode); err != nil {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
				Ok:    false,
				Type:  "reset",
				Error: "Gagal memperbarui status verifikasi reset",
			})
			return
		}

		username := ""
		if user.Username != nil {
			username = *user.Username
		}

		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
			Ok:       true,
			Type:     "reset",
			Name:     user.Name,
			Username: username,
			Role:     string(user.Role),
			OTP:      otpCode,
		})
		return
	}

	if a.challenges == nil {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Layanan verifikasi WhatsApp belum aktif"})
		return
	}

	challenge, err := a.challenges.GetByCode(r.Context(), code)
	if err != nil {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Kode login tidak ditemukan atau salah"})
		return
	}

	if challenge.IsExpired() {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Kode verifikasi telah kedaluwarsa. Silakan buat kode baru di aplikasi."})
		return
	}

	if challenge.UserID != nil && *challenge.UserID != "" {
		targetUserID := *challenge.UserID
		user, err := a.users.FindByID(r.Context(), targetUserID)
		if err != nil {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Pengguna tidak ditemukan"})
			return
		}

		if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Akun Anda saat ini dinonaktifkan"})
			return
		}

		if a.userPhones != nil {
			taken, err := a.userPhones.IsPhoneTaken(r.Context(), phone, user.ID)
			if err == nil && taken {
				httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Nomor WhatsApp ini sudah terdaftar pada akun lain"})
				return
			}
		} else if existing, err := a.users.FindByPhone(r.Context(), phone); err == nil && existing.ID != user.ID {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Nomor WhatsApp ini sudah terdaftar pada akun lain"})
			return
		}

		if challenge.Phone != nil && *challenge.Phone != "" {
			expectedCandidates := store.NormalizePhone(*challenge.Phone)
			senderCandidates := store.NormalizePhone(phone)
			matched := false
			for _, exp := range expectedCandidates {
				for _, snd := range senderCandidates {
					if exp == snd {
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}
			if !matched {
				httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
					Ok:    false,
					Error: fmt.Sprintf("Nomor WhatsApp pengirim (%s) tidak cocok dengan nomor yang dimasukkan (%s)", phone, *challenge.Phone),
				})
				return
			}
		}

		savePhone := phone
		for _, c := range store.NormalizePhone(phone) {
			if strings.HasPrefix(c, "62") {
				savePhone = c
				break
			}
		}

		if a.userPhones != nil {
			if _, err := a.userPhones.AddPhone(r.Context(), user.ID, savePhone, false); err != nil {
				httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Gagal menyimpan nomor WhatsApp: " + err.Error()})
				return
			}
		} else {
			if _, err := a.users.Update(r.Context(), user.ID, store.UpdateUserInput{Phone: &savePhone}); err != nil {
				httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Gagal memperbarui nomor WhatsApp pengguna"})
				return
			}
		}

		magicToken := ulid.Make().String() + "-" + randomHex(16)
		if err := a.challenges.Approve(r.Context(), code, savePhone, user.ID, magicToken); err != nil {
			httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Gagal memproses verifikasi kode"})
			return
		}

		username := ""
		if user.Username != nil {
			username = *user.Username
		}

		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
			Ok:       true,
			Name:     user.Name,
			Username: username,
			Role:     string(user.Role),
		})
		return
	}

	user, err := a.users.FindByPhone(r.Context(), phone)
	if err != nil {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: fmt.Sprintf("Nomor WhatsApp (%s) belum terdaftar di sistem PPG US", phone)})
		return
	}

	if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Akun Anda saat ini dinonaktifkan"})
		return
	}

	magicToken := ulid.Make().String() + "-" + randomHex(16)
	if err := a.challenges.Approve(r.Context(), code, phone, user.ID, magicToken); err != nil {
		httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{Ok: false, Error: "Gagal memproses verifikasi kode"})
		return
	}

	baseURL := a.appBaseURL
	if baseURL == "" {
		if forwardedProto := r.Header.Get("X-Forwarded-Proto"); forwardedProto != "" {
			host := r.Header.Get("X-Forwarded-Host")
			if host == "" {
				host = r.Host
			}
			baseURL = forwardedProto + "://" + host
		} else {
			baseURL = "https://ppg.tail31c665.ts.net"
		}
	}

	magicLink := fmt.Sprintf("%s/api/auth/magic?token=%s", strings.TrimRight(baseURL, "/"), magicToken)
	username := ""
	if user.Username != nil {
		username = *user.Username
	}

	httpx.JSON(w, http.StatusOK, internalWAVerifyResponse{
		Ok:        true,
		Name:      user.Name,
		Username:  username,
		MagicLink: magicLink,
		Role:      string(user.Role),
	})
}

func (a *Auth) MagicLogin(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		http.Redirect(w, r, "/login?error=invalid_token", http.StatusFound)
		return
	}

	challenge, err := a.challenges.GetByMagicToken(r.Context(), token)
	if err != nil || challenge.IsExpired() || challenge.UserID == nil || *challenge.UserID == "" {
		http.Redirect(w, r, "/login?error=token_expired", http.StatusFound)
		return
	}

	user, err := a.users.FindByID(r.Context(), *challenge.UserID)
	if err != nil {
		http.Redirect(w, r, "/login?error=user_not_found", http.StatusFound)
		return
	}

	if st, err := a.users.Status(r.Context(), user.ID); err == nil && st == store.UserArchived {
		http.Redirect(w, r, "/login?error=account_archived", http.StatusFound)
		return
	}

	if err := a.issueSession(r, w, user); err != nil {
		http.Redirect(w, r, "/login?error=session_failed", http.StatusFound)
		return
	}

	_ = a.challenges.MarkConsumed(r.Context(), challenge.Code)

	if a.dynamicAPIPath {
		path, err := auth.GeneratePath()
		if err == nil {
			auth.SetAPIPathCookie(w, path, a.cookieSecure, int(a.jwt.TTL().Seconds()))
		}
	}

	dest := "/dashboard"
	if user.Role == model.RoleGuru || user.Role == "teacher" {
		dest = "/portal-guru"
	} else if user.Role == model.RoleMurid || user.Role == "student" {
		dest = "/achievement"
	}

	http.Redirect(w, r, dest, http.StatusFound)
}

func generateChallengeCode() (string, error) {
	n, err := cryptorand.Int(cryptorand.Reader, big.NewInt(9000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("PPG-%04d", n.Int64()+1000), nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = cryptorand.Read(b)
	return hex.EncodeToString(b)
}
