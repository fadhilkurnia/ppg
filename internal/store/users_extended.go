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

type UserStatus string

const (
	UserActive   UserStatus = "active"
	UserArchived UserStatus = "archived"
)

type CreateUserInput struct {
	Email    string
	Username *string
	Nickname *string
	Phone    *string
	Password string
	Name     string
	Role     model.Role
}

type UpdateUserInput struct {
	Name     *string
	Nickname *string
	Email    *string
	Username *string
	Phone    *string
	Daerah   *string
	Desa     *string
	Kelompok *string
	Role     *model.Role
	Status   *string
}

type ListUsersFilter struct {
	Role   string
	Query  string
	Status string // default "active", "all" for everything
	Limit  int
	Offset int
}

type UserListResult struct {
	Items []model.User `json:"items"`
	Total int          `json:"total"`
}

// CreateWithBinding inserts a user and the matching primary user_roles
// binding inside a single transaction.
func (u *Users) CreateWithBinding(ctx context.Context, in CreateUserInput) (*model.User, error) {
	if in.Email == "" || in.Password == "" || in.Name == "" || in.Role == "" {
		return nil, errors.New("email, password, name and role are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	id := ulid.Make().String()
	now := time.Now().UTC()

	tx, err := u.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO users (id, email, username, nickname, phone, password, name, role, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		id, strings.ToLower(strings.TrimSpace(in.Email)), in.Username, in.Nickname, in.Phone, string(hash),
		strings.TrimSpace(in.Name), string(in.Role), now, now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO user_roles (user_id, role_id, is_primary, created_at)
		 VALUES (?, ?, 1, ?)`,
		id, string(in.Role), now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u.FindByID(ctx, id)
}

func (u *Users) List(ctx context.Context, f ListUsersFilter) (*UserListResult, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	status := f.Status
	if status == "" {
		status = "active"
	}

	var clauses []string
	var args []any
	if status != "all" {
		clauses = append(clauses, "u.status = ?")
		args = append(args, status)
	}

	if f.Role != "" {
		clauses = append(clauses, "u.role = ?")
		args = append(args, f.Role)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		clauses = append(clauses, "(u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like)
	}

	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	if err := u.db.QueryRowContext(ctx,
		`SELECT COUNT(u.id) FROM users u`+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}

	listArgs := append(append([]any{}, args...), f.Limit, f.Offset)
	rows, err := u.db.QueryContext(ctx,
		`SELECT u.id, u.email, u.username, u.nickname, u.phone, u.daerah, u.desa, u.kelompok, u.password, u.name, u.role, u.status, u.created_at, u.updated_at, u.must_change_password
		   FROM users u`+where+
			` ORDER BY u.name ASC LIMIT ? OFFSET ?`,
		listArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []model.User{}
	for rows.Next() {
		var us model.User
		var role string
		var stat string
		var mustChange int
		if err := rows.Scan(&us.ID, &us.Email, &us.Username, &us.Nickname, &us.Phone, &us.Daerah, &us.Desa, &us.Kelompok, &us.Password,
			&us.Name, &role, &stat, &us.CreatedAt, &us.UpdatedAt, &mustChange); err != nil {
			return nil, err
		}
		us.Role = model.Role(role)
		us.Status = stat
		us.Password = ""
		us.MustChangePassword = mustChange != 0
		items = append(items, us)
	}
	return &UserListResult{Items: items, Total: total}, rows.Err()
}

func (u *Users) Update(ctx context.Context, id string, in UpdateUserInput) (*model.User, error) {
	cur, err := u.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	name := cur.Name
	nickname := cur.Nickname
	email := cur.Email
	username := cur.Username
	phone := cur.Phone
	daerah := cur.Daerah
	desa := cur.Desa
	kelompok := cur.Kelompok
	role := string(cur.Role)
	status := cur.Status
	if status == "" {
		status = "active"
	}
	if in.Name != nil {
		name = strings.TrimSpace(*in.Name)
	}
	if in.Nickname != nil {
		v := strings.TrimSpace(*in.Nickname)
		if v == "" {
			nickname = nil
		} else {
			nickname = &v
		}
	}
	if in.Email != nil {
		email = strings.ToLower(strings.TrimSpace(*in.Email))
	}
	if in.Username != nil {
		v := strings.TrimSpace(*in.Username)
		if v == "" {
			username = nil
		} else {
			username = &v
		}
	}
	if in.Phone != nil {
		v := strings.TrimSpace(*in.Phone)
		if v == "" {
			phone = nil
		} else {
			phone = &v
		}
	}
	if in.Daerah != nil {
		v := strings.TrimSpace(*in.Daerah)
		if v == "" {
			daerah = nil
		} else {
			daerah = &v
		}
	}
	if in.Desa != nil {
		v := strings.TrimSpace(*in.Desa)
		if v == "" {
			desa = nil
		} else {
			desa = &v
		}
	}
	if in.Kelompok != nil {
		v := strings.TrimSpace(*in.Kelompok)
		if v == "" {
			kelompok = nil
		} else {
			kelompok = &v
		}
	}
	if in.Role != nil && *in.Role != "" {
		role = string(*in.Role)
	}
	if in.Status != nil && *in.Status != "" {
		status = *in.Status
	}
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET name = ?, nickname = ?, email = ?, username = ?, phone = ?, daerah = ?, desa = ?, kelompok = ?, role = ?, status = ?, updated_at = ?
		  WHERE id = ?`,
		name, nickname, email, username, phone, daerah, desa, kelompok, role, status, time.Now().UTC(), id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	if in.Role != nil && *in.Role != "" {
		_, _ = u.db.ExecContext(ctx, `UPDATE user_roles SET is_primary = 0 WHERE user_id = ?`, id)
		_, _ = u.db.ExecContext(ctx,
			`INSERT INTO user_roles (user_id, role_id, is_primary) VALUES (?, ?, 1)
			 ON CONFLICT(user_id, role_id) DO UPDATE SET is_primary = 1`, id, role)
	}
	// Keep corresponding teacher record in sync if exists
	if in.Daerah != nil || in.Desa != nil || in.Kelompok != nil || in.Name != nil {
		_, _ = u.db.ExecContext(ctx, `
			UPDATE teachers SET
				daerah = COALESCE(?, daerah),
				desa = COALESCE(?, desa),
				kelompok = COALESCE(?, kelompok),
				updated_at = ?
			WHERE LOWER(name) = LOWER(?) OR (nickname IS NOT NULL AND LOWER(nickname) = LOWER(?))
		`, daerah, desa, kelompok, time.Now().UTC(), cur.Name, cur.Name)
	}
	return u.FindByID(ctx, id)
}

func (u *Users) SetPassword(ctx context.Context, id, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("password must be at least 6 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET password = ?, must_change_password = 0, refresh_jti = NULL, updated_at = ? WHERE id = ?`,
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

func (u *Users) UpdateFirstLoginCredentials(ctx context.Context, id string, username *string, newPassword string) (*model.User, error) {
	if len(newPassword) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	now := time.Now().UTC()

	var res sql.Result
	if username != nil && strings.TrimSpace(*username) != "" {
		cleanUname := strings.TrimSpace(*username)
		res, err = u.db.ExecContext(ctx,
			`UPDATE users SET password = ?, username = ?, must_change_password = 0, refresh_jti = NULL, updated_at = ? WHERE id = ?`,
			string(hash), cleanUname, now, id)
	} else {
		res, err = u.db.ExecContext(ctx,
			`UPDATE users SET password = ?, must_change_password = 0, refresh_jti = NULL, updated_at = ? WHERE id = ?`,
			string(hash), now, id)
	}
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return u.FindByID(ctx, id)
}

func (u *Users) Archive(ctx context.Context, id string) error {
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET status = 'archived', refresh_jti = NULL, updated_at = ? WHERE id = ?`,
		time.Now().UTC(), id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (u *Users) Status(ctx context.Context, id string) (UserStatus, error) {
	var s string
	if err := u.db.QueryRowContext(ctx, `SELECT status FROM users WHERE id = ?`, id).Scan(&s); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return UserStatus(s), nil
}

func (u *Users) SetRefreshJTI(ctx context.Context, id, jti string) error {
	_, err := u.db.ExecContext(ctx,
		`UPDATE users SET refresh_jti = ?, updated_at = ? WHERE id = ?`,
		jti, time.Now().UTC(), id)
	return err
}

func (u *Users) GetRefreshJTI(ctx context.Context, id string) (string, error) {
	var jti sql.NullString
	if err := u.db.QueryRowContext(ctx, `SELECT refresh_jti FROM users WHERE id = ?`, id).Scan(&jti); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	if !jti.Valid {
		return "", nil
	}
	return jti.String, nil
}
