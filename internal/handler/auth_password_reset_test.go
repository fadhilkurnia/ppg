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

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func setupFullTestAuthHandler(t *testing.T) (*Auth, *store.Users, *store.UserPhones, *store.PasswordResets, *store.WAOutbox, *auth.JWT) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := store.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	users := store.NewUsers(db)
	userPhones := store.NewUserPhones(db)
	pwResets := store.NewPasswordResets(db)
	waOutbox := store.NewWAOutbox(db)
	jwtSvc := auth.NewJWT([]byte("testsecretkey12345678901234567890"), 1*time.Hour)
	authH := NewAuth(users, userPhones, nil, nil, pwResets, waOutbox, nil, jwtSvc, false, false, "6287781485093", "http://localhost:8080", "")
	return authH, users, userPhones, pwResets, waOutbox, jwtSvc
}

func TestForgotPasswordAndResetFlow(t *testing.T) {
	authH, users, userPhones, _, waOutbox, _ := setupFullTestAuthHandler(t)
	ctx := context.Background()

	uName := "budi"
	u, err := users.Create(ctx, "budi@example.com", &uName, "oldpass123", "Budi Santoso", model.RoleGuru)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	// 1. Request when user has no phone
	reqBody, _ := json.Marshal(map[string]string{"identifier": "budi"})
	req := httptest.NewRequest("POST", "/api/auth/password/forgot/request", bytes.NewReader(reqBody))
	w := httptest.NewRecorder()
	authH.RequestPasswordReset(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for user with no phone, got %d", w.Code)
	}

	// Add phone to user
	_, err = userPhones.AddPhone(ctx, u.ID, "6281234567890", true)
	if err != nil {
		t.Fatalf("add phone: %v", err)
	}

	// 2. Request forgot password with username
	req = httptest.NewRequest("POST", "/api/auth/password/forgot/request", bytes.NewReader(reqBody))
	w = httptest.NewRecorder()
	authH.RequestPasswordReset(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var forgotResp forgotPasswordResponse
	if err := json.Unmarshal(w.Body.Bytes(), &forgotResp); err != nil {
		t.Fatalf("decode forgot response: %v", err)
	}
	if !forgotResp.OK || forgotResp.ResetToken == "" {
		t.Fatalf("invalid forgot response: %+v", forgotResp)
	}

	// Verify message in outbox
	pending, err := waOutbox.GetPending(ctx, 10)
	if err != nil || len(pending) == 0 {
		t.Fatalf("expected pending message in wa_outbox, got %v (err: %v)", pending, err)
	}
	outboxItem := pending[0]
	if outboxItem.Phone != "6281234567890" {
		t.Errorf("expected outbox phone 6281234567890, got %s", outboxItem.Phone)
	}

	// Extract OTP from outbox message (format: 👉 *123456*)
	// Let's check internal/store/password_reset_challenges directly
	rCh, err := authH.pwResets.GetByToken(ctx, forgotResp.ResetToken)
	if err != nil {
		t.Fatalf("get challenge by token: %v", err)
	}
	otpCode := rCh.OTPCode

	// 3. Reset with wrong OTP
	wrongBody, _ := json.Marshal(map[string]string{
		"resetToken":      forgotResp.ResetToken,
		"otp":             "000000",
		"newPassword":     "newpass123",
		"confirmPassword": "newpass123",
	})
	req = httptest.NewRequest("POST", "/api/auth/password/forgot/reset", bytes.NewReader(wrongBody))
	w = httptest.NewRecorder()
	authH.ResetPasswordWithOTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for wrong OTP, got %d", w.Code)
	}

	// 4. Reset with valid OTP but mismatching password confirmation
	mismatchBody, _ := json.Marshal(map[string]string{
		"resetToken":      forgotResp.ResetToken,
		"otp":             otpCode,
		"newPassword":     "newpass123",
		"confirmPassword": "differentpass",
	})
	req = httptest.NewRequest("POST", "/api/auth/password/forgot/reset", bytes.NewReader(mismatchBody))
	w = httptest.NewRecorder()
	authH.ResetPasswordWithOTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for mismatch confirmation, got %d", w.Code)
	}

	// 5. Successful reset with valid OTP
	successBody, _ := json.Marshal(map[string]string{
		"resetToken":      forgotResp.ResetToken,
		"otp":             otpCode,
		"newPassword":     "newpassword456",
		"confirmPassword": "newpassword456",
	})
	req = httptest.NewRequest("POST", "/api/auth/password/forgot/reset", bytes.NewReader(successBody))
	w = httptest.NewRecorder()
	authH.ResetPasswordWithOTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for successful reset, got %d (body: %s)", w.Code, w.Body.String())
	}

	var resetResp authResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resetResp); err != nil {
		t.Fatalf("decode reset response: %v", err)
	}
	if resetResp.ID != u.ID {
		t.Errorf("expected user ID %s, got %s", u.ID, resetResp.ID)
	}

	// Verify can now login with new password
	loginBody, _ := json.Marshal(map[string]string{
		"identifier": "budi",
		"password":   "newpassword456",
	})
	req = httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginBody))
	w = httptest.NewRecorder()
	authH.Login(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 login with new password, got %d", w.Code)
	}
}

