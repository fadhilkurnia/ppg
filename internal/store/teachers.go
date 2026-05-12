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

type Teachers struct {
	db *sql.DB
}

func NewTeachers(db *sql.DB) *Teachers {
	return &Teachers{db: db}
}

type TeacherInput struct {
	Name      string
	Nickname  *string
	Gender    *string // 'male' | 'female' | nil
	Kelompok  string
	Desa      string
	Daerah    string
	JoinedAt  *time.Time
	RetiredAt *time.Time
	Status    model.TeacherStatus
	Notes     *string
}

type TeacherListParams struct {
	Query  string
	Status string // "", "active", "retired"
	Daerah string
	Limit  int
	Offset int
}

type TeacherListResult struct {
	Items []model.Teacher `json:"items"`
	Total int             `json:"total"`
}

const selectTeacher = `SELECT id, name, nickname, gender, kelompok, desa, daerah, joined_at, retired_at,
	status, notes, created_at, updated_at FROM teachers`

func (t *Teachers) Create(ctx context.Context, in TeacherInput) (*model.Teacher, error) {
	id := ulid.Make().String()
	now := time.Now().UTC()
	if in.Status == "" {
		in.Status = model.TeacherActive
	}
	_, err := t.db.ExecContext(ctx,
		`INSERT INTO teachers
		   (id, name, nickname, gender, kelompok, desa, daerah, joined_at, retired_at,
		    status, notes, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Name, in.Nickname, in.Gender, in.Kelompok, in.Desa, in.Daerah,
		nullableDate(in.JoinedAt), nullableDate(in.RetiredAt),
		string(in.Status), in.Notes, now, now)
	if err != nil {
		return nil, err
	}
	return t.Get(ctx, id)
}

func (t *Teachers) Get(ctx context.Context, id string) (*model.Teacher, error) {
	row := t.db.QueryRowContext(ctx, selectTeacher+` WHERE id = ?`, id)
	return scanTeacher(row)
}

func (t *Teachers) Update(ctx context.Context, id string, in TeacherInput) (*model.Teacher, error) {
	now := time.Now().UTC()
	if in.Status == "" {
		in.Status = model.TeacherActive
	}
	res, err := t.db.ExecContext(ctx,
		`UPDATE teachers
		    SET name = ?, nickname = ?, gender = ?, kelompok = ?, desa = ?, daerah = ?,
		        joined_at = ?, retired_at = ?, status = ?, notes = ?, updated_at = ?
		  WHERE id = ?`,
		in.Name, in.Nickname, in.Gender, in.Kelompok, in.Desa, in.Daerah,
		nullableDate(in.JoinedAt), nullableDate(in.RetiredAt),
		string(in.Status), in.Notes, now, id)
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
	return t.Get(ctx, id)
}

func (t *Teachers) Delete(ctx context.Context, id string) error {
	res, err := t.db.ExecContext(ctx, `DELETE FROM teachers WHERE id = ?`, id)
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

func (t *Teachers) List(ctx context.Context, p TeacherListParams) (*TeacherListResult, error) {
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
	if d := strings.TrimSpace(p.Daerah); d != "" {
		clauses = append(clauses, "daerah = ?")
		args = append(args, d)
	}

	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	if err := t.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM teachers`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count teachers: %w", err)
	}

	listArgs := append(append([]any{}, args...), p.Limit, p.Offset)
	rows, err := t.db.QueryContext(ctx,
		selectTeacher+where+` ORDER BY name ASC LIMIT ? OFFSET ?`,
		listArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.Teacher{}
	for rows.Next() {
		tt, err := readTeacher(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *tt)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &TeacherListResult{Items: items, Total: total}, nil
}

type TeacherStats struct {
	Total       int      `json:"total"`       // every row
	ActiveTotal int      `json:"activeTotal"` // status='active'
	ByStatus    []Bucket `json:"byStatus"`    // active vs retired
	ByDaerah    []Bucket `json:"byDaerah"`    // active only, sorted by count desc
}

func (t *Teachers) Stats(ctx context.Context) (*TeacherStats, error) {
	out := &TeacherStats{}

	if err := t.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM teachers`).Scan(&out.Total); err != nil {
		return nil, err
	}
	if err := t.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM teachers WHERE status = 'active'`).Scan(&out.ActiveTotal); err != nil {
		return nil, err
	}

	statusRows, err := t.db.QueryContext(ctx,
		`SELECT status, COUNT(*) FROM teachers GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer statusRows.Close()
	statusMap := map[string]int{}
	for statusRows.Next() {
		var s string
		var n int
		if err := statusRows.Scan(&s, &n); err != nil {
			return nil, err
		}
		statusMap[s] = n
	}
	if err := statusRows.Err(); err != nil {
		return nil, err
	}
	out.ByStatus = []Bucket{
		{Label: "active", Count: statusMap["active"]},
		{Label: "retired", Count: statusMap["retired"]},
	}

	daerahRows, err := t.db.QueryContext(ctx,
		`SELECT daerah, COUNT(*) AS n
		   FROM teachers
		  WHERE status = 'active'
		  GROUP BY daerah
		  ORDER BY n DESC, daerah ASC`)
	if err != nil {
		return nil, err
	}
	defer daerahRows.Close()
	for daerahRows.Next() {
		var b Bucket
		if err := daerahRows.Scan(&b.Label, &b.Count); err != nil {
			return nil, err
		}
		out.ByDaerah = append(out.ByDaerah, b)
	}
	return out, daerahRows.Err()
}

func nullableDate(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UTC()
}

func scanTeacher(s scanner) (*model.Teacher, error) {
	tt, err := readTeacher(s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return tt, nil
}

func readTeacher(s scanner) (*model.Teacher, error) {
	var t model.Teacher
	var status string
	var joinedAt, retiredAt sql.NullTime
	if err := s.Scan(
		&t.ID, &t.Name, &t.Nickname, &t.Gender, &t.Kelompok, &t.Desa, &t.Daerah,
		&joinedAt, &retiredAt, &status, &t.Notes, &t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	t.Status = model.TeacherStatus(status)
	if joinedAt.Valid {
		v := joinedAt.Time
		t.JoinedAt = &v
	}
	if retiredAt.Valid {
		v := retiredAt.Time
		t.RetiredAt = &v
	}
	return &t, nil
}
