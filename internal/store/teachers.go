package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"golang.org/x/crypto/bcrypt"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

// Teachers is a thin facade over the users table for the /api/teachers
// endpoint group. Pengajar are stored as users with role='guru' since
// migration 008. After migration 041 dropped membership_status, joined_at,
// left_at, leave_reason, teacher.status (active/retired) is synthesised
// from user.active (1/0). The handler still accepts joinedAt / retiredAt
// in the request body for back-compat but the values are no longer stored.
type Teachers struct {
	db *sql.DB
}

func NewTeachers(db *sql.DB) *Teachers {
	return &Teachers{db: db}
}

type TeacherInput struct {
	Name     string
	Nickname *string
	Gender   *string
	Kelompok string
	Desa     string
	Daerah   string
	// Status maps to User.Active — "active" → 1, "retired" → 0.
	Status model.TeacherStatus
	Notes  *string
	// Shared profile + biodata fields (same set as StudentInput per the
	// unified-user mechanism — these were previously murid-only).
	DateOfBirth       *time.Time
	NoHP              *string
	Alamat            *string
	Level             *model.StudentLevel
	ParentName        *string
	ParentTitle       *string
	ParentPhone       *string
	ParentPhoneRegion *string
	ParentEmail       *string
	UserCode          *string
	TempatLahir       *string
	Pendidikan        *string
	Pekerjaan         *string
	Urutan            int
	HideDob           bool
	TglDaftar         *time.Time
}

type TeacherListParams struct {
	Query  string
	Status string
	Daerah string
	Limit  int
	Offset int
}

type TeacherListResult struct {
	Items []model.Teacher `json:"items"`
	Total int             `json:"total"`
}

const selectTeacherCols = `id, name, nickname, gender, kelompok, desa, daerah,
	active, notes,
	date_of_birth, no_hp, alamat,
	level, parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
	user_code, tempat_lahir, pendidikan, pekerjaan,
	urutan, hide_dob, tgl_daftar,
	photo_path, created_at, updated_at`

func (t *Teachers) Create(ctx context.Context, in TeacherInput) (*model.Teacher, error) {
	if in.Status == "" {
		in.Status = model.TeacherActive
	}
	id := ulid.Make().String()
	now := time.Now().UTC()

	nickname := ""
	if in.Nickname != nil {
		nickname = *in.Nickname
	}
	email, err := uniqueDefaultEmail(ctx, t.db, emailLocalPart(nickname, in.Name), id)
	if err != nil {
		return nil, fmt.Errorf("generate default email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("changeme"), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash default password: %w", err)
	}

	active := 1
	if in.Status == model.TeacherRetired {
		active = 0
	}
	hideDobInt := 0
	if in.HideDob {
		hideDobInt = 1
	}

	_, err = t.db.ExecContext(ctx,
		`INSERT INTO users (
		   id, email, password, name, role, active,
		   nickname, gender, kelompok, desa, daerah, notes,
		   date_of_birth, no_hp, alamat,
		   level, parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
		   user_code, tempat_lahir, pendidikan, pekerjaan,
		   urutan, hide_dob, tgl_daftar,
		   created_at, updated_at
		 ) VALUES (?, ?, ?, ?, 'guru', ?,
		           ?, ?, ?, ?, ?, ?,
		           ?, ?, ?,
		           ?, ?, ?, ?, ?, ?,
		           ?, ?, ?, ?,
		           ?, ?, ?,
		           ?, ?)`,
		id, email, string(hash), in.Name, active,
		in.Nickname, in.Gender, in.Kelompok, in.Desa, in.Daerah, in.Notes,
		nullableDate(in.DateOfBirth), in.NoHP, in.Alamat,
		nullableLevel(in.Level), in.ParentName, in.ParentTitle, in.ParentPhone, in.ParentPhoneRegion, in.ParentEmail,
		in.UserCode, in.TempatLahir, in.Pendidikan, in.Pekerjaan,
		in.Urutan, hideDobInt, nullableDate(in.TglDaftar),
		now, now,
	)
	if err != nil {
		return nil, err
	}
	return t.Get(ctx, id)
}

func (t *Teachers) Get(ctx context.Context, id string) (*model.Teacher, error) {
	row := t.db.QueryRowContext(ctx,
		`SELECT `+selectTeacherCols+` FROM users WHERE id = ? AND role = 'guru'`, id)
	return scanTeacher(row)
}

