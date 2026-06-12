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

	in := teacherInput("Alice Renamed", "Luwu Timur", model.TeacherRetired)
	updated, err := s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Alice Renamed" || updated.Status != model.TeacherRetired {
		t.Errorf("after update: %+v", updated)
	}

	if err := s.Delete(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Get(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get after delete: err = %v, want ErrNotFound", err)
	}
}

// TestTeachersSharedFieldsRoundTrip verifies the formerly murid-only / taaruf
// fields now persist and read back through the guru facade (unified-user
// mechanism: a teacher carries the same field set as a student).
func TestTeachersSharedFieldsRoundTrip(t *testing.T) {
	s := newTeachersDB(t)
	ctx := context.Background()

	level := model.LevelRemaja
	parentName := "Pak Budi"
	parentPhone := "0812345"
	region := "ID"
	dob := time.Date(1990, 5, 6, 0, 0, 0, 0, time.UTC)
	pekerjaan := "Guru"

	in := teacherInput("Shared", "Luwu Timur", model.TeacherActive)
	in.Level = &level
	in.ParentName = &parentName
	in.ParentPhone = &parentPhone
	in.ParentPhoneRegion = &region
	in.DateOfBirth = &dob
	in.Pekerjaan = &pekerjaan
	in.Urutan = 3
	in.HideDob = true

	created, err := s.Create(ctx, in)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := s.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Level == nil || *got.Level != level {
		t.Errorf("Level = %v, want %v", got.Level, level)
	}
	if got.ParentName == nil || *got.ParentName != parentName {
		t.Errorf("ParentName = %v, want %q", got.ParentName, parentName)
	}
	if got.DateOfBirth == nil || !got.DateOfBirth.Equal(dob) {
		t.Errorf("DateOfBirth = %v, want %v", got.DateOfBirth, dob)
	}
	if got.Pekerjaan == nil || *got.Pekerjaan != pekerjaan {
		t.Errorf("Pekerjaan = %v, want %q", got.Pekerjaan, pekerjaan)
	}
	if got.Urutan != 3 {
		t.Errorf("Urutan = %d, want 3", got.Urutan)
	}
	if !got.HideDob {
		t.Errorf("HideDob = false, want true")
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
