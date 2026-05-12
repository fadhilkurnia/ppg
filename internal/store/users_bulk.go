package store

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

// UserBulkInput is the validated row shape for users CSVs. Password is
// optional on upsert (existing rows keep their hash if Password is empty).
type UserBulkInput struct {
	Email    string
	Username *string
	Name     string
	Role     model.Role
	Password string
}

type UsersBulk struct {
	users *Users
}

func NewUsersBulk(u *Users) *UsersBulk { return &UsersBulk{users: u} }

func (b *UsersBulk) Name() string { return "users" }

func (b *UsersBulk) Headers() []string {
	return []string{"email", "username", "name", "role", "password"}
}

func (b *UsersBulk) ParseRow(rec map[string]string) (UserBulkInput, error) {
	email := strings.ToLower(strings.TrimSpace(pickFirst(rec, "email")))
	if email == "" {
		return UserBulkInput{}, errors.New("email is empty")
	}
	name := strings.TrimSpace(pickFirst(rec, "name"))
	if name == "" {
		return UserBulkInput{}, errors.New("name is empty")
	}
	roleRaw := strings.ToLower(strings.TrimSpace(pickFirst(rec, "role")))
	if roleRaw == "" {
		return UserBulkInput{}, errors.New("role is empty")
	}
	if roleRaw != string(model.RoleAdmin) && roleRaw != string(model.RoleStaff) {
		return UserBulkInput{}, fmt.Errorf("role %q: want admin or staff", roleRaw)
	}

	return UserBulkInput{
		Email:    email,
		Username: nilIfEmpty(pickFirst(rec, "username")),
		Name:     name,
		Role:     model.Role(roleRaw),
		Password: strings.TrimSpace(pickFirst(rec, "password")),
	}, nil
}

// Upsert matches on email. On create, password is required. On update,
// empty Password leaves the existing hash untouched.
func (b *UsersBulk) Upsert(ctx context.Context, in UserBulkInput, mode bulk.Mode) (string, bool, error) {
	existing, err := b.users.FindByEmail(ctx, in.Email)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", false, err
	}
	if existing != nil {
		if mode != bulk.ModeUpsert {
			return "", false, fmt.Errorf("duplicate user email %q", in.Email)
		}
		if err := b.users.updateBulk(ctx, existing.ID, in); err != nil {
			return "", false, err
		}
		return existing.ID, false, nil
	}
	if in.Password == "" {
		return "", false, errors.New("password is required to create a new user")
	}
	created, err := b.users.Create(ctx, in.Email, in.Username, in.Password, in.Name, in.Role)
	if err != nil {
		return "", false, err
	}
	return created.ID, true, nil
}

// StreamRows exports every user ordered by email. The password column is
// intentionally blank — exporters never leak hashes.
func (b *UsersBulk) StreamRows(ctx context.Context, q url.Values, write func([]string) error) error {
	rows, err := b.users.db.QueryContext(ctx,
		`SELECT id, email, username, name, role FROM users ORDER BY email ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	_ = q
	for rows.Next() {
		var id, email, name, role string
		var username *string
		if err := rows.Scan(&id, &email, &username, &name, &role); err != nil {
			return err
		}
		if err := write([]string{email, strOrEmpty(username), name, role, ""}); err != nil {
			return err
		}
	}
	return rows.Err()
}

// BulkDelete only supports hard delete. Archive returns OutcomeFailed —
// users have no archived state today.
func (b *UsersBulk) BulkDelete(ctx context.Context, ids []string, mode bulk.DeleteMode) []bulk.DeleteResult {
	out := make([]bulk.DeleteResult, 0, len(ids))
	if mode == bulk.DeleteModeArchive {
		for _, id := range ids {
			out = append(out, bulk.DeleteResult{
				ID: strings.TrimSpace(id), Outcome: bulk.OutcomeFailed,
				Error: "users do not support archive; use mode=hard",
			})
		}
		return out
	}
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if id == "" {
			out = append(out, bulk.DeleteResult{ID: raw, Outcome: bulk.OutcomeFailed, Error: "empty id"})
			continue
		}
		res, err := b.users.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
		if err != nil {
			out = append(out, bulk.DeleteResult{ID: id, Outcome: bulk.OutcomeFailed, Error: err.Error()})
			continue
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			out = append(out, bulk.DeleteResult{ID: id, Outcome: bulk.OutcomeSkipped, Error: "not found"})
			continue
		}
		out = append(out, bulk.DeleteResult{ID: id, Outcome: bulk.OutcomeUpdated})
	}
	return out
}

// updateBulk applies a bulk-row update to an existing user. Password is
// rehashed and stored only if in.Password is non-empty.
func (u *Users) updateBulk(ctx context.Context, id string, in UserBulkInput) error {
	now := time.Now().UTC()
	if in.Password == "" {
		_, err := u.db.ExecContext(ctx,
			`UPDATE users SET email = ?, username = ?, name = ?, role = ?, updated_at = ? WHERE id = ?`,
			in.Email, in.Username, in.Name, string(in.Role), now, id)
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	_, err = u.db.ExecContext(ctx,
		`UPDATE users SET email = ?, username = ?, password = ?, name = ?, role = ?, updated_at = ? WHERE id = ?`,
		in.Email, in.Username, string(hash), in.Name, string(in.Role), now, id)
	return err
}
