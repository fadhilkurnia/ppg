package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func newTestJWT(t *testing.T, ttl time.Duration) *JWT {
	t.Helper()
	return NewJWT([]byte("test-secret-of-at-least-32-bytes!!"), ttl)
}

func TestIssueAndVerify(t *testing.T) {
	j := newTestJWT(t, time.Hour)
	tok, err := j.Issue("user-1", model.RoleAdmin)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	claims, err := j.Verify(tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if claims.UserID != "user-1" {
		t.Errorf("UserID = %q, want user-1", claims.UserID)
	}
	if claims.Role != model.RoleAdmin {
		t.Errorf("Role = %q, want admin", claims.Role)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	j := newTestJWT(t, -time.Minute)
	tok, err := j.Issue("user-1", model.RoleStaff)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := j.Verify(tok); err == nil {
		t.Error("expected expired token error, got nil")
	}
}

func TestVerifyRejectsBadSignature(t *testing.T) {
	a := NewJWT([]byte("secret-a-of-at-least-32-bytes!!!!"), time.Hour)
	b := NewJWT([]byte("secret-b-of-at-least-32-bytes!!!!"), time.Hour)
	tok, err := a.Issue("user-1", model.RoleStaff)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := b.Verify(tok); err == nil {
		t.Error("expected signature mismatch error, got nil")
	}
}

func TestVerifyRejectsTampered(t *testing.T) {
	j := newTestJWT(t, time.Hour)
	tok, err := j.Issue("user-1", model.RoleStaff)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("unexpected token shape")
	}
	tampered := parts[0] + "." + parts[1] + "." + "AAAA"
	if _, err := j.Verify(tampered); err == nil {
		t.Error("expected tampered token error, got nil")
	}
}
