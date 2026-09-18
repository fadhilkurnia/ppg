package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

type Roles struct {
	db *sql.DB
}

func NewRoles(db *sql.DB) *Roles {
	return &Roles{db: db}
}

var (
	ErrRoleInUse    = errors.New("role still in use by users")
	ErrRoleConflict = errors.New("role already exists")
	ErrSystemRole   = errors.New("system role cannot be deleted")
)

type CreateRoleInput struct {
	ID                string
	Label             string
	CanLogin          bool
	ManageableRoleIDs []string
	SortOrder         int
}

type UpdateRoleInput struct {
	NewID             *string
	Label             *string
	CanLogin          *bool
	ManageableRoleIDs *[]string
	SortOrder         *int
}

const selectRole = `SELECT id, label, can_login, manageable_role_ids, sort_order, created_at, updated_at FROM roles`

func (r *Roles) List(ctx context.Context) ([]model.RoleRecord, error) {
	rows, err := r.db.QueryContext(ctx, selectRole+` ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.RoleRecord{}
	for rows.Next() {
		rr, err := readRole(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *rr)
	}
	return out, rows.Err()
}

func (r *Roles) Get(ctx context.Context, id string) (*model.RoleRecord, error) {
	row := r.db.QueryRowContext(ctx, selectRole+` WHERE id = ?`, id)
	return scanRole(row)
}

func (r *Roles) Create(ctx context.Context, in CreateRoleInput) (*model.RoleRecord, error) {
	id := strings.ToLower(strings.TrimSpace(in.ID))
	label := strings.TrimSpace(in.Label)
	if id == "" || label == "" {
		return nil, errors.New("id dan label wajib diisi")
	}

	if _, err := r.Get(ctx, id); err == nil {
		return nil, ErrRoleConflict
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	sortOrder := in.SortOrder
	if sortOrder == 0 {
		var maxOrder sql.NullInt64
		_ = r.db.QueryRowContext(ctx, `SELECT MAX(sort_order) FROM roles`).Scan(&maxOrder)
		if maxOrder.Valid {
			sortOrder = int(maxOrder.Int64) + 10
		} else {
			sortOrder = 10
		}
	}

	canLogin := 0
	if in.CanLogin {
		canLogin = 1
	}

	manageable := in.ManageableRoleIDs
	if manageable == nil {
		manageable = []string{}
	}
	rawIDs, err := json.Marshal(manageable)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	_, err = r.db.ExecContext(ctx,
		`INSERT INTO roles (id, label, can_login, manageable_role_ids, sort_order, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, label, canLogin, string(rawIDs), sortOrder, now, now,
	)
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

func isSystemRole(id string) bool {
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "admin", "guru", "murid", "staff", "coordinator", "teacher", "student", "parent":
		return true
	default:
		return false
	}
}

func (r *Roles) Update(ctx context.Context, id string, in UpdateRoleInput) (*model.RoleRecord, error) {
	cur, err := r.Get(ctx, id)
	if err != nil {
		return nil, err
	}

	targetID := id
	if in.NewID != nil {
		cleanNewID := strings.ToLower(strings.TrimSpace(*in.NewID))
		if cleanNewID != "" && cleanNewID != id {
			if isSystemRole(id) {
				return nil, errors.New("ID role sistem bawaan tidak dapat diubah")
			}
			if _, err := r.Get(ctx, cleanNewID); err == nil {
				return nil, ErrRoleConflict
			} else if !errors.Is(err, ErrNotFound) {
				return nil, err
			}
			tx, err := r.db.BeginTx(ctx, nil)
			if err != nil {
				return nil, err
			}
			defer tx.Rollback()

			if _, err := tx.ExecContext(ctx, `UPDATE user_roles SET role_id = ? WHERE role_id = ?`, cleanNewID, id); err != nil {
				return nil, err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE users SET role = ? WHERE role = ?`, cleanNewID, id); err != nil {
				return nil, err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE roles SET id = ? WHERE id = ?`, cleanNewID, id); err != nil {
				return nil, err
			}
			if err := tx.Commit(); err != nil {
				return nil, err
			}
			targetID = cleanNewID
			cur.ID = cleanNewID
		}
	}

	if in.Label != nil {
		cur.Label = strings.TrimSpace(*in.Label)
	}
	if in.CanLogin != nil {
		// Prevent disabling can_login for admin
		if targetID == "admin" {
			cur.CanLogin = true
		} else {
			cur.CanLogin = *in.CanLogin
		}
	}
	if in.ManageableRoleIDs != nil {
		cur.ManageableRoleIDs = *in.ManageableRoleIDs
	}
	if in.SortOrder != nil {
		cur.SortOrder = *in.SortOrder
	}
	rawIDs, err := json.Marshal(cur.ManageableRoleIDs)
	if err != nil {
		return nil, err
	}
	canLogin := 0
	if cur.CanLogin {
		canLogin = 1
	}
	res, err := r.db.ExecContext(ctx,
		`UPDATE roles
		    SET label = ?, can_login = ?, manageable_role_ids = ?, sort_order = ?, updated_at = ?
		  WHERE id = ?`,
		cur.Label, canLogin, string(rawIDs), cur.SortOrder, time.Now().UTC(), targetID)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return r.Get(ctx, targetID)
}

func (r *Roles) Delete(ctx context.Context, id string) error {
	id = strings.ToLower(strings.TrimSpace(id))
	// Prevent deleting core system roles
	if isSystemRole(id) {
		return ErrSystemRole
	}

	if _, err := r.Get(ctx, id); err != nil {
		return err
	}

	var userCount int
	err := r.db.QueryRowContext(ctx,
		`SELECT (SELECT COUNT(*) FROM user_roles WHERE role_id = ?) +
		        (SELECT COUNT(*) FROM users WHERE role = ?)`, id, id).Scan(&userCount)
	if err != nil {
		return err
	}
	if userCount > 0 {
		return ErrRoleInUse
	}

	res, err := r.db.ExecContext(ctx, `DELETE FROM roles WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Roles) ListBindings(ctx context.Context, userID string) ([]model.UserRoleBinding, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT user_id, role_id, is_primary, created_at
		   FROM user_roles WHERE user_id = ?
		  ORDER BY is_primary DESC, role_id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.UserRoleBinding{}
	for rows.Next() {
		var b model.UserRoleBinding
		var prim int
		if err := rows.Scan(&b.UserID, &b.RoleID, &prim, &b.CreatedAt); err != nil {
			return nil, err
		}
		b.IsPrimary = prim == 1
		out = append(out, b)
	}
	return out, rows.Err()
}

// AddBinding inserts a (user, role) binding. If isPrimary is true,
// demotes any existing primary first and mirrors the role into users.role.
func (r *Roles) AddBinding(ctx context.Context, userID, roleID string, isPrimary bool) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if isPrimary {
		if _, err := tx.ExecContext(ctx,
			`UPDATE user_roles SET is_primary = 0 WHERE user_id = ? AND is_primary = 1`,
			userID); err != nil {
			return err
		}
	}
	flag := 0
	if isPrimary {
		flag = 1
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO user_roles (user_id, role_id, is_primary, created_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(user_id, role_id) DO UPDATE SET is_primary = excluded.is_primary`,
		userID, roleID, flag, time.Now().UTC()); err != nil {
		return err
	}
	if isPrimary {
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`,
			roleID, time.Now().UTC(), userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *Roles) RemoveBinding(ctx context.Context, userID, roleID string) error {
	res, err := r.db.ExecContext(ctx,
		`DELETE FROM user_roles WHERE user_id = ? AND role_id = ?`,
		userID, roleID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Roles) SetPrimary(ctx context.Context, userID, roleID string) error {
	return r.AddBinding(ctx, userID, roleID, true)
}

func scanRole(s scanner) (*model.RoleRecord, error) {
	rr, err := readRole(s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return rr, nil
}

func readRole(s scanner) (*model.RoleRecord, error) {
	var rr model.RoleRecord
	var rawIDs string
	var canLogin int
	if err := s.Scan(
		&rr.ID, &rr.Label, &canLogin, &rawIDs, &rr.SortOrder, &rr.CreatedAt, &rr.UpdatedAt,
	); err != nil {
		return nil, err
	}
	rr.CanLogin = canLogin == 1
	if rawIDs == "" {
		rr.ManageableRoleIDs = []string{}
	} else if err := json.Unmarshal([]byte(rawIDs), &rr.ManageableRoleIDs); err != nil {
		return nil, err
	}
	if rr.ManageableRoleIDs == nil {
		rr.ManageableRoleIDs = []string{}
	}
	return &rr, nil
}

// CanManage reports whether the role catalogue entry permits managing
// the given target role ID.
func CanManage(role *model.RoleRecord, targetRoleID string) bool {
	if role == nil {
		return false
	}
	for _, r := range role.ManageableRoleIDs {
		if r == targetRoleID {
			return true
		}
	}
	return false
}
