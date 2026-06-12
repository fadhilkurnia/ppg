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

var ErrNotFound = errors.New("not found")

type Users struct {
	db *sql.DB
}

func NewUsers(db *sql.DB) *Users {
	return &Users{db: db}
}

// Column list used by every SELECT against users. Order matches scanUserRow.
const userColumns = `id, email, username, password, name, role, active,
	nickname, date_of_birth, gender, no_hp, alamat, kelompok,
	level, parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
	desa, daerah, notes,
	photo_path, timezone,
	user_code, tempat_lahir, pendidikan, pekerjaan,
	urutan, hide_dob, tgl_daftar,
	created_at, updated_at`

const selectUser = `SELECT ` + userColumns + ` FROM users`

func (u *Users) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE email = ?`, email)
	return scanUserRow(row)
}

func (u *Users) FindByIdentifier(ctx context.Context, identifier string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx,
		selectUser+` WHERE email = ? OR username = ? LIMIT 1`,
		identifier, identifier)
	return scanUserRow(row)
}

func (u *Users) FindByID(ctx context.Context, id string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE id = ?`, id)
	return scanUserRow(row)
}

// UserCreateInput collects every field that can be set when creating a user.
// Auth fields (Email, Password, Name, Role) are required; everything else is
// optional and will be stored as NULL/default if omitted.
type UserCreateInput struct {
	// Auth
	ID       string // optional — generated if empty (used when migrating legacy rows)
	Email    string
	Username *string
	Password string
	Name     string
	Role     model.Role

	// Shared profile
	Nickname    *string
	DateOfBirth *time.Time
	Gender      *string
	NoHP        *string
	Alamat      *string
	Kelompok    *string

	// Murid
	Level             *model.StudentLevel
	ParentName        *string
	ParentTitle       *string
	ParentPhone       *string
	ParentPhoneRegion *string
	ParentEmail       *string

	// Guru
	Desa   *string
	Daerah *string
	Notes  *string

	// Taaruf-style biodata (all optional).
	UserCode    *string
	TempatLahir *string
	Pendidikan  *string
	Pekerjaan   *string
	Urutan      int
	HideDob     bool
	TglDaftar   *time.Time
}

func (u *Users) Create(ctx context.Context, in UserCreateInput) (*model.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	return u.createWithHash(ctx, in, string(hash))
}

// createWithHash inserts a user with an already-bcrypted password. Used by
// the legacy-data migration so we can bcrypt the default password just once
// and reuse the hash across all migrated rows.
func (u *Users) createWithHash(ctx context.Context, in UserCreateInput, hash string) (*model.User, error) {
	id := in.ID
	if id == "" {
		id = ulid.Make().String()
	}
	now := time.Now().UTC()
	hideDobInt := 0
	if in.HideDob {
		hideDobInt = 1
	}
	_, err := u.db.ExecContext(ctx,
		`INSERT INTO users (
		   id, email, username, password, name, role, active,
		   nickname, date_of_birth, gender, no_hp, alamat, kelompok,
		   level, parent_name, parent_title, parent_phone, parent_phone_region, parent_email,
		   desa, daerah, notes,
		   user_code, tempat_lahir, pendidikan, pekerjaan,
		   urutan, hide_dob, tgl_daftar,
		   created_at, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, 1,
		           ?, ?, ?, ?, ?, ?,
		           ?, ?, ?, ?, ?, ?,
		           ?, ?, ?,
		           ?, ?, ?, ?,
		           ?, ?, ?,
		           ?, ?)`,
		id, in.Email, in.Username, hash, in.Name, string(in.Role),
		in.Nickname, nullableDate(in.DateOfBirth), in.Gender, in.NoHP, in.Alamat, in.Kelompok,
		nullableLevel(in.Level), in.ParentName, in.ParentTitle, in.ParentPhone, in.ParentPhoneRegion, in.ParentEmail,
		in.Desa, in.Daerah, in.Notes,
		in.UserCode, in.TempatLahir, in.Pendidikan, in.Pekerjaan,
		in.Urutan, hideDobInt, nullableDate(in.TglDaftar),
		now, now,
	)
	if err != nil {
		return nil, err
	}
	return u.FindByID(ctx, id)
}

// UserUpdateInput uses nil pointers to mean "don't change". The exception is
// Username: an empty (non-nil) string clears the column to NULL so a user can
// be made email-login-only.
type UserUpdateInput struct {
	Email            *string
	Username         *string
	Name             *string
	Role             *model.Role
	Active           *bool
	Nickname         *string
	DateOfBirth      *time.Time
	ClearDateOfBirth bool
	Gender           *string
	NoHP             *string
	Alamat           *string
	Kelompok         *string
	Level            *model.StudentLevel
	ClearLevel       bool
	ParentName        *string
	ParentTitle       *string
	ParentPhone       *string
	ParentPhoneRegion *string
	ParentEmail       *string
	Desa          *string
	Daerah        *string
	Notes         *string
	Timezone      *string
	ClearTimezone bool

	// Taaruf-style biodata.
	UserCode      *string
	TempatLahir   *string
	Pendidikan    *string
	Pekerjaan     *string
	Urutan        *int
	HideDob       *bool
	TglDaftar     *time.Time
	ClearTglDaftar bool
}

