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

type UpdateRoleInput struct {
	Label             *string
	CanLogin          *bool
	ManageableRoleIDs *[]string
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

func (r *Roles) Update(ctx context.Context, id string, in UpdateRoleInput) (*model.RoleRecord, error) {
	cur, err := r.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if in.Label != nil {
		cur.Label = strings.TrimSpace(*in.Label)
	}
	if in.CanLogin != nil {
		cur.CanLogin = *in.CanLogin
	}
	if in.ManageableRoleIDs != nil {
		cur.ManageableRoleIDs = *in.ManageableRoleIDs
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
		    SET label = ?, can_login = ?, manageable_role_ids = ?, updated_at = ?
		  WHERE id = ?`,
		cur.Label, canLogin, string(rawIDs), time.Now().UTC(), id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return r.Get(ctx, id)
}

func (r *Roles) ListBindings(ctx context.Context, userID string) ([]model.UserRoleBinding, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT user_id, role_id, scope_id, is_primary, created_at
		   FROM user_roles WHERE user_id = ?
		  ORDER BY is_primary DESC, role_id ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.UserRoleBinding{}
	for rows.Next() {
		var b model.UserRoleBinding
		var scope sql.NullString
		var prim int
		if err := rows.Scan(&b.UserID, &b.RoleID, &scope, &prim, &b.CreatedAt); err != nil {
			return nil, err
		}
		if scope.Valid {
			s := scope.String
			b.ScopeID = &s
		}
		b.IsPrimary = prim == 1
		out = append(out, b)
	}
	return out, rows.Err()
}

// AddBinding inserts a (user, role, scope) binding. If isPrimary is true,
// demotes any other primary first and mirrors the role into users.role.
func (r *Roles) AddBinding(ctx context.Context, userID, roleID string, scopeID *string, isPrimary bool) error {
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
		`INSERT INTO user_roles (user_id, role_id, scope_id, is_primary, created_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, role_id, scope_id) DO UPDATE SET is_primary = excluded.is_primary`,
		userID, roleID, scopeID, flag, time.Now().UTC()); err != nil {
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

func (r *Roles) RemoveBinding(ctx context.Context, userID, roleID string, scopeID *string) error {
	var (
		res sql.Result
		err error
	)
	if scopeID == nil {
		res, err = r.db.ExecContext(ctx,
			`DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND scope_id IS NULL`,
			userID, roleID)
	} else {
		res, err = r.db.ExecContext(ctx,
			`DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND scope_id = ?`,
			userID, roleID, *scopeID)
	}
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Roles) SetPrimary(ctx context.Context, userID, roleID string, scopeID *string) error {
	return r.AddBinding(ctx, userID, roleID, scopeID, true)
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
