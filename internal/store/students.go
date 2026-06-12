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

// Students is a thin facade over the users table for the /api/students
// endpoint group. Generus are stored as users with role='murid' since
// migration 008; this facade preserves the existing model.Student / StudentInput
// contract so the frontend Generus pages keep working unchanged.
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
	Level       *model.StudentLevel
	Kelompok    *string
	// Status maps to User.Active — "active" → 1, "left" → 0. Joined/left
	// dates and leave_reason were dropped in migration 041.
	Status            model.StudentStatus
	ParentName        *string
	ParentTitle       *string
	ParentPhone       *string
	ParentPhoneRegion *string
	ParentEmail       *string
	// Shared profile + biodata fields (same set as TeacherInput per the
	// unified-user mechanism).
	NoHP        *string
	Alamat      *string
	Desa        *string
	Daerah      *string
	Notes       *string
	UserCode    *string
	TempatLahir *string
	Pendidikan  *string
	Pekerjaan   *string
	Urutan      int
	HideDob     bool
	TglDaftar   *time.Time
}

type ListParams struct {
	Query    string
	Status   string
	Kelompok string
	Limit    int
	Offset   int
}

type ListResult struct {
	Items []model.Student `json:"items"`
	Total int             `json:"total"`
}

const selectStudentCols = `id, name, nickname, date_of_birth, gender, level, kelompok, active,
	parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
	no_hp, alamat, desa, daerah, notes,
	user_code, tempat_lahir, pendidikan, pekerjaan,
	urutan, hide_dob, tgl_daftar,
	photo_path, created_at, updated_at`

