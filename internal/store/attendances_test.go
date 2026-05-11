package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func newAttendancesDB(t *testing.T) (*Attendances, *model.Student, *model.Teacher) {
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

	students := NewStudents(db)
	student, err := students.Create(context.Background(), sampleInput("Alice"))
	if err != nil {
		t.Fatalf("create student: %v", err)
	}

	teachers := NewTeachers(db)
	nick := "T"
	teacher, err := teachers.Create(context.Background(), TeacherInput{
		Name:     "Test Teacher",
		Nickname: &nick,
		Kelompok: "TK",
		Desa:     "TD",
		Daerah:   "TDA",
		Status:   model.TeacherActive,
	})
	if err != nil {
		t.Fatalf("create teacher: %v", err)
	}

	return NewAttendances(db), student, teacher
}

func TestAttendancesCRUD(t *testing.T) {
	a, student, teacher := newAttendancesDB(t)
	ctx := context.Background()

	dur := 45
	materi := "Tilawati hal 5, hafalan Al-Fatihah"
	created, err := a.Create(ctx, AttendanceInput{
		Date:        time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC),
		DurationMin: &dur,
		TeacherID:   teacher.ID,
		StudentID:   student.ID,
		Status:      model.AttendanceHadir,
		Materi:      &materi,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.ID == "" || created.Status != model.AttendanceHadir {
		t.Fatalf("unexpected created: %+v", created)
	}
	if created.TeacherName != "Test Teacher" || created.StudentName != "Alice" {
		t.Errorf("join didn't populate names: teacher=%q student=%q",
			created.TeacherName, created.StudentName)
	}
	if created.DurationMin == nil || *created.DurationMin != 45 {
		t.Errorf("DurationMin = %v, want 45", created.DurationMin)
	}

	updated, err := a.Update(ctx, created.ID, AttendanceInput{
		Date:      created.Date,
		TeacherID: teacher.ID,
		StudentID: student.ID,
		Status:    model.AttendanceIzinMurid,
		Materi:    &materi,
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Status != model.AttendanceIzinMurid {
		t.Errorf("Status after update = %q", updated.Status)
	}
	if updated.DurationMin != nil {
		t.Errorf("DurationMin should clear to nil, got %v", *updated.DurationMin)
	}

	if err := a.Delete(ctx, created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := a.Get(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get after delete: err = %v, want ErrNotFound", err)
	}
}

func TestAttendancesListFilters(t *testing.T) {
	a, student, teacher := newAttendancesDB(t)
	ctx := context.Background()

	for i, date := range []time.Time{
		time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC),
	} {
		st := model.AttendanceHadir
		if i == 1 {
			st = model.AttendanceIzinMurid
		}
		if _, err := a.Create(ctx, AttendanceInput{
			Date:      date,
			TeacherID: teacher.ID,
			StudentID: student.ID,
			Status:    st,
		}); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}

	all, err := a.List(ctx, AttendanceListParams{})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if all.Total != 3 {
		t.Errorf("total = %d, want 3", all.Total)
	}
	// Items are ordered date DESC.
	if !all.Items[0].Date.Equal(time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("first item date = %v, want 2025-12-31", all.Items[0].Date)
	}

	from := time.Date(2025, 4, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2025, 6, 30, 0, 0, 0, 0, time.UTC)
	res, _ := a.List(ctx, AttendanceListParams{DateFrom: &from, DateTo: &to})
	if res.Total != 1 || !res.Items[0].Date.Equal(time.Date(2025, 5, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("date filter result: %+v", res)
	}

	res, _ = a.List(ctx, AttendanceListParams{Status: "izin_murid"})
	if res.Total != 1 {
		t.Errorf("status filter total = %d, want 1", res.Total)
	}

	res, _ = a.List(ctx, AttendanceListParams{StudentID: student.ID})
	if res.Total != 3 {
		t.Errorf("student filter total = %d, want 3", res.Total)
	}
}

func TestAttendancesEnforceStatusEnum(t *testing.T) {
	a, student, teacher := newAttendancesDB(t)
	_, err := a.Create(context.Background(), AttendanceInput{
		Date:      time.Now().UTC(),
		TeacherID: teacher.ID,
		StudentID: student.ID,
		Status:    model.AttendanceStatus("bogus"),
	})
	if err == nil {
		t.Error("expected CHECK constraint failure on bogus status")
	}
}
