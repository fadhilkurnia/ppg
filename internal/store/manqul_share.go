package store

import (
	"context"
	"database/sql"
	"strings"

	"github.com/oklog/ulid/v2"
)

// ManqulShareStore manages per-ayah, per-recipient sharing of manqul notes.
// A share row means: owner_user_id has exposed their manqul for kunci_ayat to
// recipient_user_id. The shared content is whatever the owner annotated on that
// ayah in quran_manqul_note (the wordIdx = -1 per-ayah note and every per-word
// note). A viewer only ever reads manqul for an ayah explicitly shared to them.
type ManqulShareStore struct {
	db *sql.DB
}

func NewManqulShare(db *sql.DB) *ManqulShareStore { return &ManqulShareStore{db: db} }

// ShareRecipient — a user one ayah's manqul is shared with.
type ShareRecipient struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ManqulSource — an owner who has shared >=1 ayah within a surah with the
// viewer, plus how many of that surah's ayat they shared.
type ManqulSource struct {
	OwnerUserID string `json:"ownerUserId"`
	OwnerName   string `json:"ownerName"`
	AyatCount   int    `json:"ayatCount"`
}

// SetRecipients replaces the full recipient set for (owner, kunciAyat). An
// empty list unshares the ayah entirely. Self-shares and duplicates are
// dropped. Idempotent.
func (s *ManqulShareStore) SetRecipients(ctx context.Context, ownerID, kunciAyat string, recipientIDs []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op after Commit
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM quran_manqul_share WHERE owner_user_id = ? AND kunci_ayat = ?`,
		ownerID, kunciAyat); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, rid := range recipientIDs {
		rid = strings.TrimSpace(rid)
		if rid == "" || rid == ownerID || seen[rid] {
			continue
		}
		seen[rid] = true
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO quran_manqul_share (id, owner_user_id, kunci_ayat, recipient_user_id)
			 VALUES (?, ?, ?, ?)`,
			ulid.Make().String(), ownerID, kunciAyat, rid); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// RecipientsFor returns the users (id+name) an owner shared one ayah with,
// for prefilling the share dialog.
func (s *ManqulShareStore) RecipientsFor(ctx context.Context, ownerID, kunciAyat string) ([]ShareRecipient, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT u.id, u.name
		 FROM quran_manqul_share sh JOIN users u ON u.id = sh.recipient_user_id
		 WHERE sh.owner_user_id = ? AND sh.kunci_ayat = ?
		 ORDER BY u.name ASC`,
		ownerID, kunciAyat)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ShareRecipient{}
	for rows.Next() {
		var r ShareRecipient
		if err := rows.Scan(&r.ID, &r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AvailableSources lists owners who shared >=1 ayah within surah with
// recipient, with display name and count of shared ayat (drives the dropdown).
func (s *ManqulShareStore) AvailableSources(ctx context.Context, recipientID, surah string) ([]ManqulSource, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT sh.owner_user_id, u.name, COUNT(*) AS cnt
		 FROM quran_manqul_share sh JOIN users u ON u.id = sh.owner_user_id
		 WHERE sh.recipient_user_id = ? AND sh.kunci_ayat LIKE ?
		 GROUP BY sh.owner_user_id, u.name
		 ORDER BY u.name ASC`,
		recipientID, surah+":%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ManqulSource{}
	for rows.Next() {
		var m ManqulSource
		if err := rows.Scan(&m.OwnerUserID, &m.OwnerName, &m.AyatCount); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SharedNotes returns owner's manqul notes for the given ayat that are shared
// with recipient. Both the per-ayah note (wordIdx -1) and per-word notes
// (>=0) come back, ordered for deterministic rendering.
func (s *ManqulShareStore) SharedNotes(ctx context.Context, recipientID, ownerID string, ayat []string) ([]ManqulNote, error) {
	out := []ManqulNote{}
	if len(ayat) == 0 {
		return out, nil
	}
	ph := make([]string, len(ayat))
	args := []any{ownerID, recipientID}
	for i, a := range ayat {
		ph[i] = "?"
		args = append(args, a)
	}
	q := `SELECT n.id, n.user_id, n.kunci_ayat, n.word_idx, n.teks, n.created_at, n.updated_at
	      FROM quran_manqul_note n
	      JOIN quran_manqul_share sh
	        ON sh.owner_user_id = n.user_id AND sh.kunci_ayat = n.kunci_ayat
	      WHERE n.user_id = ? AND sh.recipient_user_id = ?
	        AND n.kunci_ayat IN (` + strings.Join(ph, ",") + `)
	      ORDER BY n.kunci_ayat ASC, n.word_idx ASC`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var n ManqulNote
		if err := rows.Scan(&n.ID, &n.UserID, &n.KunciAyat, &n.WordIdx, &n.Teks, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}
