package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"
)

// ManqulNote — per-user note attached to a Qur'an word (wordIdx >= 0) or to
// the whole ayah (wordIdx = -1).
type ManqulNote struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	KunciAyat string `json:"kunciAyat"`
	WordIdx   int    `json:"wordIdx"`
	Teks      string `json:"teks"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type ManqulStore struct {
	db *sql.DB
}

func NewManqul(db *sql.DB) *ManqulStore { return &ManqulStore{db: db} }

// List returns notes for one user, optionally scoped to a surah prefix
// (kunci_ayat starts with "{surah}:") — empty surah returns all.
func (s *ManqulStore) List(ctx context.Context, userID, surah string) ([]ManqulNote, error) {
	q := `SELECT id, user_id, kunci_ayat, word_idx, teks, created_at, updated_at
	      FROM quran_manqul_note WHERE user_id = ?`
	args := []any{userID}
	if surah != "" {
		q += " AND kunci_ayat LIKE ?"
		args = append(args, surah+":%")
	}
	q += " ORDER BY kunci_ayat ASC, word_idx ASC"
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ManqulNote{}
	for rows.Next() {
		var n ManqulNote
		if err := rows.Scan(&n.ID, &n.UserID, &n.KunciAyat, &n.WordIdx, &n.Teks, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// Upsert sets a note for (user, kunciAyat, wordIdx). Empty teks deletes
// the row. Returns the resulting note (or nil if deleted).
func (s *ManqulStore) Upsert(ctx context.Context, userID, kunciAyat string, wordIdx int, teks string) (*ManqulNote, error) {
	if teks == "" {
		_, err := s.db.ExecContext(ctx,
			`DELETE FROM quran_manqul_note WHERE user_id = ? AND kunci_ayat = ? AND word_idx = ?`,
			userID, kunciAyat, wordIdx)
		return nil, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO quran_manqul_note (id, user_id, kunci_ayat, word_idx, teks, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, kunci_ayat, word_idx)
		 DO UPDATE SET teks = excluded.teks, updated_at = excluded.updated_at`,
		ulid.Make().String(), userID, kunciAyat, wordIdx, teks, now, now)
	if err != nil {
		return nil, err
	}
	// Return the upserted row.
	row := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, kunci_ayat, word_idx, teks, created_at, updated_at
		 FROM quran_manqul_note WHERE user_id = ? AND kunci_ayat = ? AND word_idx = ?`,
		userID, kunciAyat, wordIdx)
	var n ManqulNote
	if err := row.Scan(&n.ID, &n.UserID, &n.KunciAyat, &n.WordIdx, &n.Teks, &n.CreatedAt, &n.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &n, nil
}
