package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func setupTestUsersStore(t *testing.T) *Users {
	t.Helper()
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return NewUsers(db)
}

func TestUsersMustChangePassword(t *testing.T) {
	users := setupTestUsersStore(t)
	ctx := context.Background()

	// 1. SeedAdmin sets MustChangePassword to false
	if err := SeedAdmin(ctx, users, "admin@ppg.local", "admin", "secret123"); err != nil {
		t.Fatalf("seed admin: %v", err)
	}
	adminUser, err := users.FindByEmail(ctx, "admin@ppg.local")
	if err != nil {
		t.Fatalf("find admin: %v", err)
	}
	if adminUser.MustChangePassword {
		t.Errorf("expected admin MustChangePassword to be false, got true")
	}

	// 2. Newly created user defaults to MustChangePassword = true
	uname := "guru1"
	u, err := users.Create(ctx, "guru1@ppg.local", &uname, "pass123", "Guru Satu", model.RoleGuru)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if !u.MustChangePassword {
		t.Errorf("expected new user MustChangePassword to be true, got false")
	}

	// Also check via List
	listRes, err := users.List(ctx, ListUsersFilter{Query: "guru1"})
	if err != nil {
		t.Fatalf("list users: %v", err)
	}
	if len(listRes.Items) == 0 || !listRes.Items[0].MustChangePassword {
		t.Errorf("expected list user MustChangePassword to be true")
	}

	// 3. UpdateFirstLoginCredentials with new username and password
	newUname := "guru1_updated"
	updated, err := users.UpdateFirstLoginCredentials(ctx, u.ID, &newUname, "newsecret456")
	if err != nil {
		t.Fatalf("update credentials: %v", err)
	}
	if updated.MustChangePassword {
		t.Errorf("expected MustChangePassword to be false after first login update")
	}
	if updated.Username == nil || *updated.Username != newUname {
		t.Errorf("expected username to be %s, got %v", newUname, updated.Username)
	}

	// Verify login check with new credentials
	refetched, err := users.FindByIdentifier(ctx, newUname)
	if err != nil {
		t.Fatalf("find by new username: %v", err)
	}
	if refetched.MustChangePassword {
		t.Errorf("refetched MustChangePassword should be false")
	}
}
