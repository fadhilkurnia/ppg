package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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

func (u *Users) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx,
		`SELECT id, email, password, name, role, created_at, updated_at
		   FROM users WHERE email = ?`, email)
	return scanUser(row)
}

func (u *Users) FindByID(ctx context.Context, id string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx,
		`SELECT id, email, password, name, role, created_at, updated_at
		   FROM users WHERE id = ?`, id)
	return scanUser(row)
}

func (u *Users) Create(ctx context.Context, email, password, name string, role model.Role) (*model.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err = u.db.ExecContext(ctx,
		`INSERT INTO users (id, email, password, name, role, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, email, string(hash), name, string(role), now, now)
	if err != nil {
		return nil, err
	}
	return u.FindByID(ctx, id)
}

func (u *Users) Count(ctx context.Context) (int, error) {
	var n int
	if err := u.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

func scanUser(row *sql.Row) (*model.User, error) {
	var u model.User
	var role string
	if err := row.Scan(&u.ID, &u.Email, &u.Password, &u.Name, &role, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	u.Role = model.Role(role)
	return &u, nil
}

func SeedAdmin(ctx context.Context, users *Users, email, password string) error {
	n, err := users.Count(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	_, err = users.Create(ctx, email, password, "Admin", model.RoleAdmin)
	return err
}