func (u *Users) Update(ctx context.Context, id string, in UserUpdateInput) (*model.User, error) {
	sets := []string{}
	args := []any{}

	addStr := func(col string, p *string) {
		if p == nil {
			return
		}
		v := strings.TrimSpace(*p)
		if v == "" {
			sets = append(sets, col+" = NULL")
		} else {
			sets = append(sets, col+" = ?")
			args = append(args, v)
		}
	}

	if in.Email != nil {
		sets = append(sets, "email = ?")
		args = append(args, *in.Email)
	}
	addStr("username", in.Username)
	if in.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *in.Name)
	}
	if in.Role != nil {
		sets = append(sets, "role = ?")
		args = append(args, string(*in.Role))
	}
	if in.Active != nil {
		sets = append(sets, "active = ?")
		v := 0
		if *in.Active {
			v = 1
		}
		args = append(args, v)
	}
	addStr("nickname", in.Nickname)
	if in.ClearDateOfBirth {
		sets = append(sets, "date_of_birth = NULL")
	} else if in.DateOfBirth != nil {
		sets = append(sets, "date_of_birth = ?")
		args = append(args, in.DateOfBirth.UTC())
	}
	if in.Gender != nil {
		v := strings.TrimSpace(*in.Gender)
		if v == "" {
			sets = append(sets, "gender = NULL")
		} else {
			sets = append(sets, "gender = ?")
			args = append(args, v)
		}
	}
	addStr("no_hp", in.NoHP)
	addStr("alamat", in.Alamat)
	addStr("kelompok", in.Kelompok)
	if in.ClearLevel {
		sets = append(sets, "level = NULL")
	} else if in.Level != nil {
		sets = append(sets, "level = ?")
		args = append(args, string(*in.Level))
	}
	addStr("parent_name", in.ParentName)
	addStr("parent_title", in.ParentTitle)
	addStr("parent_phone", in.ParentPhone)
	addStr("parent_phone_region", in.ParentPhoneRegion)
	addStr("parent_email", in.ParentEmail)
	addStr("desa", in.Desa)
	addStr("daerah", in.Daerah)
	addStr("notes", in.Notes)
	if in.ClearTimezone {
		sets = append(sets, "timezone = NULL")
	} else if in.Timezone != nil {
		v := strings.TrimSpace(*in.Timezone)
		if v == "" {
			sets = append(sets, "timezone = NULL")
		} else {
			sets = append(sets, "timezone = ?")
			args = append(args, v)
		}
	}
	addStr("user_code", in.UserCode)
	addStr("tempat_lahir", in.TempatLahir)
	addStr("pendidikan", in.Pendidikan)
	addStr("pekerjaan", in.Pekerjaan)
	if in.Urutan != nil {
		sets = append(sets, "urutan = ?")
		args = append(args, *in.Urutan)
	}
	if in.HideDob != nil {
		sets = append(sets, "hide_dob = ?")
		v := 0
		if *in.HideDob {
			v = 1
		}
		args = append(args, v)
	}
	if in.ClearTglDaftar {
		sets = append(sets, "tgl_daftar = NULL")
	} else if in.TglDaftar != nil {
		sets = append(sets, "tgl_daftar = ?")
		args = append(args, in.TglDaftar.UTC())
	}

	if len(sets) == 0 {
		return u.FindByID(ctx, id)
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, time.Now().UTC())
	args = append(args, id)
	q := "UPDATE users SET " + strings.Join(sets, ", ") + " WHERE id = ?"
	res, err := u.db.ExecContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return u.FindByID(ctx, id)
}

