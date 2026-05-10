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
	StudentID   string
	Name        string
	DateOfBirth time.Time
	Gender      string
	Address     *string
	ParentName  string
	ParentPhone string
	ParentEmail *string
}

type ListParams struct {
	Query  string
	Limit  int
	Offset int
}

type ListResult struct {
	Items []model.Student `json:"items"`
	Total int             `json:"total"`
}

func (s *Students) Create(ctx context.Context, in StudentInput) (*model.Student, error) {
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO students (id, student_id, name, date_of_birth, gender, address,
		   parent_name, parent_phone, parent_email, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.StudentID, in.Name, in.DateOfBirth, in.Gender, in.Address,
		in.ParentName, in.ParentPhone, in.ParentEmail, now, now)
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
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`UPDATE students
		    SET student_id = ?, name = ?, date_of_birth = ?, gender = ?, address = ?,
		        parent_name = ?, parent_phone = ?, parent_email = ?, updated_at = ?
		  WHERE id = ?`,
		in.StudentID, in.Name, in.DateOfBirth, in.Gender, in.Address,
		in.ParentName, in.ParentPhone, in.ParentEmail, now, id)
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

	args := []any{}
	where := ""
	if q := strings.TrimSpace(p.Query); q != "" {
		where = ` WHERE name LIKE ? OR student_id LIKE ?`
		like := "%" + q + "%"
		args = append(args, like, like)
	}

	var total int
	countQuery := `SELECT COUNT(*) FROM students` + where
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count: %w", err)
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
		st, err := scanStudentRows(rows)
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

const selectStudent = `SELECT id, student_id, name, date_of_birth, gender, address,
	parent_name, parent_phone, parent_email, created_at, updated_at FROM students`

type scanner interface {
	Scan(dest ...any) error
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

func scanStudentRows(s scanner) (*model.Student, error) {
	return readStudent(s)
}

func readStudent(s scanner) (*model.Student, error) {
	var st model.Student
	if err := s.Scan(
		&st.ID, &st.StudentID, &st.Name, &st.DateOfBirth, &st.Gender, &st.Address,
		&st.ParentName, &st.ParentPhone, &st.ParentEmail, &st.CreatedAt, &st.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &st, nil
}
