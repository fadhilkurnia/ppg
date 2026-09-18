package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func setupTestStore(t *testing.T) (*Students, *Teachers, *StudentTeachers) {
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
	return NewStudents(db), NewTeachers(db), NewStudentTeachers(db)
}

func TestStudentTeachersCRUD(t *testing.T) {
	students, teachers, st := setupTestStore(t)
	ctx := context.Background()

	// Create test teacher & student
	tc, err := teachers.Create(ctx, TeacherInput{
		Name:     "Ustadz Fadhil",
		Kelompok: "California",
		Desa:     "Desa 1",
		Daerah:   "Daerah 1",
		Status:   model.TeacherActive,
	})
	if err != nil {
		t.Fatalf("create teacher: %v", err)
	}

	dob := time.Date(2015, 1, 1, 0, 0, 0, 0, time.UTC)
	s, err := students.Create(ctx, StudentInput{
		Name:        "Ahmad Santri",
		DateOfBirth: &dob,
		Gender:      "male",
		Level:       model.LevelCaberawit,
		Kelompok:    "California",
		Status:      model.StudentActive,
	})
	if err != nil {
		t.Fatalf("create student: %v", err)
	}

	// 1. Assign
	notes := "Kelas Al-Quran Dasar"
	assigned, err := st.Assign(ctx, s.ID, tc.ID, &notes)
	if err != nil {
		t.Fatalf("assign: %v", err)
	}
	if assigned.StudentID != s.ID || assigned.TeacherID != tc.ID {
		t.Errorf("unexpected assigned: %+v", assigned)
	}
	if assigned.Notes == nil || *assigned.Notes != notes {
		t.Errorf("unexpected notes: %v", assigned.Notes)
	}

	// 2. GetTeachersByStudentID
	tList, err := st.GetTeachersByStudentID(ctx, s.ID)
	if err != nil {
		t.Fatalf("get teachers by student: %v", err)
	}
	if len(tList) != 1 || tList[0].ID != tc.ID {
		t.Errorf("expected 1 teacher with ID %s, got %+v", tc.ID, tList)
	}

	// 3. GetStudentsByTeacherID
	sList, err := st.GetStudentsByTeacherID(ctx, tc.ID)
	if err != nil {
		t.Fatalf("get students by teacher: %v", err)
	}
	if len(sList) != 1 || sList[0].ID != s.ID {
		t.Errorf("expected 1 student with ID %s, got %+v", s.ID, sList)
	}

	// 4. List details
	details, err := st.List(ctx, s.ID, tc.ID)
	if err != nil {
		t.Fatalf("list details: %v", err)
	}
	if len(details) != 1 || details[0].StudentName != "Ahmad Santri" || details[0].TeacherName != "Ustadz Fadhil" {
		t.Errorf("unexpected details: %+v", details)
	}

	// 5. Unassign
	if err := st.Unassign(ctx, s.ID, tc.ID); err != nil {
		t.Fatalf("unassign: %v", err)
	}

	tListAfter, err := st.GetTeachersByStudentID(ctx, s.ID)
	if err != nil {
		t.Fatalf("get teachers after unassign: %v", err)
	}
	if len(tListAfter) != 0 {
		t.Errorf("expected 0 teachers, got %d", len(tListAfter))
	}
}

func TestBatchAssignment(t *testing.T) {
	students, teachers, st := setupTestStore(t)
	ctx := context.Background()

	tc1, _ := teachers.Create(ctx, TeacherInput{Name: "Guru 1", Kelompok: "California", Desa: "D1", Daerah: "D1", Status: model.TeacherActive})
	tc2, _ := teachers.Create(ctx, TeacherInput{Name: "Guru 2", Kelompok: "California", Desa: "D1", Daerah: "D1", Status: model.TeacherActive})
	dob := time.Date(2015, 1, 1, 0, 0, 0, 0, time.UTC)
	s1, _ := students.Create(ctx, StudentInput{Name: "Murid 1", DateOfBirth: &dob, Gender: "male", Level: model.LevelCaberawit, Kelompok: "California", Status: model.StudentActive})
	s2, _ := students.Create(ctx, StudentInput{Name: "Murid 2", DateOfBirth: &dob, Gender: "female", Level: model.LevelCaberawit, Kelompok: "California", Status: model.StudentActive})

	// Set multiple teachers for s1
	if err := st.SetTeachersForStudent(ctx, s1.ID, []string{tc1.ID, tc2.ID}); err != nil {
		t.Fatalf("set teachers for student: %v", err)
	}
	tList, err := st.GetTeachersByStudentID(ctx, s1.ID)
	if err != nil || len(tList) != 2 {
		t.Fatalf("expected 2 teachers for s1, got %d (err: %v)", len(tList), err)
	}

	// Set multiple students for tc1
	if err := st.SetStudentsForTeacher(ctx, tc1.ID, []string{s1.ID, s2.ID}); err != nil {
		t.Fatalf("set students for teacher: %v", err)
	}
	sList, err := st.GetStudentsByTeacherID(ctx, tc1.ID)
	if err != nil || len(sList) != 2 {
		t.Fatalf("expected 2 students for tc1, got %d (err: %v)", len(sList), err)
	}

	// Atomic update: remove tc2 from s1
	if err := st.SetTeachersForStudent(ctx, s1.ID, []string{tc1.ID}); err != nil {
		t.Fatalf("update teachers for student: %v", err)
	}
	tListUpdated, _ := st.GetTeachersByStudentID(ctx, s1.ID)
	if len(tListUpdated) != 1 || tListUpdated[0].ID != tc1.ID {
		t.Errorf("expected only tc1 for s1, got %+v", tListUpdated)
	}
}