func (u *Users) Delete(ctx context.Context, id string) error {
	res, err := u.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// SetPhotoPath replaces the user's photo filename. Pass nil to clear.
// Returns the previous path so the caller can unlink the old file.
func (u *Users) SetPhotoPath(ctx context.Context, id string, path *string) (prev *string, err error) {
	row := u.db.QueryRowContext(ctx, `SELECT photo_path FROM users WHERE id = ?`, id)
	if err := row.Scan(&prev); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET photo_path = ?, updated_at = ? WHERE id = ?`,
		path, time.Now().UTC(), id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return prev, nil
}

func (u *Users) SetPassword(ctx context.Context, id, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET password = ?, updated_at = ? WHERE id = ?`,
		string(hash), time.Now().UTC(), id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (u *Users) Count(ctx context.Context) (int, error) {
	var n int
	if err := u.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

func (u *Users) CountAdmins(ctx context.Context) (int, error) {
	var n int
	err := u.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1`).Scan(&n)
	if err != nil {
		return 0, err
	}
	return n, nil
}

type UserListParams struct {
	Query  string
	Role   string
	Active *bool
	Limit  int
	Offset int
}

type UserList struct {
	Items []model.User `json:"items"`
	Total int          `json:"total"`
}

func (u *Users) List(ctx context.Context, p UserListParams) (UserList, error) {
	conds := []string{"1=1"}
	args := []any{}
	if p.Query != "" {
		conds = append(conds, "(name LIKE ? OR email LIKE ? OR username LIKE ? OR nickname LIKE ?)")
		like := "%" + p.Query + "%"
		args = append(args, like, like, like, like)
	}
	if p.Role != "" {
		conds = append(conds, "role = ?")
		args = append(args, p.Role)
	}
	if p.Active != nil {
		conds = append(conds, "active = ?")
		v := 0
		if *p.Active {
			v = 1
		}
		args = append(args, v)
	}
	where := strings.Join(conds, " AND ")

	var total int
	if err := u.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE `+where, args...).Scan(&total); err != nil {
		return UserList{}, err
	}

	limit := p.Limit
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	offset := p.Offset
	if offset < 0 {
		offset = 0
	}

	q := selectUser + ` WHERE ` + where + ` ORDER BY name ASC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)
	rows, err := u.db.QueryContext(ctx, q, args...)
	if err != nil {
		return UserList{}, err
	}
	defer rows.Close()

	items := []model.User{}
	for rows.Next() {
		user, err := readUserRow(rows)
		if err != nil {
			return UserList{}, err
		}
		user.Password = "" // never leak
		items = append(items, *user)
	}
	return UserList{Items: items, Total: total}, rows.Err()
}

// MiniUser is the minimal user shape exposed to authenticated non-admin
// callers (the manqul-share recipient picker). It deliberately omits every
// contact/PII column that List returns.
type MiniUser struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Nickname *string `json:"nickname,omitempty"`
	Role     string  `json:"role"`
}

// SearchMinimal returns up to `limit` active users whose name/username/nickname
// match q, excluding excludeID. Used by the recipient picker so a normal user
// can find people to share manqul with without exposing the admin user payload.
func (u *Users) SearchMinimal(ctx context.Context, q, excludeID string, limit int) ([]MiniUser, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	like := "%" + q + "%"
	rows, err := u.db.QueryContext(ctx,
		`SELECT id, name, nickname, role FROM users
		 WHERE active = 1 AND id != ?
		   AND (name LIKE ? OR username LIKE ? OR nickname LIKE ?)
		 ORDER BY name ASC LIMIT ?`,
		excludeID, like, like, like, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MiniUser{}
	for rows.Next() {
		var m MiniUser
		if err := rows.Scan(&m.ID, &m.Name, &m.Nickname, &m.Role); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func scanUserRow(row *sql.Row) (*model.User, error) {
	u, err := readUserRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return u, nil
}

func readUserRow(s scanner) (*model.User, error) {
	var u model.User
	var role string
	var active int
	var dob sql.NullTime
	var level sql.NullString
	var hideDob int
	var tglDaftar sql.NullTime
	if err := s.Scan(
		&u.ID, &u.Email, &u.Username, &u.Password, &u.Name, &role, &active,
		&u.Nickname, &dob, &u.Gender, &u.NoHP, &u.Alamat, &u.Kelompok,
		&level, &u.ParentName, &u.ParentTitle, &u.ParentPhone, &u.ParentPhoneRegion, &u.ParentEmail,
		&u.Desa, &u.Daerah, &u.Notes,
		&u.PhotoPath, &u.Timezone,
		&u.UserCode, &u.TempatLahir, &u.Pendidikan, &u.Pekerjaan,
		&u.Urutan, &hideDob, &tglDaftar,
		&u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		return nil, err
	}
	u.HideDob = hideDob == 1
	if tglDaftar.Valid {
		v := tglDaftar.Time
		u.TglDaftar = &v
	}
	u.Role = model.Role(role)
	u.Active = active == 1
	if dob.Valid {
		v := dob.Time
		u.DateOfBirth = &v
	}
	if level.Valid {
		v := model.StudentLevel(level.String)
		u.Level = &v
	}
	u.PhotoURL = model.PhotoURL(u.PhotoPath)
	return &u, nil
}

func nullableLevel(l *model.StudentLevel) any {
	if l == nil {
		return nil
	}
	return string(*l)
}

func SeedAdmin(ctx context.Context, users *Users, email, username, password string) error {
	n, err := users.Count(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	var unameArg *string
	if username != "" {
		unameArg = &username
	}
	_, err = users.Create(ctx, UserCreateInput{
		Email:    email,
		Username: unameArg,
		Password: password,
		Name:     "Admin",
		Role:     model.RoleAdmin,
	})
	return err
}
