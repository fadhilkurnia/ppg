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
	Gender      string
	Level       model.StudentLevel
	Kelompok    string
	City        *string
	JoinedAt    *time.Time
	LeftAt      *time.Time
	LeaveReason *string
	Status      model.StudentStatus
	ParentName  *string
	ParentPhone *string
	ParentEmail *string
}

type ListParams struct {
	Query    string
	Status   string // "", "active", "left"
	Kelompok string // "" (no filter) or one of the canonical kelompoks
	Limit    int
	Offset   int
}

type ListResult struct {
	Items []model.Student `json:"items"`
	Total int             `json:"total"`
}

const selectStudent = `SELECT id, name, nickname, date_of_birth, gender, level, kelompok, city,
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
		   (id, name, nickname, date_of_birth, gender, level, kelompok, city,
		    joined_at, left_at, leave_reason, status,
		    parent_name, parent_phone, parent_email,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Name, in.Nickname,
		nullableDate(in.DateOfBirth), in.Gender, string(in.Level), in.Kelompok, in.City,
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
		   name = ?, nickname = ?, date_of_birth = ?, gender = ?, level = ?, kelompok = ?, city = ?,
		   joined_at = ?, left_at = ?, leave_reason = ?, status = ?,
		   parent_name = ?, parent_phone = ?, parent_email = ?, updated_at = ?
		 WHERE id = ?`,
		in.Name, in.Nickname,
		nullableDate(in.DateOfBirth), in.Gender, string(in.Level), in.Kelompok, in.City,
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
	if p.Kelompok != "" {
		clauses = append(clauses, "kelompok = ?")
		args = append(args, p.Kelompok)
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

type Bucket struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type LevelKelompokCell struct {
	Level    string `json:"level"`
	Kelompok string `json:"kelompok"`
	Count    int    `json:"count"`
}

type StudentStats struct {
	Total       int                 `json:"total"`       // every row
	ActiveTotal int                 `json:"activeTotal"` // status='active'
	// All distributions below count active rows only — that's the dashboard's
	// primary focus. ByStatus is the exception: it keeps the active/left
	// split so callers can still see the inactive count.
	ByGender   []Bucket            `json:"byGender"`
	ByStatus   []Bucket            `json:"byStatus"`
	ByLevel    []Bucket            `json:"byLevel"`
	ByKelompok []Bucket            `json:"byKelompok"`
	Matrix     []LevelKelompokCell `json:"matrix"`
}

// Stats produces the aggregates the dashboard needs in one round trip.
// Buckets are returned in canonical order (Caberawit → Pra Nikah for level,
// California → Canada for kelompok), with a trailing zero-count entry for
// any canonical value that has no rows.
func (s *Students) Stats(ctx context.Context) (*StudentStats, error) {
	out := &StudentStats{}

	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM students`).Scan(&out.Total); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM students WHERE status = 'active'`).Scan(&out.ActiveTotal); err != nil {
		return nil, err
	}

	gender, err := s.groupCount(ctx,
		`SELECT gender, COUNT(*) FROM students WHERE status = 'active' GROUP BY gender`)
	if err != nil {
		return nil, err
	}
	out.ByGender = orderedBuckets(gender, []string{"female", "male"})

	status, err := s.groupCount(ctx, `SELECT status, COUNT(*) FROM students GROUP BY status`)
	if err != nil {
		return nil, err
	}
	out.ByStatus = orderedBuckets(status, []string{"active", "left"})

	level, err := s.groupCount(ctx,
		`SELECT level, COUNT(*) FROM students WHERE status = 'active' GROUP BY level`)
	if err != nil {
		return nil, err
	}
	out.ByLevel = orderedBuckets(level, []string{
		string(model.LevelCaberawit),
		string(model.LevelPraRemaja),
		string(model.LevelRemaja),
		string(model.LevelPraNikah),
	})

	kelompok, err := s.groupCount(ctx,
		`SELECT kelompok, COUNT(*) FROM students WHERE status = 'active' GROUP BY kelompok`)
	if err != nil {
		return nil, err
	}
	out.ByKelompok = orderedBuckets(kelompok, model.StudentKelompoks)

	rows, err := s.db.QueryContext(ctx,
		`SELECT level, kelompok, COUNT(*)
		   FROM students
		  WHERE status = 'active'
		  GROUP BY level, kelompok`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c LevelKelompokCell
		if err := rows.Scan(&c.Level, &c.Kelompok, &c.Count); err != nil {
			return nil, err
		}
		out.Matrix = append(out.Matrix, c)
	}
	return out, rows.Err()
}

func (s *Students) groupCount(ctx context.Context, query string) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

func orderedBuckets(counts map[string]int, order []string) []Bucket {
	out := make([]Bucket, 0, len(order))
	for _, k := range order {
		out = append(out, Bucket{Label: k, Count: counts[k]})
	}
	return out
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
	var status, level string
	var dob, joinedAt, leftAt sql.NullTime
	if err := s.Scan(
		&st.ID, &st.Name, &st.Nickname, &dob, &st.Gender, &level, &st.Kelompok, &st.City,
		&joinedAt, &leftAt, &st.LeaveReason, &status,
		&st.ParentName, &st.ParentPhone, &st.ParentEmail,
		&st.CreatedAt, &st.UpdatedAt,
	); err != nil {
		return nil, err
	}
	st.Status = model.StudentStatus(status)
	st.Level = model.StudentLevel(level)
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
	return &st, nil
}
