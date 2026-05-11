package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
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

func sampleInput(name string) StudentInput {
	level := model.LevelCaberawit
	parentName := "Bob"
	parentPhone := "+62123"
	dob := time.Date(2015, 6, 1, 0, 0, 0, 0, time.UTC)
	return StudentInput{
		Name:        name,
		DateOfBirth: &dob,
		Gender:      "female",
		Level:       &level,
		Kelompok:    "Chicago",
		Status:      model.StudentActive,
		ParentName:  &parentName,
		ParentPhone: &parentPhone,
	}
}

func TestStudentsCRUD(t *testing.T) {
	s := newTestDB(t)
	ctx := context.Background()

	created, err := s.Create(ctx, sampleInput("Alice"))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.ID == "" || created.Name != "Alice" || created.Status != model.StudentActive {
		t.Fatalf("unexpected created: %+v", created)
	}
	if created.Level == nil || *created.Level != model.LevelCaberawit {
		t.Errorf("Level = %v, want Caberawit", created.Level)
	}

	in := sampleInput("Alice Renamed")
	leftAt := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	reason := "Pulang"
	in.Status = model.StudentLeft
	in.LeftAt = &leftAt
	in.LeaveReason = &reason

	updated, err := s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Alice Renamed" || updated.Status != model.StudentLeft {
		t.Errorf("after update: %+v", updated)
	}
	if updated.LeftAt == nil || !updated.LeftAt.Equal(leftAt) {
		t.Errorf("LeftAt = %v, want %v", updated.LeftAt, leftAt)
	}

	if err := s.Delete(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Get(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get after delete: err = %v, want ErrNotFound", err)
	}
}

func TestStudentsListSearchAndStatus(t *testing.T) {
	s := newTestDB(t)
	ctx := context.Background()

	for _, name := range []string{"Charlie", "Bob", "Alice", "Dave"} {
		if _, err := s.Create(ctx, sampleInput(name)); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	left := sampleInput("Eve")
	left.Status = model.StudentLeft
	if _, err := s.Create(ctx, left); err != nil {
		t.Fatalf("seed left: %v", err)
	}

	res, err := s.List(ctx, ListParams{Limit: 2})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if res.Total != 5 {
		t.Errorf("Total = %d, want 5", res.Total)
	}
	if len(res.Items) != 2 {
		t.Fatalf("Items len = %d, want 2", len(res.Items))
	}
	if res.Items[0].Name != "Alice" || res.Items[1].Name != "Bob" {
		t.Errorf("first page = [%s, %s], want [Alice, Bob]", res.Items[0].Name, res.Items[1].Name)
	}

	res, _ = s.List(ctx, ListParams{Status: "active"})
	if res.Total != 4 {
		t.Errorf("active total = %d, want 4", res.Total)
	}

	res, _ = s.List(ctx, ListParams{Query: "li"})
	// Alice and Charlie match.
	if res.Total != 2 {
		t.Errorf("query total = %d, want 2", res.Total)
	}
}

func TestStudentsCheckLevelEnum(t *testing.T) {
	s := newTestDB(t)
	bad := model.StudentLevel("Bogus")
	in := sampleInput("X")
	in.Level = &bad
	if _, err := s.Create(context.Background(), in); err == nil {
		t.Error("expected CHECK constraint failure on bogus level, got nil")
	}
}
