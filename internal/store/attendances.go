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

type Attendances struct {
	db *sql.DB
}

func NewAttendances(db *sql.DB) *Attendances {
	return &Attendances{db: db}
}

type AttendanceInput struct {
	Date        time.Time
	DurationMin *int
	TeacherID   string
	StudentID   string
	Status      model.AttendanceStatus
	Materi      *string
}

type AttendanceListParams struct {
	DateFrom  *time.Time
	DateTo    *time.Time
	TeacherID string
	StudentID string
	Status    string // "" or one of the 4 enum values
	Limit     int
	Offset    int
}

type AttendanceListResult struct {
	Items []model.Attendance `json:"items"`
	Total int                `json:"total"`
}

const selectAttendance = `
SELECT a.id, a.date, a.duration_min,
       a.teacher_id, t.name,
       a.student_id, s.name,
       a.status, a.materi, a.created_at, a.updated_at
  FROM attendances a
  JOIN teachers t ON t.id = a.teacher_id
  JOIN students s ON s.id = a.student_id`

func (a *Attendances) Create(ctx context.Context, in AttendanceInput) (*model.Attendance, error) {
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err := a.db.ExecContext(ctx,
		`INSERT INTO attendances
		   (id, date, duration_min, teacher_id, student_id, status, materi,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Date.UTC(), nullableInt(in.DurationMin),
		in.TeacherID, in.StudentID, string(in.Status), in.Materi,
		now, now)
	if err != nil {
		return nil, err
	}
	return a.Get(ctx, id)
}

func (a *Attendances) Get(ctx context.Context, id string) (*model.Attendance, error) {
	row := a.db.QueryRowContext(ctx, selectAttendance+` WHERE a.id = ?`, id)
	return scanAttendance(row)
}

func (a *Attendances) Update(ctx context.Context, id string, in AttendanceInput) (*model.Attendance, error) {
	now := time.Now().UTC()
	res, err := a.db.ExecContext(ctx,
		`UPDATE attendances SET
		   date = ?, duration_min = ?, teacher_id = ?, student_id = ?,
		   status = ?, materi = ?, updated_at = ?
		 WHERE id = ?`,
		in.Date.UTC(), nullableInt(in.DurationMin), in.TeacherID, in.StudentID,
		string(in.Status), in.Materi, now, id)
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrNotFound
	}
	return a.Get(ctx, id)
}

func (a *Attendances) Delete(ctx context.Context, id string) error {
	res, err := a.db.ExecContext(ctx, `DELETE FROM attendances WHERE id = ?`, id)
	if err != nil {
		return err
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

func (a *Attendances) List(ctx context.Context, p AttendanceListParams) (*AttendanceListResult, error) {
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}
	if p.Offset < 0 {
		p.Offset = 0
	}

	var clauses []string
	var args []any
	if p.DateFrom != nil {
		clauses = append(clauses, "a.date >= ?")
		args = append(args, p.DateFrom.UTC())
	}
	if p.DateTo != nil {
		clauses = append(clauses, "a.date <= ?")
		args = append(args, p.DateTo.UTC())
	}
	if p.TeacherID != "" {
		clauses = append(clauses, "a.teacher_id = ?")
		args = append(args, p.TeacherID)
	}
	if p.StudentID != "" {
		clauses = append(clauses, "a.student_id = ?")
		args = append(args, p.StudentID)
	}
	if p.Status != "" {
		clauses = append(clauses, "a.status = ?")
		args = append(args, p.Status)
	}

	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	if err := a.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM attendances a`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count attendances: %w", err)
	}

	listArgs := append(append([]any{}, args...), p.Limit, p.Offset)
	rows, err := a.db.QueryContext(ctx,
		selectAttendance+where+` ORDER BY a.date DESC, a.id DESC LIMIT ? OFFSET ?`,
		listArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.Attendance{}
	for rows.Next() {
		att, err := readAttendance(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *att)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &AttendanceListResult{Items: items, Total: total}, nil
}

func nullableInt(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}

func scanAttendance(s scanner) (*model.Attendance, error) {
	att, err := readAttendance(s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return att, nil
}

func readAttendance(s scanner) (*model.Attendance, error) {
	var a model.Attendance
	var status string
	var durationMin sql.NullInt64
	if err := s.Scan(
		&a.ID, &a.Date, &durationMin,
		&a.TeacherID, &a.TeacherName,
		&a.StudentID, &a.StudentName,
		&status, &a.Materi, &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		return nil, err
	}
	a.Status = model.AttendanceStatus(status)
	if durationMin.Valid {
		v := int(durationMin.Int64)
		a.DurationMin = &v
	}
	return &a, nil
}
