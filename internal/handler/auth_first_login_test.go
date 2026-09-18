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

func setupTestAuthHandler(t *testing.T) (*Auth, *store.Users, *auth.JWT) {
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
	authH := NewAuth(users, userPhones, nil, nil, pwResets, waOutbox, nil, jwtSvc, false, false, "123456789", "http://localhost:8080", "")
	return authH, users, jwtSvc
}

func TestAuthFirstLogin(t *testing.T) {
	authH, users, _ := setupTestAuthHandler(t)
	ctx := context.Background()

	// Create user 1 and user 2
	u1Uname := "guru1"
	u1, err := users.Create(ctx, "guru1@ppg.local", &u1Uname, "oldpass123", "Guru Satu", model.RoleGuru)
	if err != nil {
		t.Fatalf("create u1: %v", err)
	}
	u2Uname := "guru2"
	_, err = users.Create(ctx, "guru2@ppg.local", &u2Uname, "oldpass123", "Guru Dua", model.RoleGuru)
	if err != nil {
		t.Fatalf("create u2: %v", err)
	}

	// 1. Unauthenticated request should fail
	req := httptest.NewRequest("POST", "/api/auth/me/first-login", bytes.NewReader([]byte(`{"newPassword":"newpass123"}`)))
	w := httptest.NewRecorder()
	authH.FirstLogin(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", w.Code)
	}

	// Helper to attach claims context
	withAuth := func(r *http.Request, u *model.User) *http.Request {
		claims := &auth.Claims{
			UserID: u.ID,
			Role:   u.Role,
		}
		return r.WithContext(auth.WithClaims(r.Context(), claims))
	}

	// 2. Too short password should fail
	bodyShort, _ := json.Marshal(map[string]string{
		"newPassword": "123",
	})
	req = withAuth(httptest.NewRequest("POST", "/api/auth/me/first-login", bytes.NewReader(bodyShort)), u1)
	w = httptest.NewRecorder()
	authH.FirstLogin(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for short password, got %d", w.Code)
	}

	// 3. Username taken by u2 should fail with 409
	bodyTaken, _ := json.Marshal(map[string]string{
		"username":    "guru2",
		"newPassword": "newpass123",
	})
	req = withAuth(httptest.NewRequest("POST", "/api/auth/me/first-login", bytes.NewReader(bodyTaken)), u1)
	w = httptest.NewRecorder()
	authH.FirstLogin(w, req)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected status 409 for taken username, got %d", w.Code)
	}

	// 4. Successful update with new username and password
	bodySuccess, _ := json.Marshal(map[string]string{
		"username":    "guru1_custom",
		"newPassword": "brandnewpassword123",
	})
	req = withAuth(httptest.NewRequest("POST", "/api/auth/me/first-login", bytes.NewReader(bodySuccess)), u1)
	w = httptest.NewRecorder()
	authH.FirstLogin(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body: %s)", w.Code, w.Body.String())
	}

	var resp authResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.MustChangePassword {
		t.Errorf("expected MustChangePassword to be false in response")
	}
	if resp.Username == nil || *resp.Username != "guru1_custom" {
		t.Errorf("expected username to be 'guru1_custom', got %v", resp.Username)
	}
}
