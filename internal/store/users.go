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

const selectUser = `SELECT id, email, username, password, name, role, created_at, updated_at FROM users`

func (u *Users) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE email = ?`, email)
	return scanUser(row)
}

// FindByIdentifier looks up a user by email or username (case-insensitive on
// email; usernames are stored as-is and compared exactly).
func (u *Users) FindByIdentifier(ctx context.Context, identifier string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx,
		selectUser+` WHERE email = ? OR username = ? LIMIT 1`,
		identifier, identifier)
	return scanUser(row)
}

func (u *Users) FindByID(ctx context.Context, id string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE id = ?`, id)
	return scanUser(row)
}

func (u *Users) Create(ctx context.Context, email string, username *string, password, name string, role model.Role) (*model.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err = u.db.ExecContext(ctx,
		`INSERT INTO users (id, email, username, password, name, role, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, email, username, string(hash), name, string(role), now, now)
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
	if err := row.Scan(&u.ID, &u.Email, &u.Username, &u.Password, &u.Name, &role, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	u.Role = model.Role(role)
	return &u, nil
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
	_, err = users.Create(ctx, email, unameArg, password, "Admin", model.RoleAdmin)
	return err
}
