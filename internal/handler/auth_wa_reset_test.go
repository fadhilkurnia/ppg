package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func TestWAResetPasswordFullFlow(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := store.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	users := store.NewUsers(db)
	userPhones := store.NewUserPhones(db)
	waChallenges := store.NewWAChallenges(db)
	waResets := store.NewWAResetChallenges(db)
	pwResets := store.NewPasswordResets(db)
	waOutbox := store.NewWAOutbox(db)
	jwtSvc := auth.NewJWT([]byte("testsecretkey12345678901234567890"), 1*time.Hour)

	authH := NewAuth(users, userPhones, waChallenges, waResets, pwResets, waOutbox, nil, jwtSvc, false, false, "6287781485093", "http://localhost:8080", "")
	ctx := context.Background()

	// 1. Create a user with phone 08123456789
	uUname := "guru_test"
	u, err := users.Create(ctx, "guru_test@example.com", &uUname, "initialpass123", "Ustadz Test", model.RoleGuru)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	_, err = userPhones.AddPhone(ctx, u.ID, "08123456789", true)
	if err != nil {
		t.Fatalf("add phone: %v", err)
	}

	// 2. User clicks "Lupa Password?" -> CreateResetWAChallenge
	req := httptest.NewRequest("POST", "/api/auth/password/reset-challenge", nil)
	w := httptest.NewRecorder()
	authH.CreateResetWAChallenge(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("CreateResetWAChallenge status = %d", w.Code)
	}
	var chResp createResetWAChallengeResponse
	if err := json.NewDecoder(w.Body).Decode(&chResp); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if chResp.Code == "" || chResp.PollToken == "" {
		t.Fatalf("expected non-empty code and pollToken, got %+v", chResp)
	}

	// 3. Check poll status before WA message -> status: pending
	pollReq := httptest.NewRequest("GET", "/api/auth/password/reset-challenge/status?code="+chResp.Code+"&pollToken="+chResp.PollToken, nil)
	wPoll := httptest.NewRecorder()
	authH.PollResetWAStatus(wPoll, pollReq)
	if wPoll.Code != http.StatusOK {
		t.Fatalf("PollResetWAStatus status = %d", wPoll.Code)
	}
	var pollResp pollResetWAStatusResponse
	_ = json.NewDecoder(wPoll.Body).Decode(&pollResp)
	if pollResp.Status != "pending" {
		t.Fatalf("expected pending, got %s", pollResp.Status)
	}

	// 4. Inbound WA message arrives -> InternalWAVerify with unknown phone
	unregPayload, _ := json.Marshal(map[string]string{
		"code": chResp.Code,
		"phone": "08999999999",
		"action": "reset",
	})
	unregReq := httptest.NewRequest("POST", "/api/internal/wa-verify", bytes.NewReader(unregPayload))
	wUnreg := httptest.NewRecorder()
	authH.InternalWAVerify(wUnreg, unregReq)
	var unregResp internalWAVerifyResponse
	_ = json.NewDecoder(wUnreg.Body).Decode(&unregResp)
	if unregResp.Ok {
		t.Fatalf("expected ok: false for unregistered phone")
	}

	// 5. Inbound WA message arrives with matching phone (+628123456789)
	regPayload, _ := json.Marshal(map[string]string{
		"code": chResp.Code,
		"phone": "628123456789",
		"action": "reset",
	})
	regReq := httptest.NewRequest("POST", "/api/internal/wa-verify", bytes.NewReader(regPayload))
	wReg := httptest.NewRecorder()
	authH.InternalWAVerify(wReg, regReq)
	var regResp internalWAVerifyResponse
	_ = json.NewDecoder(wReg.Body).Decode(&regResp)
	if !regResp.Ok || regResp.OTP == "" || regResp.Type != "reset" {
		t.Fatalf("expected ok: true, type: reset, non-empty OTP, got %+v", regResp)
	}

	// 6. Check poll status now -> status: otp_sent
	wPoll2 := httptest.NewRecorder()
	authH.PollResetWAStatus(wPoll2, pollReq)
	var pollResp2 pollResetWAStatusResponse
	_ = json.NewDecoder(wPoll2.Body).Decode(&pollResp2)
	if pollResp2.Status != "otp_sent" {
		t.Fatalf("expected otp_sent, got %s", pollResp2.Status)
	}

	// 7. Verify OTP with wrong OTP
	wrongOtpBody, _ := json.Marshal(map[string]string{
		"code": chResp.Code,
		"pollToken": chResp.PollToken,
		"otp": "000000",
	})
	wWrongOtp := httptest.NewRecorder()
	authH.VerifyResetWAOTP(wWrongOtp, httptest.NewRequest("POST", "/api/auth/password/reset-challenge/verify-otp", bytes.NewReader(wrongOtpBody)))
	if wWrongOtp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for wrong OTP, got %d", wWrongOtp.Code)
	}

	// 8. Verify OTP with correct OTP
	correctOtpBody, _ := json.Marshal(map[string]string{
		"code": chResp.Code,
		"pollToken": chResp.PollToken,
		"otp": regResp.OTP,
	})
	wCorrectOtp := httptest.NewRecorder()
	authH.VerifyResetWAOTP(wCorrectOtp, httptest.NewRequest("POST", "/api/auth/password/reset-challenge/verify-otp", bytes.NewReader(correctOtpBody)))
	if wCorrectOtp.Code != http.StatusOK {
		t.Fatalf("expected 200 for correct OTP, got %d: %s", wCorrectOtp.Code, wCorrectOtp.Body.String())
	}
	var otpVerifyResp verifyResetWAOTPResponse
	_ = json.NewDecoder(wCorrectOtp.Body).Decode(&otpVerifyResp)
	if !otpVerifyResp.OK || otpVerifyResp.ResetSessionToken == "" || otpVerifyResp.User == nil {
		t.Fatalf("expected valid verify response, got %+v", otpVerifyResp)
	}

	// 9. Complete Reset Password
	completeBody, _ := json.Marshal(map[string]string{
		"resetSessionToken": otpVerifyResp.ResetSessionToken,
		"newPassword": "newsecretpass999",
		"confirmPassword": "newsecretpass999",
	})
	wComplete := httptest.NewRecorder()
	authH.CompleteResetWAPassword(wComplete, httptest.NewRequest("POST", "/api/auth/password/reset-challenge/complete", bytes.NewReader(completeBody)))
	if wComplete.Code != http.StatusOK {
		t.Fatalf("expected 200 for CompleteResetWAPassword, got %d: %s", wComplete.Code, wComplete.Body.String())
	}

	// Check that session cookie was set
	cookies := wComplete.Result().Cookies()
	var authCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.CookieName {
			authCookie = c
			break
		}
	}
	if authCookie == nil || authCookie.Value == "" {
		t.Fatalf("expected token session cookie to be set")
	}

	// 10. Verify that the user can now login with new password
	loginBody, _ := json.Marshal(map[string]string{
		"identifier": "guru_test",
		"password": "newsecretpass999",
	})
	wLogin := httptest.NewRecorder()
	authH.Login(wLogin, httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginBody)))
	if wLogin.Code != http.StatusOK {
		t.Fatalf("expected login to succeed with new password, got %d: %s", wLogin.Code, wLogin.Body.String())
	}
}
