package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// DefaultEmailDomain is the domain used for auto-generated user emails — the
// facade-created murid/guru (who have no real email) and the backfill
// command. The local part is a slug of the user's nickname, falling back to
// their name, e.g. "Budi Santoso" -> budisantoso@gnrs.com.
const DefaultEmailDomain = "gnrs.com"

// slugify lowercases s and keeps only ASCII letters and digits (spaces and
// punctuation are dropped), so it is always a valid email local part.
func slugify(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		}
	}
	return b.String()
}

// emailLocalPart derives the local part of a default email from a user's
// nickname (preferred) or name. Falls back to "user" when neither yields a
// usable character (e.g. a name written entirely in non-latin script).
func emailLocalPart(nickname, name string) string {
	if s := slugify(nickname); s != "" {
		return s
	}
	if s := slugify(name); s != "" {
		return s
	}
	return "user"
}

// rowQueryer is satisfied by *sql.DB and *sql.Tx.
type rowQueryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// uniqueDefaultEmail returns "<base>@gnrs.com", or "<base><n>@gnrs.com" with
// the smallest n>=2 that no *other* user (id <> excludeID) already uses.
// excludeID lets a row keep its own current value when re-checked.
func uniqueDefaultEmail(ctx context.Context, q rowQueryer, base, excludeID string) (string, error) {
	if base == "" {
		base = "user"
	}
	for n := 1; ; n++ {
		candidate := base + "@" + DefaultEmailDomain
		if n > 1 {
			candidate = fmt.Sprintf("%s%d@%s", base, n, DefaultEmailDomain)
		}
		var cnt int
		if err := q.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM users WHERE email = ? AND id <> ?`, candidate, excludeID).Scan(&cnt); err != nil {
			return "", err
		}
		if cnt == 0 {
			return candidate, nil
		}
	}
}

// BackfillEmails rewrites every user's email to a slug of their nickname
// (falling back to name) at the default domain — e.g. budi@gnrs.com — with a
// numeric suffix for duplicates (budi2@gnrs.com). It runs in a single
// transaction and processes users in a stable id order, which makes the
// suffix assignment deterministic and the whole operation idempotent: a
// second run over unchanged data produces identical emails. Returns the
// number of users updated.
//
// Safe to run row-by-row because the new domain (@gnrs.com) is disjoint from
// the pre-existing stub (@stub.gnrs.local) and real (@gnrs.local) emails, so
// a freshly assigned address can never collide with a not-yet-updated row;
// the uniqueness check sees already-updated rows within the transaction.
func (u *Users) BackfillEmails(ctx context.Context) (int, error) {
	tx, err := u.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, `SELECT id, nickname, name FROM users ORDER BY id`)
	if err != nil {
		return 0, err
	}
	type rec struct{ id, nickname, name string }
	var recs []rec
	for rows.Next() {
		var r rec
		var nn sql.NullString
		if err := rows.Scan(&r.id, &nn, &r.name); err != nil {
			rows.Close()
			return 0, err
		}
		r.nickname = nn.String
		recs = append(recs, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	now := time.Now().UTC()
	count := 0
	for _, r := range recs {
		email, err := uniqueDefaultEmail(ctx, tx, emailLocalPart(r.nickname, r.name), r.id)
		if err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, email, now, r.id); err != nil {
			return 0, err
		}
		count++
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}
