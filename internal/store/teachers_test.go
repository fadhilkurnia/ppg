package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func newTeachersDB(t *testing.T) *Teachers {
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
	return NewTeachers(db)
}

func teacherInput(name, daerah string, status model.TeacherStatus) TeacherInput {
	nick := "Nick"
	return TeacherInput{
		Name:     name,
		Nickname: &nick,
		Kelompok: "Pabeta",
		Desa:     "Malili",
		Daerah:   daerah,
		Status:   status,
	}
}

func TestTeachersCRUD(t *testing.T) {
	s := newTeachersDB(t)
	ctx := context.Background()

	created, err := s.Create(ctx, teacherInput("Alice", "Luwu Timur", model.TeacherActive))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.ID == "" || created.Name != "Alice" || created.Status != model.TeacherActive {
		t.Fatalf("unexpected created: %+v", created)
	}

	got, err := s.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Daerah != "Luwu Timur" {
		t.Errorf("Daerah = %q, want Luwu Timur", got.Daerah)
	}

	retired := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	in := teacherInput("Alice Renamed", "Luwu Timur", model.TeacherRetired)
	in.RetiredAt = &retired
	updated, err := s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Alice Renamed" || updated.Status != model.TeacherRetired {
		t.Errorf("after update: %+v", updated)
	}
	if updated.RetiredAt == nil || !updated.RetiredAt.Equal(retired) {
		t.Errorf("RetiredAt = %v, want %v", updated.RetiredAt, retired)
	}

	if err := s.Delete(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Get(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get after delete: err = %v, want ErrNotFound", err)
	}
}

func TestTeachersListFilters(t *testing.T) {
	s := newTeachersDB(t)
	ctx := context.Background()

	for _, in := range []TeacherInput{
		teacherInput("Alice", "Medan Timur", model.TeacherActive),
		teacherInput("Bob", "Luwu Timur", model.TeacherActive),
		teacherInput("Charlie", "Luwu Timur", model.TeacherRetired),
		teacherInput("David", "Medan Timur", model.TeacherRetired),
	} {
		if _, err := s.Create(ctx, in); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	res, err := s.List(ctx, TeacherListParams{})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if res.Total != 4 {
		t.Errorf("total = %d, want 4", res.Total)
	}

	res, _ = s.List(ctx, TeacherListParams{Status: "active"})
	if res.Total != 2 {
		t.Errorf("active total = %d, want 2", res.Total)
	}

	res, _ = s.List(ctx, TeacherListParams{Daerah: "Luwu Timur"})
	if res.Total != 2 {
		t.Errorf("daerah total = %d, want 2", res.Total)
	}

	res, _ = s.List(ctx, TeacherListParams{Daerah: "Medan Timur", Status: "retired"})
	if res.Total != 1 || res.Items[0].Name != "David" {
		t.Errorf("compound filter result: %+v", res)
	}

	res, _ = s.List(ctx, TeacherListParams{Query: "li"})
	// matches Alice and Charlie via name; nicknames are all "Nick" so no extra matches.
	if res.Total != 2 {
		t.Errorf("query total = %d, want 2 (Alice, Charlie)", res.Total)
	}
}