func TestUserPhonesEndpoints(t *testing.T) {
	authH, users, userPhones, _, _, _ := setupFullTestAuthHandler(t)
	ctx := context.Background()

	u1Uname := "user1"
	u1, err := users.Create(ctx, "user1@example.com", &u1Uname, "password123", "User One", model.RoleGuru)
	if err != nil {
		t.Fatalf("create u1: %v", err)
	}

	u2Uname := "user2"
	u2, err := users.Create(ctx, "user2@example.com", &u2Uname, "password123", "User Two", model.RoleGuru)
	if err != nil {
		t.Fatalf("create u2: %v", err)
	}

	// Add phone to user 1
	p1, err := userPhones.AddPhone(ctx, u1.ID, "62811111111", true)
	if err != nil {
		t.Fatalf("add p1: %v", err)
	}
	p2, err := userPhones.AddPhone(ctx, u1.ID, "62822222222", false)
	if err != nil {
		t.Fatalf("add p2: %v", err)
	}

	withClaims := func(r *http.Request, userID string) *http.Request {
		return r.WithContext(auth.WithClaims(r.Context(), &auth.Claims{UserID: userID, Role: model.RoleGuru}))
	}

	// 1. List user 1 phones
	req := withClaims(httptest.NewRequest("GET", "/api/auth/me/phones", nil), u1.ID)
	w := httptest.NewRecorder()
	authH.ListUserPhones(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var phones []model.UserPhone
	if err := json.Unmarshal(w.Body.Bytes(), &phones); err != nil {
		t.Fatalf("unmarshal phones: %v", err)
	}
	if len(phones) != 2 {
		t.Fatalf("expected 2 phones, got %d", len(phones))
	}
	if !phones[0].IsPrimary || phones[0].Phone != "62811111111" {
		t.Errorf("expected first phone to be primary 62811111111, got %+v", phones[0])
	}

	// 2. Set p2 as primary
	r := chi.NewRouter()
	r.Post("/api/auth/me/phones/{id}/primary", authH.SetPrimaryUserPhone)
	req = withClaims(httptest.NewRequest("POST", "/api/auth/me/phones/"+p2.ID+"/primary", nil), u1.ID)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for set primary, got %d: %s", w.Code, w.Body.String())
	}

	// Verify p2 is now primary
	updatedPhones, _ := userPhones.ListByUserID(ctx, u1.ID)
	if !updatedPhones[0].IsPrimary || updatedPhones[0].ID != p2.ID {
		t.Errorf("expected p2 to be primary, got %+v", updatedPhones[0])
	}

	// 3. User 2 cannot set primary or delete user 1's phone
	req = withClaims(httptest.NewRequest("POST", "/api/auth/me/phones/"+p2.ID+"/primary", nil), u2.ID)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for setting another user's phone, got %d", w.Code)
	}

	// 4. Anti-duplicate phone constraint
	taken, err := userPhones.IsPhoneTaken(ctx, "62811111111", u2.ID)
	if err != nil || !taken {
		t.Errorf("expected phone 62811111111 to be taken for u2, got taken=%v, err=%v", taken, err)
	}
	// Same phone should NOT be considered taken when checked against u1 itself
	takenSelf, err := userPhones.IsPhoneTaken(ctx, "62811111111", u1.ID)
	if err != nil || takenSelf {
		t.Errorf("expected phone to not be taken for u1 itself, got taken=%v, err=%v", takenSelf, err)
	}

	// 5. Delete phone
	rDelete := chi.NewRouter()
	rDelete.Delete("/api/auth/me/phones/{id}", authH.DeleteUserPhone)
	req = withClaims(httptest.NewRequest("DELETE", "/api/auth/me/phones/"+p1.ID, nil), u1.ID)
	w = httptest.NewRecorder()
	rDelete.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for delete, got %d", w.Code)
	}

	remaining, _ := userPhones.ListByUserID(ctx, u1.ID)
	if len(remaining) != 1 {
		t.Fatalf("expected 1 remaining phone, got %d", len(remaining))
	}
}