func (s *Students) Create(ctx context.Context, in StudentInput) (*model.Student, error) {
	if in.Status == "" {
		in.Status = model.StudentActive
	}
	id := ulid.Make().String()
	now := time.Now().UTC()

	nickname := ""
	if in.Nickname != nil {
		nickname = *in.Nickname
	}
	email, err := uniqueDefaultEmail(ctx, s.db, emailLocalPart(nickname, in.Name), id)
	if err != nil {
		return nil, fmt.Errorf("generate default email: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("changeme"), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash default password: %w", err)
	}

	active := 1
	if in.Status == model.StudentLeft {
		active = 0
	}
	hideDobInt := 0
	if in.HideDob {
		hideDobInt = 1
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO users (
		   id, email, password, name, role, active,
		   nickname, date_of_birth, gender, kelompok,
		   level, parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
		   no_hp, alamat, desa, daerah, notes,
		   user_code, tempat_lahir, pendidikan, pekerjaan,
		   urutan, hide_dob, tgl_daftar,
		   created_at, updated_at
		 ) VALUES (?, ?, ?, ?, 'murid', ?,
		           ?, ?, ?, ?,
		           ?, ?, ?, ?, ?, ?,
		           ?, ?, ?, ?, ?,
		           ?, ?, ?, ?,
		           ?, ?, ?,
		           ?, ?)`,
		id, email, string(hash), in.Name, active,
		in.Nickname, nullableDate(in.DateOfBirth), in.Gender, in.Kelompok,
		nullableLevel(in.Level), in.ParentName, in.ParentTitle, in.ParentPhone, in.ParentPhoneRegion, in.ParentEmail,
		in.NoHP, in.Alamat, in.Desa, in.Daerah, in.Notes,
		in.UserCode, in.TempatLahir, in.Pendidikan, in.Pekerjaan,
		in.Urutan, hideDobInt, nullableDate(in.TglDaftar),
		now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *Students) Get(ctx context.Context, id string) (*model.Student, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+selectStudentCols+` FROM users WHERE id = ? AND role = 'murid'`, id)
	return scanStudent(row)
}

func (s *Students) Update(ctx context.Context, id string, in StudentInput) (*model.Student, error) {
	if in.Status == "" {
		in.Status = model.StudentActive
	}
	active := 1
	if in.Status == model.StudentLeft {
		active = 0
	}
	now := time.Now().UTC()
	hideDobInt := 0
	if in.HideDob {
		hideDobInt = 1
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE users SET
		   name = ?, nickname = ?, date_of_birth = ?, gender = ?, level = ?, kelompok = ?,
		   active = ?,
		   parent_name = ?, parent_title = ?, parent_phone = ?, parent_phone_region = ?, parent_email = ?,
		   no_hp = ?, alamat = ?, desa = ?, daerah = ?, notes = ?,
		   user_code = ?, tempat_lahir = ?, pendidikan = ?, pekerjaan = ?,
		   urutan = ?, hide_dob = ?, tgl_daftar = ?,
		   updated_at = ?
		 WHERE id = ? AND role = 'murid'`,
		in.Name, in.Nickname,
		nullableDate(in.DateOfBirth), in.Gender, nullableLevel(in.Level), in.Kelompok,
		active,
		in.ParentName, in.ParentTitle, in.ParentPhone, in.ParentPhoneRegion, in.ParentEmail,
		in.NoHP, in.Alamat, in.Desa, in.Daerah, in.Notes,
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
	return s.Get(ctx, id)
}

func (s *Students) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM users WHERE id = ? AND role = 'murid'`, id)
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

	clauses := []string{"role = 'murid'"}
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
	if p.Kelompok != "" {
		clauses = append(clauses, "kelompok = ?")
		args = append(args, p.Kelompok)
	}
	where := " WHERE " + strings.Join(clauses, " AND ")

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count students: %w", err)
	}

	listArgs := append(append([]any{}, args...), p.Limit, p.Offset)
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+selectStudentCols+` FROM users`+where+` ORDER BY name ASC LIMIT ? OFFSET ?`,
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
	Total       int                 `json:"total"`
	ActiveTotal int                 `json:"activeTotal"`
	ByGender    []Bucket            `json:"byGender"`
	ByStatus    []Bucket            `json:"byStatus"`
	ByLevel     []Bucket            `json:"byLevel"`
	ByKelompok  []Bucket            `json:"byKelompok"`
	Matrix      []LevelKelompokCell `json:"matrix"`
}

func (s *Students) Stats(ctx context.Context) (*StudentStats, error) {
	out := &StudentStats{}

	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'murid'`).Scan(&out.Total); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE role = 'murid' AND active = 1`).Scan(&out.ActiveTotal); err != nil {
		return nil, err
	}

	gender, err := groupCount(ctx, s.db,
		`SELECT COALESCE(gender, ''), COUNT(*) FROM users
		  WHERE role = 'murid' AND active = 1 GROUP BY gender`)
	if err != nil {
		return nil, err
	}
	out.ByGender = orderedBuckets(gender, []string{"female", "male"})

	// Status is binary: active=1 → "active", active=0 → "left" (synthesised
	// after migration 041 dropped membership_status).
	status, err := groupCount(ctx, s.db,
		`SELECT CASE WHEN active = 1 THEN 'active' ELSE 'left' END, COUNT(*)
		   FROM users WHERE role = 'murid' GROUP BY active`)
	if err != nil {
		return nil, err
	}
	out.ByStatus = orderedBuckets(status, []string{"active", "left"})

	level, err := groupCount(ctx, s.db,
		`SELECT COALESCE(level, ''), COUNT(*) FROM users
		  WHERE role = 'murid' AND active = 1 GROUP BY level`)
	if err != nil {
		return nil, err
	}
	out.ByLevel = orderedBuckets(level, []string{
		string(model.LevelCaberawit),
		string(model.LevelPraRemaja),
		string(model.LevelRemaja),
		string(model.LevelPraNikah),
		"",
	})

	kelompok, err := groupCount(ctx, s.db,
		`SELECT COALESCE(kelompok, ''), COUNT(*) FROM users
		  WHERE role = 'murid' AND active = 1 GROUP BY kelompok`)
	if err != nil {
		return nil, err
	}
	out.ByKelompok = orderedBuckets(kelompok, append(append([]string{}, model.StudentKelompoks...), ""))

	rows, err := s.db.QueryContext(ctx,
		`SELECT COALESCE(level, ''), COALESCE(kelompok, ''), COUNT(*)
		   FROM users
		  WHERE role = 'murid' AND active = 1
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

func groupCount(ctx context.Context, db *sql.DB, query string) (map[string]int, error) {
	rows, err := db.QueryContext(ctx, query)
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
	var active int
	var dob sql.NullTime
	var level sql.NullString
	var hideDob int
	var tglDaftar sql.NullString
	var photoPath *string
	if err := s.Scan(
		&st.ID, &st.Name, &st.Nickname, &dob, &st.Gender, &level, &st.Kelompok, &active,
		&st.ParentName, &st.ParentTitle, &st.ParentPhone, &st.ParentPhoneRegion, &st.ParentEmail,
		&st.NoHP, &st.Alamat, &st.Desa, &st.Daerah, &st.Notes,
		&st.UserCode, &st.TempatLahir, &st.Pendidikan, &st.Pekerjaan,
		&st.Urutan, &hideDob, &tglDaftar,
		&photoPath, &st.CreatedAt, &st.UpdatedAt,
	); err != nil {
		return nil, err
	}
	st.PhotoURL = model.PhotoURL(photoPath)
	st.HideDob = hideDob == 1
	st.TglDaftar = parseStoredDate(tglDaftar)
	// Status is synthesised from active per the unified-user mechanism.
	if active == 1 {
		st.Status = model.StudentActive
	} else {
		st.Status = model.StudentLeft
	}
	if dob.Valid {
		v := dob.Time
		st.DateOfBirth = &v
	}
	if level.Valid {
		v := model.StudentLevel(level.String)
		st.Level = &v
	}
	return &st, nil
}
