package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func TestGoogleAuthEndpoints(t *testing.T) {
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
	jwtSvc := auth.NewJWT([]byte("testsecretkey12345678901234567890"), 1*time.Hour)

	// 1. Without Client ID configured
	authHNoGoogle := NewAuth(users, userPhones, nil, nil, nil, nil, nil, jwtSvc, false, false, "", "http://localhost:8080", "")
	req := httptest.NewRequest("GET", "/api/auth/google/config", nil)
	w := httptest.NewRecorder()
	authHNoGoogle.GetGoogleConfig(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var cfgResp map[string]any
	_ = json.NewDecoder(w.Body).Decode(&cfgResp)
	if cfgResp["enabled"] != false || cfgResp["clientId"] != "" {
		t.Fatalf("expected disabled config, got %+v", cfgResp)
	}

	// 2. With Client ID configured
	authHWithGoogle := NewAuth(users, userPhones, nil, nil, nil, nil, nil, jwtSvc, false, false, "", "http://localhost:8080", "my-google-client-id.apps.googleusercontent.com")
	req2 := httptest.NewRequest("GET", "/api/auth/google/config", nil)
	w2 := httptest.NewRecorder()
	authHWithGoogle.GetGoogleConfig(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w2.Code)
	}
	var cfgResp2 map[string]any
	_ = json.NewDecoder(w2.Body).Decode(&cfgResp2)
	if cfgResp2["enabled"] != true || cfgResp2["clientId"] != "my-google-client-id.apps.googleusercontent.com" {
		t.Fatalf("expected enabled config, got %+v", cfgResp2)
	}

	// 3. VerifyGoogleCredential with empty credential
	reqEmpty := httptest.NewRequest("POST", "/api/auth/google/verify", bytes.NewReader([]byte(`{"credential":""}`)))
	wEmpty := httptest.NewRecorder()
	authHWithGoogle.VerifyGoogleCredential(wEmpty, reqEmpty)
	if wEmpty.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty credential, got %d", wEmpty.Code)
	}

	// 4. VerifyGoogleCredential with fake/invalid token
	reqFake := httptest.NewRequest("POST", "/api/auth/google/verify", bytes.NewReader([]byte(`{"credential":"not-a-valid-token"}`)))
	wFake := httptest.NewRecorder()
	authHWithGoogle.VerifyGoogleCredential(wFake, reqFake)
	if wFake.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid token, got %d", wFake.Code)
	}

	// 5. LinkGoogleCredential without auth claims
	reqLinkNoAuth := httptest.NewRequest("POST", "/api/auth/me/google/link", bytes.NewReader([]byte(`{"credential":"abc"}`)))
	wLinkNoAuth := httptest.NewRecorder()
	authHWithGoogle.LinkGoogleCredential(wLinkNoAuth, reqLinkNoAuth)
	if wLinkNoAuth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without auth claims, got %d", wLinkNoAuth.Code)
	}
}
