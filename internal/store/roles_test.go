package store

import (
	"context"
	"path/filepath"
	"testing"
)

func newRolesDB(t *testing.T) (*Roles, *Users) {
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
	return NewRoles(db), NewUsers(db)
}

func TestRolesSeed(t *testing.T) {
	r, _ := newRolesDB(t)
	ctx := context.Background()

	items, err := r.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	want := map[string]bool{"admin": false, "coordinator": false, "teacher": false, "parent": false, "student": false, "staff": false}
	for _, it := range items {
		want[it.ID] = true
	}
	for id, seen := range want {
		if !seen {
			t.Errorf("missing seeded role: %s", id)
		}
	}
}

func TestRolesManageable(t *testing.T) {
	r, _ := newRolesDB(t)
	ctx := context.Background()

	admin, err := r.Get(ctx, "admin")
	if err != nil {
		t.Fatalf("get admin: %v", err)
	}
	if !CanManage(admin, "student") || !CanManage(admin, "admin") {
		t.Errorf("admin should manage everyone")
	}

	coordinator, _ := r.Get(ctx, "coordinator")
	if CanManage(coordinator, "admin") {
		t.Errorf("coordinator must not manage admin")
	}
	if !CanManage(coordinator, "teacher") {
		t.Errorf("coordinator should manage teacher")
	}
}

func TestRolesBindingPrimaryMirror(t *testing.T) {
	r, u := newRolesDB(t)
	ctx := context.Background()

	user, err := u.Create(ctx, "u1@example.com", nil, "secret123", "Foo", "staff")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := r.AddBinding(ctx, user.ID, "teacher", true); err != nil {
		t.Fatalf("add primary binding: %v", err)
	}
	got, err := u.FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("find user: %v", err)
	}
	if string(got.Role) != "teacher" {
		t.Errorf("primary mirror: users.role = %q, want teacher", got.Role)
	}
	bindings, err := r.ListBindings(ctx, user.ID)
	if err != nil {
		t.Fatalf("list bindings: %v", err)
	}
	primaryCount := 0
	for _, b := range bindings {
		if b.IsPrimary {
			primaryCount++
		}
	}
	if primaryCount != 1 {
		t.Errorf("primaryCount = %d, want 1", primaryCount)
	}
}
