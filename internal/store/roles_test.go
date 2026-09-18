package store

import (
	"context"
	"errors"
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

func TestRolesCRUD(t *testing.T) {
	r, u := newRolesDB(t)
	ctx := context.Background()

	// 1. Create
	newRole, err := r.Create(ctx, CreateRoleInput{
		ID:                "bendahara",
		Label:             "Bendahara",
		CanLogin:          true,
		ManageableRoleIDs: []string{"student"},
		SortOrder:         60,
	})
	if err != nil {
		t.Fatalf("create role: %v", err)
	}
	if newRole.ID != "bendahara" || newRole.Label != "Bendahara" || !newRole.CanLogin {
		t.Errorf("unexpected created role: %+v", newRole)
	}

	// 2. Duplicate Create should fail
	_, err = r.Create(ctx, CreateRoleInput{
		ID:    "bendahara",
		Label: "Bendahara Duplicate",
	})
	if !errors.Is(err, ErrRoleConflict) {
		t.Errorf("expected ErrRoleConflict, got %v", err)
	}

	// 3. Update
	lbl := "Bendahara Keuangan"
	cl := false
	sort := 65
	updated, err := r.Update(ctx, "bendahara", UpdateRoleInput{
		Label:     &lbl,
		CanLogin:  &cl,
		SortOrder: &sort,
	})
	if err != nil {
		t.Fatalf("update role: %v", err)
	}
	if updated.Label != "Bendahara Keuangan" || updated.CanLogin != false || updated.SortOrder != 65 {
		t.Errorf("unexpected updated role: %+v", updated)
	}

	// 4. Delete system role should fail
	err = r.Delete(ctx, "admin")
	if !errors.Is(err, ErrSystemRole) {
		t.Errorf("expected ErrSystemRole, got %v", err)
	}

	// 5. Delete role in use should fail
	user, err := u.Create(ctx, "b@example.com", nil, "pass123", "Ben", "bendahara")
	if err != nil {
		t.Fatalf("create user with role: %v", err)
	}
	_ = user
	err = r.Delete(ctx, "bendahara")
	if !errors.Is(err, ErrRoleInUse) {
		t.Errorf("expected ErrRoleInUse, got %v", err)
	}

	// 6. Delete role when not in use
	anotherRole, err := r.Create(ctx, CreateRoleInput{
		ID:    "keamanan",
		Label: "Keamanan",
	})
	if err != nil {
		t.Fatalf("create keamanan: %v", err)
	}
	_ = anotherRole
	if err := r.Delete(ctx, "keamanan"); err != nil {
		t.Fatalf("delete role: %v", err)
	}
	_, err = r.Get(ctx, "keamanan")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}
