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
	Email          string
	Username       *string
	Password       string
	Name           string
	Role           model.Role
	PrimaryScopeID *string
}

type UpdateUserInput struct {
	Name     *string
	Email    *string
	Username *string
}

type ListUsersFilter struct {
	Role    string
	ScopeID string
	Query   string
	Status  string // default "active"
	Limit   int
	Offset  int
}

type UserListResult struct {
	Items []model.User `json:"items"`
	Total int          `json:"total"`
}

// CreateWithBinding inserts a user and the matching primary user_roles
// binding inside a single transaction. If PrimaryScopeID is non-nil it also
// records the user_scopes primary binding.
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
		`INSERT INTO users (id, email, username, password, name, role, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
		id, strings.ToLower(strings.TrimSpace(in.Email)), in.Username, string(hash),
		strings.TrimSpace(in.Name), string(in.Role), now, now); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO user_roles (user_id, role_id, scope_id, is_primary, created_at)
		 VALUES (?, ?, NULL, 1, ?)`,
		id, string(in.Role), now); err != nil {
		return nil, err
	}
	if in.PrimaryScopeID != nil {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO user_scopes (user_id, scope_id, is_primary, created_at)
			 VALUES (?, ?, 1, ?)`,
			id, *in.PrimaryScopeID, now); err != nil {
			return nil, err
		}
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
	clauses = append(clauses, "u.status = ?")
	args = append(args, status)

	if f.Role != "" {
		clauses = append(clauses, "u.role = ?")
		args = append(args, f.Role)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		clauses = append(clauses, "(u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like)
	}

	join := ""
	if f.ScopeID != "" {
		join = " INNER JOIN user_scopes us ON us.user_id = u.id AND us.scope_id = ?"
		args = append([]any{f.ScopeID}, args...)
	}

	where := " WHERE " + strings.Join(clauses, " AND ")

	var total int
	if err := u.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT u.id) FROM users u`+join+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}

	listArgs := append(append([]any{}, args...), f.Limit, f.Offset)
	rows, err := u.db.QueryContext(ctx,
		`SELECT DISTINCT u.id, u.email, u.username, u.password, u.name, u.role, u.created_at, u.updated_at
		   FROM users u`+join+where+
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
		if err := rows.Scan(&us.ID, &us.Email, &us.Username, &us.Password,
			&us.Name, &role, &us.CreatedAt, &us.UpdatedAt); err != nil {
			return nil, err
		}
		us.Role = model.Role(role)
		us.Password = ""
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
	email := cur.Email
	username := cur.Username
	if in.Name != nil {
		name = strings.TrimSpace(*in.Name)
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
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET name = ?, email = ?, username = ?, updated_at = ?
		  WHERE id = ?`,
		name, email, username, time.Now().UTC(), id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return u.FindByID(ctx, id)
}

func (u *Users) SetPassword(ctx context.Context, id, newPassword string) error {
	if len(newPassword) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	res, err := u.db.ExecContext(ctx,
		`UPDATE users SET password = ?, refresh_jti = NULL, updated_at = ? WHERE id = ?`,
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
