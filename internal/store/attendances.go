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

// Attendances — kehadiran log. Ported from fadhilkurnia/ppg main with the
// teacher/student FKs relaxed (rows reference the unified users table by
// id without an explicit constraint).

type Attendances struct {
	db *sql.DB
}

func NewAttendances(db *sql.DB) *Attendances { return &Attendances{db: db} }

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
	Status    string
	Limit     int
	Offset    int
}

type AttendanceListResult struct {
	Items []model.Attendance `json:"items"`
	Total int                `json:"total"`
}

const selectAttendance = `
SELECT a.id, a.date, a.duration_min,
       a.teacher_id, COALESCE(t.name, a.teacher_id),
       a.student_id, COALESCE(s.name, a.student_id),
       a.status, a.materi, a.created_at, a.updated_at
  FROM attendances a
  LEFT JOIN users t ON t.id = a.teacher_id
  LEFT JOIN users s ON s.id = a.student_id`

func (a *Attendances) Create(ctx context.Context, in AttendanceInput) (*model.Attendance, error) {
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err := a.db.ExecContext(ctx,
		`INSERT INTO attendances
		   (id, date, duration_min, teacher_id, student_id, status, materi,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Date.UTC(), nullableAttInt(in.DurationMin),
		in.TeacherID, in.StudentID, string(in.Status), in.Materi,
		now, now)
	if err != nil {
		return nil, err
	}
	return a.Get(ctx, id)
}

func (a *Attendances) Get(ctx context.Context, id string) (*model.Attendance, error) {
	return scanAttendance(a.db.QueryRowContext(ctx, selectAttendance+` WHERE a.id = ?`, id))
}

func (a *Attendances) Update(ctx context.Context, id string, in AttendanceInput) (*model.Attendance, error) {
	now := time.Now().UTC()
	res, err := a.db.ExecContext(ctx,
		`UPDATE attendances SET
		   date = ?, duration_min = ?, teacher_id = ?, student_id = ?,
		   status = ?, materi = ?, updated_at = ?
		 WHERE id = ?`,
		in.Date.UTC(), nullableAttInt(in.DurationMin), in.TeacherID, in.StudentID,
		string(in.Status), in.Materi, now, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return a.Get(ctx, id)
}

func (a *Attendances) Delete(ctx context.Context, id string) error {
	res, err := a.db.ExecContext(ctx, `DELETE FROM attendances WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
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
	return &AttendanceListResult{Items: items, Total: total}, rows.Err()
}

// --- Stats ---------------------------------------------------------------

type AttendanceTotals struct {
	Sessions    int     `json:"sessions"`
	Hours       float64 `json:"hours"`
	Last30Days  int     `json:"last30Days"`
	ActivePairs int     `json:"activePairs"`
}
type MonthlyBucket struct {
	Month    string  `json:"month"`
	Sessions int     `json:"sessions"`
	Hours    float64 `json:"hours"`
}
type StudentAggregate struct {
	StudentID     string  `json:"studentId"`
	StudentName   string  `json:"studentName"`
	TotalSessions int     `json:"totalSessions"`
	HadirSessions int     `json:"hadirSessions"`
	HadirRate     float64 `json:"hadirRate"`
	TotalHours    float64 `json:"totalHours"`
	LastDate      *string `json:"lastDate,omitempty"`
}
type TeacherAggregate struct {
	TeacherID      string  `json:"teacherId"`
	TeacherName    string  `json:"teacherName"`
	TotalSessions  int     `json:"totalSessions"`
	TotalHours     float64 `json:"totalHours"`
	UniqueStudents int     `json:"uniqueStudents"`
	LastDate       *string `json:"lastDate,omitempty"`
}
type AttendanceStatsParams struct {
	DateFrom *time.Time
	DateTo   *time.Time
}
type AttendanceStats struct {
	Total          AttendanceTotals   `json:"total"`
	Monthly        []MonthlyBucket    `json:"monthly"`
	ByStatus       []Bucket           `json:"byStatus"`
	ByStudent      []StudentAggregate `json:"byStudent"`
	ByTeacher      []TeacherAggregate `json:"byTeacher"`
	AvailableYears []int              `json:"availableYears"`
}

// Stats — port from fadhilkurnia/ppg main. Last30Days + ActivePairs use a
// rolling 30-day window regardless of the date filter. AvailableYears is
// always computed across the full table so the UI keeps year tabs.
func (a *Attendances) Stats(ctx context.Context, p AttendanceStatsParams) (*AttendanceStats, error) {
	out := &AttendanceStats{}
	var clauses []string
	var args []any
	if p.DateFrom != nil {
		clauses = append(clauses, "date >= ?")
		args = append(args, p.DateFrom.UTC())
	}
	if p.DateTo != nil {
		clauses = append(clauses, "date <= ?")
		args = append(args, p.DateTo.UTC())
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}
	if err := a.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(duration_min), 0) / 60.0 FROM attendances`+where,
		args...,
	).Scan(&out.Total.Sessions, &out.Total.Hours); err != nil {
		return nil, fmt.Errorf("totals: %w", err)
	}
	if err := a.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM attendances WHERE date >= date('now', '-30 days')`,
	).Scan(&out.Total.Last30Days); err != nil {
		return nil, fmt.Errorf("last30: %w", err)
	}
	if err := a.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT teacher_id || '|' || student_id) FROM attendances
		   WHERE date >= date('now', '-30 days')`,
	).Scan(&out.Total.ActivePairs); err != nil {
		return nil, fmt.Errorf("active pairs: %w", err)
	}
	monthlyRows, err := a.db.QueryContext(ctx,
		`SELECT strftime('%Y-%m', date) AS month, COUNT(*) AS sessions,
		        COALESCE(SUM(duration_min), 0) / 60.0 AS hours
		   FROM attendances`+where+` GROUP BY month ORDER BY month ASC`, args...)
	if err != nil {
		return nil, fmt.Errorf("monthly: %w", err)
	}
	defer monthlyRows.Close()
	for monthlyRows.Next() {
		var m MonthlyBucket
		if err := monthlyRows.Scan(&m.Month, &m.Sessions, &m.Hours); err != nil {
			return nil, err
		}
		out.Monthly = append(out.Monthly, m)
	}
	statusRows, err := a.db.QueryContext(ctx,
		`SELECT status, COUNT(*) FROM attendances`+where+` GROUP BY status`, args...)
	if err != nil {
		return nil, fmt.Errorf("status: %w", err)
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
	for _, s := range []string{"hadir", "izin_murid", "izin_guru", "by_vn", "alfa"} {
		out.ByStatus = append(out.ByStatus, Bucket{Label: s, Count: statusMap[s]})
	}
	studentWhere := ""
	if where != "" {
		studentWhere = " WHERE " + strings.ReplaceAll(strings.Join(clauses, " AND "), "date ", "a.date ")
	}
	studentRows, err := a.db.QueryContext(ctx,
		`SELECT a.student_id, COALESCE(s.name, a.student_id),
		        COUNT(*) AS total,
		        SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END) AS hadir,
		        COALESCE(SUM(a.duration_min), 0) / 60.0 AS hours,
		        MAX(a.date) AS last_date
		   FROM attendances a
		   LEFT JOIN users s ON s.id = a.student_id`+studentWhere+`
		  GROUP BY a.student_id, s.name
		  ORDER BY total DESC`, args...)
	if err != nil {
		return nil, fmt.Errorf("by_student: %w", err)
	}
	defer studentRows.Close()
	for studentRows.Next() {
		var s StudentAggregate
		var lastDate sql.NullString
		if err := studentRows.Scan(&s.StudentID, &s.StudentName, &s.TotalSessions,
			&s.HadirSessions, &s.TotalHours, &lastDate); err != nil {
			return nil, err
		}
		if s.TotalSessions > 0 {
			s.HadirRate = float64(s.HadirSessions) * 100 / float64(s.TotalSessions)
		}
		if lastDate.Valid {
			ld := lastDate.String
			s.LastDate = &ld
		}
		out.ByStudent = append(out.ByStudent, s)
	}
	teacherRows, err := a.db.QueryContext(ctx,
		`SELECT a.teacher_id, COALESCE(t.name, a.teacher_id),
		        COUNT(*) AS total,
		        COALESCE(SUM(a.duration_min), 0) / 60.0 AS hours,
		        COUNT(DISTINCT a.student_id) AS uniq,
		        MAX(a.date) AS last_date
		   FROM attendances a
		   LEFT JOIN users t ON t.id = a.teacher_id`+studentWhere+`
		  GROUP BY a.teacher_id, t.name
		  ORDER BY total DESC`, args...)
	if err != nil {
		return nil, fmt.Errorf("by_teacher: %w", err)
	}
	defer teacherRows.Close()
	for teacherRows.Next() {
		var t TeacherAggregate
		var lastDate sql.NullString
		if err := teacherRows.Scan(&t.TeacherID, &t.TeacherName, &t.TotalSessions,
			&t.TotalHours, &t.UniqueStudents, &lastDate); err != nil {
			return nil, err
		}
		if lastDate.Valid {
			ld := lastDate.String
			t.LastDate = &ld
		}
		out.ByTeacher = append(out.ByTeacher, t)
	}
	yearRows, err := a.db.QueryContext(ctx,
		`SELECT DISTINCT CAST(strftime('%Y', date) AS INTEGER) AS y FROM attendances ORDER BY y ASC`)
	if err != nil {
		return nil, fmt.Errorf("available_years: %w", err)
	}
	defer yearRows.Close()
	for yearRows.Next() {
		var y int
		if err := yearRows.Scan(&y); err != nil {
			return nil, err
		}
		out.AvailableYears = append(out.AvailableYears, y)
	}
	return out, yearRows.Err()
}

func nullableAttInt(p *int) any {
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
