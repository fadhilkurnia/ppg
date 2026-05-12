package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

var (
	ErrInvalidParent  = errors.New("invalid scope parent for kind")
	ErrHasDescendants = errors.New("scope has descendants")
)

type Scopes struct {
	db *sql.DB
}

func NewScopes(db *sql.DB) *Scopes {
	return &Scopes{db: db}
}

type CreateScopeInput struct {
	Kind     model.ScopeKind
	Name     string
	ParentID *string
	Code     *string
}

type UpdateScopeInput struct {
	Name   *string
	Code   *string
	Status *model.ScopeStatus
}

type ScopeListParams struct {
	Kind     string
	ParentID string // "" no filter; "null" => parent_id IS NULL
	Status   string
	Query    string
	Limit    int
	Offset   int
}

const selectScope = `SELECT id, parent_id, kind, name, code, status, created_at, updated_at FROM scopes`

func (s *Scopes) Create(ctx context.Context, in CreateScopeInput) (*model.Scope, error) {
	if err := s.assertParentKind(ctx, in.Kind, in.ParentID); err != nil {
		return nil, err
	}
	id := ulid.Make().String()
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO scopes (id, parent_id, kind, name, code, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
		id, in.ParentID, string(in.Kind), strings.TrimSpace(in.Name), in.Code, now, now)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *Scopes) Get(ctx context.Context, id string) (*model.Scope, error) {
	row := s.db.QueryRowContext(ctx, selectScope+` WHERE id = ?`, id)
	return scanScope(row)
}