func (t *Teachers) Update(ctx context.Context, id string, in TeacherInput) (*model.Teacher, error) {
	if in.Status == "" {
		in.Status = model.TeacherActive
	}
	active := 1
	if in.Status == model.TeacherRetired {
		active = 0
	}
	now := time.Now().UTC()
	hideDobInt := 0
	if in.HideDob {
		hideDobInt = 1
	}
	res, err := t.db.ExecContext(ctx,
		`UPDATE users SET
		   name = ?, nickname = ?, gender = ?, kelompok = ?, desa = ?, daerah = ?,
		   active = ?, notes = ?,
		   date_of_birth = ?, no_hp = ?, alamat = ?,
		   level = ?, parent_name = ?, parent_title = ?, parent_phone = ?, parent_phone_region = ?, parent_email = ?,
		   user_code = ?, tempat_lahir = ?, pendidikan = ?, pekerjaan = ?,
		   urutan = ?, hide_dob = ?, tgl_daftar = ?,
		   updated_at = ?
		 WHERE id = ? AND role = 'guru'`,
		in.Name, in.Nickname, in.Gender, in.Kelompok, in.Desa, in.Daerah,
		active, in.Notes,
		nullableDate(in.DateOfBirth), in.NoHP, in.Alamat,
		nullableLevel(in.Level), in.ParentName, in.ParentTitle, in.ParentPhone, in.ParentPhoneRegion, in.ParentEmail,
		in.UserCode, in.TempatLahir, in.Pendidikan, in.Pekerjaan,
		in.Urutan, hideDobInt, nullableDate(in.TglDaftar),
		now, id,
	)
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
	res, err := t.db.ExecContext(ctx,
		`DELETE FROM users WHERE id = ? AND role = 'guru'`, id)
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

	clauses := []string{"role = 'guru'"}
	var args []any

	if q := strings.TrimSpace(p.Query); q != "" {
		clauses = append(clauses, "(name LIKE ? OR nickname LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if p.Status != "" {
		clauses = append(clauses, "active = ?")
		if p.Status == "active" {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	if d := strings.TrimSpace(p.Daerah); d != "" {
		clauses = append(clauses, "daerah = ?")
		args = append(args, d)
	}
	where := " WHERE " + strings.Join(clauses, " AND ")

	var total int
	if err := t.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count teachers: %w", err)
	}

	listArgs := append(append([]any{}, args...), p.Limit, p.Offset)
	rows, err := t.db.QueryContext(ctx,
		`SELECT `+selectTeacherCols+` FROM users`+where+` ORDER BY name ASC LIMIT ? OFFSET ?`,
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
	Total       int      `json:"total"`
	ActiveTotal int      `json:"activeTotal"`
	ByGender    []Bucket `json:"byGender"`
	ByStatus    []Bucket `json:"byStatus"`
	ByDaerah    []Bucket `json:"byDaerah"`
}

func (t *Teachers) Stats(ctx context.Context) (*TeacherStats, error) {
	out := &TeacherStats{}

	if err := t.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'guru'`).Scan(&out.Total); err != nil {
		return nil, err
	}
	if err := t.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE role = 'guru' AND active = 1`).Scan(&out.ActiveTotal); err != nil {
		return nil, err
	}

	// Status is binary: active=1 → "active", active=0 → "retired"
	// (synthesised after migration 041 dropped membership_status).
	statusRows, err := t.db.QueryContext(ctx,
		`SELECT CASE WHEN active = 1 THEN 'active' ELSE 'retired' END, COUNT(*)
		   FROM users WHERE role = 'guru' GROUP BY active`)
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

	genderRows, err := t.db.QueryContext(ctx,
		`SELECT COALESCE(gender, ''), COUNT(*) FROM users
		  WHERE role = 'guru' AND active = 1 GROUP BY gender`)
	if err != nil {
		return nil, err
	}
	defer genderRows.Close()
	genderMap := map[string]int{}
	for genderRows.Next() {
		var s string
		var n int
		if err := genderRows.Scan(&s, &n); err != nil {
			return nil, err
		}
		genderMap[s] = n
	}
	if err := genderRows.Err(); err != nil {
		return nil, err
	}
	out.ByGender = []Bucket{
		{Label: "female", Count: genderMap["female"]},
		{Label: "male", Count: genderMap["male"]},
	}

	daerahRows, err := t.db.QueryContext(ctx,
		`SELECT COALESCE(daerah, ''), COUNT(*) AS n
		   FROM users
		  WHERE role = 'guru' AND active = 1
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

// parseStoredDate converts a TEXT date column (e.g. tgl_daftar) back into a
// *time.Time. Columns declared DATE (like date_of_birth) are auto-parsed by
// the sqlite driver, but TEXT columns come back as raw strings — so we parse
// the formats the driver may have written. Returns nil for NULL or
// unparseable values rather than failing the whole row scan.
func parseStoredDate(ns sql.NullString) *time.Time {
	if !ns.Valid || ns.String == "" {
		return nil
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02T15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, ns.String); err == nil {
			return &t
		}
	}
	return nil
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
	var active int
	var dob sql.NullTime
	var level sql.NullString
	var hideDob int
	var tglDaftar sql.NullString
	var photoPath *string
	if err := s.Scan(
		&t.ID, &t.Name, &t.Nickname, &t.Gender, &t.Kelompok, &t.Desa, &t.Daerah,
		&active, &t.Notes,
		&dob, &t.NoHP, &t.Alamat,
		&level, &t.ParentName, &t.ParentTitle, &t.ParentPhone, &t.ParentPhoneRegion, &t.ParentEmail,
		&t.UserCode, &t.TempatLahir, &t.Pendidikan, &t.Pekerjaan,
		&t.Urutan, &hideDob, &tglDaftar,
		&photoPath, &t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	// Status synthesised from active (migration 041).
	if active == 1 {
		t.Status = model.TeacherActive
	} else {
		t.Status = model.TeacherRetired
	}
	t.HideDob = hideDob == 1
	if dob.Valid {
		v := dob.Time
		t.DateOfBirth = &v
	}
	if level.Valid {
		v := model.StudentLevel(level.String)
		t.Level = &v
	}
	t.TglDaftar = parseStoredDate(tglDaftar)
	t.PhotoURL = model.PhotoURL(photoPath)
	return &t, nil
}
