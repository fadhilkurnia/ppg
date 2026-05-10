package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func newTestDB(t *testing.T) *Students {
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
	return NewStudents(db)
}

func validInput(studentID, name string) StudentInput {
	addr := "Jl. Test No. 1"
	email := "parent@example.com"
	return StudentInput{
		StudentID:   studentID,
		Name:        name,
		DateOfBirth: time.Date(2015, 6, 1, 0, 0, 0, 0, time.UTC),
		Gender:      "male",
		Address:     &addr,
		ParentName:  "Parent",
		ParentPhone: "+628123456789",
		ParentEmail: &email,
	}
}

func TestStudentsCRUD(t *testing.T) {
	s := newTestDB(t)
	ctx := context.Background()

	created, err := s.Create(ctx, validInput("S001", "Alice"))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.ID == "" || created.Name != "Alice" {
		t.Fatalf("unexpected created: %+v", created)
	}

	got, err := s.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.StudentID != "S001" {
		t.Errorf("StudentID = %q, want S001", got.StudentID)
	}

	in := validInput("S001", "Alice Renamed")
	updated, err := s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Alice Renamed" {
		t.Errorf("Name = %q after update", updated.Name)
	}

	if err := s.Delete(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Get(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get after delete: err = %v, want ErrNotFound", err)
	}
}

func TestStudentsListSearchAndPaginate(t *testing.T) {
	s := newTestDB(t)
	ctx := context.Background()

	for i, name := range []string{"Charlie", "Bob", "Alice", "Dave"} {
		if _, err := s.Create(ctx, validInput("S00"+itoa(i+1), name)); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	res, err := s.List(ctx, ListParams{Limit: 2})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if res.Total != 4 {
		t.Errorf("Total = %d, want 4", res.Total)
	}
	if len(res.Items) != 2 {
		t.Fatalf("Items len = %d, want 2", len(res.Items))
	}
	if res.Items[0].Name != "Alice" || res.Items[1].Name != "Bob" {
		t.Errorf("first page = [%s, %s], want [Alice, Bob]", res.Items[0].Name, res.Items[1].Name)
	}

	res, err = s.List(ctx, ListParams{Limit: 2, Offset: 2})
	if err != nil {
		t.Fatalf("list page2: %v", err)
	}
	if res.Items[0].Name != "Charlie" || res.Items[1].Name != "Dave" {
		t.Errorf("second page = [%s, %s], want [Charlie, Dave]", res.Items[0].Name, res.Items[1].Name)
	}

	res, err = s.List(ctx, ListParams{Query: "li"})
	if err != nil {
		t.Fatalf("list search: %v", err)
	}
	if res.Total != 2 {
		t.Errorf("search total = %d, want 2 (Alice, Charlie)", res.Total)
	}
}

func TestStudentsUpdateMissing(t *testing.T) {
	s := newTestDB(t)
	if _, err := s.Update(context.Background(), "nope", validInput("X", "X")); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

// itoa avoids importing strconv in test code; trivial for small ints.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	const digits = "0123456789"
	buf := [4]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = digits[n%10]
		n /= 10
	}
	return string(buf[i:])
}
