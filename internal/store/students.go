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

type Students struct {
	db *sql.DB
}

func NewStudents(db *sql.DB) *Students {
	return &Students{db: db}
}

type StudentInput struct {
	Name        string
	Nickname    *string
	DateOfBirth *time.Time
	Level       *model.StudentLevel
	Kelompok    *string
	JoinedAt    *time.Time
	LeftAt      *time.Time
	LeaveReason *string
	Status      model.StudentStatus
	ParentName  *string
	ParentPhone *string
	ParentEmail *string
}

type ListParams struct {
	Query  string
	Status string // "", "active", "left"
	Limit  int
	Offset int
}

type ListResult struct {
	Items []model.Student `json:"items"`
	Total int             `json:"total"`
}

const selectStudent = `SELECT id, name, nickname, date_of_birth, level, kelompok,
	joined_at, left_at, leave_reason, status, parent_name, parent_phone, parent_email,
	created_at, updated_at FROM students`

func (s *Students) Create(ctx context.Context, in StudentInput) (*model.Student, error) {
	if in.Status == "" {
		in.Status = model.StudentActive
	}
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO students
		   (id, name, nickname, date_of_birth, level, kelompok,
		    joined_at, left_at, leave_reason, status,
		    parent_name, parent_phone, parent_email,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Name, in.Nickname,
		nullableDate(in.DateOfBirth), nullableLevel(in.Level), in.Kelompok,
		nullableDate(in.JoinedAt), nullableDate(in.LeftAt), in.LeaveReason,
		string(in.Status), in.ParentName, in.ParentPhone, in.ParentEmail,
		now, now)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *Students) Get(ctx context.Context, id string) (*model.Student, error) {
	row := s.db.QueryRowContext(ctx, selectStudent+` WHERE id = ?`, id)
	return scanStudent(row)
}

func (s *Students) Update(ctx context.Context, id string, in StudentInput) (*model.Student, error) {
	if in.Status == "" {
		in.Status = model.StudentActive
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`UPDATE students SET
		   name = ?, nickname = ?, date_of_birth = ?, level = ?, kelompok = ?,
		   joined_at = ?, left_at = ?, leave_reason = ?, status = ?,
		   parent_name = ?, parent_phone = ?, parent_email = ?, updated_at = ?
		 WHERE id = ?`,
		in.Name, in.Nickname,
		nullableDate(in.DateOfBirth), nullableLevel(in.Level), in.Kelompok,
		nullableDate(in.JoinedAt), nullableDate(in.LeftAt), in.LeaveReason,
		string(in.Status), in.ParentName, in.ParentPhone, in.ParentEmail,
		now, id)
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
	return s.Get(ctx, id)
}

func (s *Students) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM students WHERE id = ?`, id)
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

func (s *Students) List(ctx context.Context, p ListParams) (*ListResult, error) {
	if p.Limit <= 0 || p.Limit > 200 {
		p.Limit = 50
	}
	if p.Offset < 0 {
		p.Offset = 0
	}

	var clauses []string
	var args []any
	if q := strings.TrimSpace(p.Query); q != "" {
		clauses = append(clauses, "(name LIKE ? OR nickname LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if p.Status != "" {
		clauses = append(clauses, "status = ?")
		args = append(args, p.Status)
	}

	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM students`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count students: %w", err)
	}

	listArgs := append(append([]any{}, args...), p.Limit, p.Offset)
	rows, err := s.db.QueryContext(ctx,
		selectStudent+where+` ORDER BY name ASC LIMIT ? OFFSET ?`,
		listArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.Student{}
	for rows.Next() {
		st, err := readStudent(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *st)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &ListResult{Items: items, Total: total}, nil
}

func nullableLevel(l *model.StudentLevel) any {
	if l == nil {
		return nil
	}
	return string(*l)
}

func scanStudent(s scanner) (*model.Student, error) {
	st, err := readStudent(s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return st, nil
}

func readStudent(s scanner) (*model.Student, error) {
	var st model.Student
	var status string
	var dob, joinedAt, leftAt sql.NullTime
	var level sql.NullString
	if err := s.Scan(
		&st.ID, &st.Name, &st.Nickname, &dob, &level, &st.Kelompok,
		&joinedAt, &leftAt, &st.LeaveReason, &status,
		&st.ParentName, &st.ParentPhone, &st.ParentEmail,
		&st.CreatedAt, &st.UpdatedAt,
	); err != nil {
		return nil, err
	}
	st.Status = model.StudentStatus(status)
	if dob.Valid {
		v := dob.Time
		st.DateOfBirth = &v
	}
	if joinedAt.Valid {
		v := joinedAt.Time
		st.JoinedAt = &v
	}
	if leftAt.Valid {
		v := leftAt.Time
		st.LeftAt = &v
	}
	if level.Valid {
		v := model.StudentLevel(level.String)
		st.Level = &v
	}
	return &st, nil
}
