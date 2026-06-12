package store

import (
	"context"
	"database/sql"
	"time"
)

type Settings struct {
	db *sql.DB
}

func NewSettings(db *sql.DB) *Settings { return &Settings{db: db} }

// GetAll returns every settings row as a map.
func (s *Settings) GetAll(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// Set upserts a single setting. Empty string clears the value (still kept
// in the row so we know the key exists).
func (s *Settings) Set(ctx context.Context, key, value string) error {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, now)
	return err
}
