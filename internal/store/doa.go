package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// Doa — read-only listing of CompactAjar entries (port of sitrac-v3's
// `/api/compact-ajar`). Each row is a hafalan/doa/asmaul-husna item with
// Arab text + translation. Read-only for now; admin editing can come later.
type Doa struct {
	ID         string  `json:"id"`
	Nama       string  `json:"nama"`
	Deskripsi  *string `json:"deskripsi,omitempty"`
	Aktif      bool    `json:"aktif"`
	TeksArab   *string `json:"teksArab,omitempty"`
	TeksLatin  *string `json:"teksLatin,omitempty"`
	Terjemahan *string `json:"terjemahan,omitempty"`
	Sumber     *string `json:"sumber,omitempty"`
	QuranSurah *int    `json:"quranSurah,omitempty"`
	QuranAyat  *string `json:"quranAyat,omitempty"`
}

type DoaStore struct {
	db *sql.DB
}

func NewDoa(db *sql.DB) *DoaStore { return &DoaStore{db: db} }

type DoaListParams struct {
	Query string
}

const doaCols = `id, nama, deskripsi, aktif,
	teks_arab, teks_latin, terjemahan, sumber, quran_surah, quran_ayat`

func (s *DoaStore) List(ctx context.Context, p DoaListParams) ([]Doa, error) {
	clauses := []string{"aktif = 1"}
	var args []any
	if q := strings.TrimSpace(p.Query); q != "" {
		clauses = append(clauses,
			"(nama LIKE ? OR teks_arab LIKE ? OR teks_latin LIKE ? OR terjemahan LIKE ? OR sumber LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like, like, like)
	}
	q := `SELECT ` + doaCols + ` FROM compact_ajar
	      WHERE ` + strings.Join(clauses, " AND ") + `
	      ORDER BY nama ASC`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Doa{}
	for rows.Next() {
		d, err := scanDoa(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

func (s *DoaStore) Get(ctx context.Context, id string) (*Doa, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+doaCols+` FROM compact_ajar WHERE id = ?`, id)
	d, err := scanDoa(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return d, nil
}

// DoaInput captures the writable fields for Create/Update.
type DoaInput struct {
	Nama       string
	Deskripsi  *string
	Aktif      bool
	TeksArab   *string
	TeksLatin  *string
	Terjemahan *string
	Sumber     *string
	QuranSurah *int
	QuranAyat  *string
}

// Create inserts a new doa row. Returns the inserted row.
func (s *DoaStore) Create(ctx context.Context, in DoaInput) (*Doa, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO compact_ajar
		   (id, nama, deskripsi, aktif,
		    teks_arab, teks_latin, terjemahan, sumber, quran_surah, quran_ayat,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, strings.TrimSpace(in.Nama), in.Deskripsi, boolToInt(in.Aktif),
		in.TeksArab, in.TeksLatin, in.Terjemahan, in.Sumber, in.QuranSurah, in.QuranAyat,
		now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *DoaStore) Update(ctx context.Context, id string, in DoaInput) (*Doa, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	res, err := s.db.ExecContext(ctx,
		`UPDATE compact_ajar SET
		   nama = ?, deskripsi = ?, aktif = ?,
		   teks_arab = ?, teks_latin = ?, terjemahan = ?, sumber = ?,
		   quran_surah = ?, quran_ayat = ?, updated_at = ?
		 WHERE id = ?`,
		strings.TrimSpace(in.Nama), in.Deskripsi, boolToInt(in.Aktif),
		in.TeksArab, in.TeksLatin, in.Terjemahan, in.Sumber,
		in.QuranSurah, in.QuranAyat, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

func (s *DoaStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM compact_ajar WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func scanDoa(s scanner) (*Doa, error) {
	var d Doa
	var aktif int
	if err := s.Scan(
		&d.ID, &d.Nama, &d.Deskripsi, &aktif,
		&d.TeksArab, &d.TeksLatin, &d.Terjemahan, &d.Sumber, &d.QuranSurah, &d.QuranAyat,
	); err != nil {
		return nil, err
	}
	d.Aktif = aktif == 1
	return &d, nil
}
