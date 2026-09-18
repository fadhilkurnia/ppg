package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

type StudentTeachers struct {
	db *sql.DB
}

func NewStudentTeachers(db *sql.DB) *StudentTeachers {
	return &StudentTeachers{db: db}
}

// Assign creates or updates a student-teacher relation.
func (st *StudentTeachers) Assign(ctx context.Context, studentID, teacherID string, notes *string) (*model.StudentTeacher, error) {
	if strings.TrimSpace(studentID) == "" || strings.TrimSpace(teacherID) == "" {
		return nil, errors.New("studentId and teacherId are required")
	}

	id := ulid.Make().String()
	now := time.Now().UTC()

	_, err := st.db.ExecContext(ctx,
		`INSERT INTO student_teachers (id, student_id, teacher_id, notes, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(student_id, teacher_id) DO UPDATE SET
		   notes = COALESCE(excluded.notes, student_teachers.notes),
		   updated_at = excluded.updated_at`,
		id, studentID, teacherID, notes, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("assign student-teacher: %w", err)
	}

	return st.Get(ctx, studentID, teacherID)
}

// Unassign removes a student-teacher relation by studentID and teacherID.
func (st *StudentTeachers) Unassign(ctx context.Context, studentID, teacherID string) error {
	res, err := st.db.ExecContext(ctx,
		`DELETE FROM student_teachers WHERE student_id = ? AND teacher_id = ?`,
		studentID, teacherID,
	)
	if err != nil {
		return fmt.Errorf("unassign student-teacher: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteByID removes a relation by its primary key ID.
func (st *StudentTeachers) DeleteByID(ctx context.Context, id string) error {
	res, err := st.db.ExecContext(ctx, `DELETE FROM student_teachers WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete student-teacher by id: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// Get retrieves a single student-teacher relation.
func (st *StudentTeachers) Get(ctx context.Context, studentID, teacherID string) (*model.StudentTeacher, error) {
	row := st.db.QueryRowContext(ctx,
		`SELECT id, student_id, teacher_id, notes, created_at, updated_at
		 FROM student_teachers
		 WHERE student_id = ? AND teacher_id = ?`,
		studentID, teacherID,
	)
	var m model.StudentTeacher
	if err := row.Scan(&m.ID, &m.StudentID, &m.TeacherID, &m.Notes, &m.CreatedAt, &m.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get student-teacher: %w", err)
	}
	return &m, nil
}

// SetTeachersForStudent atomically replaces all assigned teachers for a given student.
func (st *StudentTeachers) SetTeachersForStudent(ctx context.Context, studentID string, teacherIDs []string) error {
	tx, err := st.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM student_teachers WHERE student_id = ?`, studentID); err != nil {
		return fmt.Errorf("clear student teachers: %w", err)
	}

	now := time.Now().UTC()
	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO student_teachers (id, student_id, teacher_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	seen := make(map[string]bool)
	for _, tid := range teacherIDs {
		tid = strings.TrimSpace(tid)
		if tid == "" || seen[tid] {
			continue
		}
		seen[tid] = true
		id := ulid.Make().String()
		if _, err := stmt.ExecContext(ctx, id, studentID, tid, now, now); err != nil {
			return fmt.Errorf("insert student teacher (%s, %s): %w", studentID, tid, err)
		}
	}

	return tx.Commit()
}

// SetStudentsForTeacher atomically replaces all assigned students for a given teacher.
func (st *StudentTeachers) SetStudentsForTeacher(ctx context.Context, teacherID string, studentIDs []string) error {
	tx, err := st.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM student_teachers WHERE teacher_id = ?`, teacherID); err != nil {
		return fmt.Errorf("clear teacher students: %w", err)
	}

	now := time.Now().UTC()
	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO student_teachers (id, student_id, teacher_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	seen := make(map[string]bool)
	for _, sid := range studentIDs {
		sid = strings.TrimSpace(sid)
		if sid == "" || seen[sid] {
			continue
		}
		seen[sid] = true
		id := ulid.Make().String()
		if _, err := stmt.ExecContext(ctx, id, sid, teacherID, now, now); err != nil {
			return fmt.Errorf("insert student teacher (%s, %s): %w", sid, teacherID, err)
		}
	}

	return tx.Commit()
}

// GetTeachersByStudentID returns all teachers assigned to a student.
func (st *StudentTeachers) GetTeachersByStudentID(ctx context.Context, studentID string) ([]model.Teacher, error) {
	rows, err := st.db.QueryContext(ctx,
		`SELECT t.id, t.name, t.nickname, t.kelompok, t.desa, t.daerah, t.joined_at, t.retired_at,
		        t.status, t.notes, t.created_at, t.updated_at
		 FROM teachers t
		 JOIN student_teachers st ON st.teacher_id = t.id
		 WHERE st.student_id = ?
		 ORDER BY t.name COLLATE NOCASE ASC`,
		studentID,
	)
	if err != nil {
		return nil, fmt.Errorf("query teachers for student: %w", err)
	}
	defer rows.Close()

	var result []model.Teacher
	for rows.Next() {
		tc, err := scanTeacher(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *tc)
	}
	return result, rows.Err()
}

// GetStudentsByTeacherID returns all students assigned to a teacher.
func (st *StudentTeachers) GetStudentsByTeacherID(ctx context.Context, teacherID string) ([]model.Student, error) {
	rows, err := st.db.QueryContext(ctx,
		`SELECT s.id, s.name, s.nickname, s.date_of_birth, s.gender, s.level, s.kelompok, s.city,
		        s.joined_at, s.left_at, s.leave_reason, s.status, s.parent_name, s.parent_phone, s.parent_email,
		        s.created_at, s.updated_at
		 FROM students s
		 JOIN student_teachers st ON st.student_id = s.id
		 WHERE st.teacher_id = ?
		 ORDER BY s.name COLLATE NOCASE ASC`,
		teacherID,
	)
	if err != nil {
		return nil, fmt.Errorf("query students for teacher: %w", err)
	}
	defer rows.Close()

	var result []model.Student
	for rows.Next() {
		s, err := scanStudent(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *s)
	}
	return result, rows.Err()
}

// List returns joined detail rows, optionally filtered by studentID and/or teacherID.
func (st *StudentTeachers) List(ctx context.Context, studentID, teacherID string) ([]model.StudentTeacherDetail, error) {
	query := `SELECT st.id, st.student_id, s.name, s.nickname, s.level, s.kelompok, s.status,
	                 st.teacher_id, t.name, t.nickname, t.kelompok, t.status,
	                 st.notes, st.created_at, st.updated_at
	          FROM student_teachers st
	          JOIN students s ON s.id = st.student_id
	          JOIN teachers t ON t.id = st.teacher_id`

	var conditions []string
	var args []any

	if studentID != "" {
		conditions = append(conditions, "st.student_id = ?")
		args = append(args, studentID)
	}
	if teacherID != "" {
		conditions = append(conditions, "st.teacher_id = ?")
		args = append(args, teacherID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY t.name COLLATE NOCASE ASC, s.name COLLATE NOCASE ASC"

	rows, err := st.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list student teachers: %w", err)
	}
	defer rows.Close()

	var result []model.StudentTeacherDetail
	for rows.Next() {
		var d model.StudentTeacherDetail
		if err := rows.Scan(
			&d.ID, &d.StudentID, &d.StudentName, &d.StudentNickname, &d.StudentLevel, &d.StudentKelompok, &d.StudentStatus,
			&d.TeacherID, &d.TeacherName, &d.TeacherNickname, &d.TeacherKelompok, &d.TeacherStatus,
			&d.Notes, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan student teacher detail: %w", err)
		}
		result = append(result, d)
	}
	return result, rows.Err()
}
