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

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type Users struct {
	db *sql.DB
}

func NewUsers(db *sql.DB) *Users {
	return &Users{db: db}
}

const selectUser = `SELECT id, email, username, nickname, phone, daerah, desa, kelompok, password, name, role, status, created_at, updated_at, must_change_password, google_id FROM users`

func (u *Users) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE lower(email) = lower(?)`, strings.TrimSpace(email))
	return scanUser(row)
}

func (u *Users) FindByEmailOrGoogleID(ctx context.Context, email, googleID string) (*model.User, error) {
	email = strings.TrimSpace(email)
	googleID = strings.TrimSpace(googleID)
	if email == "" && googleID == "" {
		return nil, ErrNotFound
	}
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE (google_id IS NOT NULL AND google_id = ?) OR lower(email) = lower(?) LIMIT 1`, googleID, email)
	return scanUser(row)
}

func (u *Users) LinkGoogleID(ctx context.Context, userID, googleID string) error {
	googleID = strings.TrimSpace(googleID)
	if googleID == "" {
		return nil
	}
	now := time.Now().UTC()
	_, err := u.db.ExecContext(ctx, `UPDATE users SET google_id = ?, updated_at = ? WHERE id = ?`, googleID, now, userID)
	return err
}

func (u *Users) LinkGoogleAccount(ctx context.Context, userID, email, googleID string) (*model.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	googleID = strings.TrimSpace(googleID)
	if email == "" && googleID == "" {
		return nil, errors.New("email atau google ID wajib disertakan")
	}

	// Check if another user already has this email or googleID
	var conflictID string
	err := u.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE (lower(email) = ? OR (google_id IS NOT NULL AND google_id = ?)) AND id != ? LIMIT 1`,
		email, googleID, userID).Scan(&conflictID)
	if err == nil {
		return nil, ErrConflict
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	now := time.Now().UTC()
	if googleID != "" {
		_, err = u.db.ExecContext(ctx, `UPDATE users SET email = ?, google_id = ?, updated_at = ? WHERE id = ?`, email, googleID, now, userID)
	} else {
		_, err = u.db.ExecContext(ctx, `UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, email, now, userID)
	}
	if err != nil {
		return nil, err
	}
	return u.FindByID(ctx, userID)
}

// FindByIdentifier looks up a user by email, username, or phone number.
func (u *Users) FindByIdentifier(ctx context.Context, identifier string) (*model.User, error) {
	identifier = strings.TrimSpace(identifier)
	row := u.db.QueryRowContext(ctx,
		selectUser+` WHERE email = ? OR username = ? LIMIT 1`,
		identifier, identifier)
	user, err := scanUser(row)
	if err == nil {
		return user, nil
	}
	return u.FindByPhone(ctx, identifier)
}

func (u *Users) FindByID(ctx context.Context, id string) (*model.User, error) {
	row := u.db.QueryRowContext(ctx, selectUser+` WHERE id = ?`, id)
	return scanUser(row)
}

func (u *Users) IsUsernameTaken(ctx context.Context, username string, excludeUserID string) (bool, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return false, nil
	}
	var count int
	var err error
	if excludeUserID != "" {
		err = u.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE lower(username) = lower(?) AND id != ?`, username, excludeUserID).Scan(&count)
	} else {
		err = u.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE lower(username) = lower(?)`, username).Scan(&count)
	}
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (u *Users) FindByPhone(ctx context.Context, phone string) (*model.User, error) {
	candidates := NormalizePhone(phone)
	if len(candidates) == 0 {
		return nil, ErrNotFound
	}

	query := selectUser + ` WHERE status = 'active' AND (
		id IN (SELECT user_id FROM user_phones WHERE `
	args := make([]any, 0, len(candidates)*4)
	for i, c := range candidates {
		if i > 0 {
			query += " OR "
		}
		query += "phone = ? OR replace(replace(replace(replace(phone, '+', ''), '-', ''), ' ', ''), '''', '') = ?"
		args = append(args, c, c)
	}
	query += `) OR (`
	for i, c := range candidates {
		if i > 0 {
			query += " OR "
		}
		query += "phone = ? OR replace(replace(replace(replace(phone, '+', ''), '-', ''), ' ', ''), '''', '') = ?"
		args = append(args, c, c)
	}
	query += `)) LIMIT 1`

	row := u.db.QueryRowContext(ctx, query, args...)
	return scanUser(row)
}

func NormalizePhone(p string) []string {
	p = strings.TrimSpace(p)
	var digits string
	for _, r := range p {
		if r >= '0' && r <= '9' {
			digits += string(r)
		}
	}
	if digits == "" {
		return nil
	}

	seen := map[string]struct{}{}
	var res []string
	add := func(s string) {
		if s != "" {
			if _, ok := seen[s]; !ok {
				seen[s] = struct{}{}
				res = append(res, s)
			}
		}
	}

	add(digits)
	add("+" + digits)
	if strings.HasPrefix(digits, "62") {
		local := "0" + digits[2:]
		add(local)
	} else if strings.HasPrefix(digits, "0") {
		intl := "62" + digits[1:]
		add(intl)
		add("+" + intl)
	}
	return res
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
	var mustChange int
	if err := row.Scan(&u.ID, &u.Email, &u.Username, &u.Nickname, &u.Phone, &u.Daerah, &u.Desa, &u.Kelompok, &u.Password, &u.Name, &role, &u.Status, &u.CreatedAt, &u.UpdatedAt, &mustChange, &u.GoogleID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	u.Role = model.Role(role)
	u.MustChangePassword = mustChange != 0
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
	u, err := users.Create(ctx, email, unameArg, password, "Admin", model.RoleAdmin)
	if err != nil {
		return err
	}
	_, err = users.db.ExecContext(ctx, `UPDATE users SET must_change_password = 0 WHERE id = ?`, u.ID)
	return err
}