func (s *Scopes) Update(ctx context.Context, id string, in UpdateScopeInput) (*model.Scope, error) {
	cur, err := s.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		cur.Name = strings.TrimSpace(*in.Name)
	}
	if in.Code != nil {
		cur.Code = in.Code
	}
	if in.Status != nil {
		cur.Status = *in.Status
	}
	now := time.Now().UTC()
	res, err := s.db.ExecContext(ctx,
		`UPDATE scopes SET name = ?, code = ?, status = ?, updated_at = ? WHERE id = ?`,
		cur.Name, cur.Code, string(cur.Status), now, id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

// Archive soft-deletes a scope (status='archived'). Refuses if any active
// child scope still references this one.
func (s *Scopes) Archive(ctx context.Context, id string) error {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM scopes WHERE parent_id = ? AND status = 'active'`,
		id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return ErrHasDescendants
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE scopes SET status = 'archived', updated_at = ? WHERE id = ?`,
		time.Now().UTC(), id)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Scopes) List(ctx context.Context, p ScopeListParams) ([]model.Scope, int, error) {
	if p.Limit <= 0 || p.Limit > 500 {
		p.Limit = 100
	}
	if p.Offset < 0 {
		p.Offset = 0
	}

	var clauses []string
	var args []any
	if p.Kind != "" {
		clauses = append(clauses, "kind = ?")
		args = append(args, p.Kind)
	}
	switch p.ParentID {
	case "":
	case "null":
		clauses = append(clauses, "parent_id IS NULL")
	default:
		clauses = append(clauses, "parent_id = ?")
		args = append(args, p.ParentID)
	}
	if p.Status != "" {
		clauses = append(clauses, "status = ?")
		args = append(args, p.Status)
	}
	if q := strings.TrimSpace(p.Query); q != "" {
		clauses = append(clauses, "(name LIKE ? OR code LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM scopes`+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count scopes: %w", err)
	}

	listArgs := append(append([]any{}, args...), p.Limit, p.Offset)
	rows, err := s.db.QueryContext(ctx,
		selectScope+where+` ORDER BY kind ASC, name ASC LIMIT ? OFFSET ?`,
		listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []model.Scope{}
	for rows.Next() {
		sc, err := readScope(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, *sc)
	}
	return items, total, rows.Err()
}

// Ancestors returns the scope and its ancestors ordered root -> leaf.
func (s *Scopes) Ancestors(ctx context.Context, id string) ([]model.Scope, error) {
	rows, err := s.db.QueryContext(ctx, `
WITH RECURSIVE ancestors(id, parent_id, kind, name, code, status, created_at, updated_at, depth) AS (
  SELECT id, parent_id, kind, name, code, status, created_at, updated_at, 0 FROM scopes WHERE id = ?
  UNION ALL
  SELECT s.id, s.parent_id, s.kind, s.name, s.code, s.status, s.created_at, s.updated_at, a.depth + 1
    FROM scopes s JOIN ancestors a ON s.id = a.parent_id
)
SELECT id, parent_id, kind, name, code, status, created_at, updated_at FROM ancestors ORDER BY depth DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Scope{}
	for rows.Next() {
		sc, err := readScope(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sc)
	}
	return out, rows.Err()
}

// Descendants returns every scope below the given id (any depth).
func (s *Scopes) Descendants(ctx context.Context, id string) ([]model.Scope, error) {
	rows, err := s.db.QueryContext(ctx, `
WITH RECURSIVE descendants(id, parent_id, kind, name, code, status, created_at, updated_at) AS (
  SELECT id, parent_id, kind, name, code, status, created_at, updated_at FROM scopes WHERE parent_id = ?
  UNION ALL
  SELECT s.id, s.parent_id, s.kind, s.name, s.code, s.status, s.created_at, s.updated_at
    FROM scopes s JOIN descendants d ON s.parent_id = d.id
)
SELECT id, parent_id, kind, name, code, status, created_at, updated_at FROM descendants`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Scope{}
	for rows.Next() {
		sc, err := readScope(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sc)
	}
	return out, rows.Err()
}

// Tree returns the entire scope hierarchy as nested ScopeNodes.
func (s *Scopes) Tree(ctx context.Context) ([]*model.ScopeNode, error) {
	rows, _, err := s.List(ctx, ScopeListParams{Limit: 500})
	if err != nil {
		return nil, err
	}
	byID := make(map[string]*model.ScopeNode, len(rows))
	for _, r := range rows {
		r := r
		byID[r.ID] = &model.ScopeNode{Scope: r}
	}
	var roots []*model.ScopeNode
	for _, n := range byID {
		if n.ParentID == nil {
			roots = append(roots, n)
			continue
		}
		parent, ok := byID[*n.ParentID]
		if !ok {
			roots = append(roots, n)
			continue
		}
		parent.Children = append(parent.Children, n)
	}
	return roots, nil
}

// EffectiveIDs returns the user's primary + secondary scope IDs plus every
// descendant scope ID. Used by scope-aware list endpoints.
func (s *Scopes) EffectiveIDs(ctx context.Context, userID string) (map[string]struct{}, string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT scope_id, is_primary FROM user_scopes WHERE user_id = ?`, userID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := map[string]struct{}{}
	var primary string
	seeds := []string{}
	for rows.Next() {
		var sid string
		var isPrim int
		if err := rows.Scan(&sid, &isPrim); err != nil {
			return nil, "", err
		}
		out[sid] = struct{}{}
		seeds = append(seeds, sid)
		if isPrim == 1 {
			primary = sid
		}
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	for _, sid := range seeds {
		desc, err := s.Descendants(ctx, sid)
		if err != nil {
			return nil, "", err
		}
		for _, d := range desc {
			out[d.ID] = struct{}{}
		}
	}
	return out, primary, nil
}

// AddUserScope creates a binding; if isPrimary, demotes any existing primary.
func (s *Scopes) AddUserScope(ctx context.Context, userID, scopeID string, isPrimary bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if isPrimary {
		if _, err := tx.ExecContext(ctx,
			`UPDATE user_scopes SET is_primary = 0 WHERE user_id = ? AND is_primary = 1`,
			userID); err != nil {
			return err
		}
	}
	flag := 0
	if isPrimary {
		flag = 1
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO user_scopes (user_id, scope_id, is_primary, created_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(user_id, scope_id) DO UPDATE SET is_primary = excluded.is_primary`,
		userID, scopeID, flag, time.Now().UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Scopes) RemoveUserScope(ctx context.Context, userID, scopeID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM user_scopes WHERE user_id = ? AND scope_id = ?`,
		userID, scopeID)
	return err
}

func (s *Scopes) ListForUser(ctx context.Context, userID string) ([]model.UserScope, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT user_id, scope_id, is_primary, created_at FROM user_scopes WHERE user_id = ?`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.UserScope{}
	for rows.Next() {
		var us model.UserScope
		var isPrim int
		if err := rows.Scan(&us.UserID, &us.ScopeID, &isPrim, &us.CreatedAt); err != nil {
			return nil, err
		}
		us.IsPrimary = isPrim == 1
		out = append(out, us)
	}
	return out, rows.Err()
}

func (s *Scopes) assertParentKind(ctx context.Context, kind model.ScopeKind, parentID *string) error {
	switch kind {
	case model.ScopeKindDaerah:
		if parentID != nil {
			return ErrInvalidParent
		}
		return nil
	case model.ScopeKindDesa:
		if parentID == nil {
			return ErrInvalidParent
		}
		return s.requireParentKind(ctx, *parentID, model.ScopeKindDaerah)
	case model.ScopeKindKelompok:
		if parentID == nil {
			return ErrInvalidParent
		}
		return s.requireParentKind(ctx, *parentID, model.ScopeKindDesa)
	default:
		return ErrInvalidParent
	}
}

func (s *Scopes) requireParentKind(ctx context.Context, parentID string, want model.ScopeKind) error {
	var got string
	if err := s.db.QueryRowContext(ctx, `SELECT kind FROM scopes WHERE id = ?`, parentID).Scan(&got); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrInvalidParent
		}
		return err
	}
	if model.ScopeKind(got) != want {
		return ErrInvalidParent
	}
	return nil
}

func scanScope(s scanner) (*model.Scope, error) {
	sc, err := readScope(s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return sc, nil
}

func readScope(s scanner) (*model.Scope, error) {
	var sc model.Scope
	var kind, status string
	if err := s.Scan(
		&sc.ID, &sc.ParentID, &kind, &sc.Name, &sc.Code, &status,
		&sc.CreatedAt, &sc.UpdatedAt,
	); err != nil {
		return nil, err
	}
	sc.Kind = model.ScopeKind(kind)
	sc.Status = model.ScopeStatus(status)
	return &sc, nil
}
