package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"
)

// TahunAjaran — one academic-year row. `Active` enforces a single-active
// invariant at the store layer (any SetActive call demotes the others).
type TahunAjaran struct {
	ID                  string  `json:"id"`
	Nama                string  `json:"nama"`
	Active              bool    `json:"active"`
	Semester1StartMonth int     `json:"semester1StartMonth"`
	Semester2StartMonth int     `json:"semester2StartMonth"`
	TanggalMulai        *string `json:"tanggalMulai,omitempty"`
	TanggalSelesai      *string `json:"tanggalSelesai,omitempty"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
}

type TahunAjaranInput struct {
	Nama                string
	Semester1StartMonth int
	Semester2StartMonth int
	TanggalMulai        *string
	TanggalSelesai      *string
}

type TahunAjaranStore struct {
	db *sql.DB
}

func NewTahunAjaran(db *sql.DB) *TahunAjaranStore { return &TahunAjaranStore{db: db} }

const tahunAjaranCols = `id, nama, active, semester1_start_month, semester2_start_month,
	tanggal_mulai, tanggal_selesai, created_at, updated_at`

func (s *TahunAjaranStore) List(ctx context.Context) ([]TahunAjaran, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+tahunAjaranCols+` FROM tahun_ajaran ORDER BY nama DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TahunAjaran{}
	for rows.Next() {
		t, err := scanTahunAjaran(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (s *TahunAjaranStore) Active(ctx context.Context) (*TahunAjaran, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+tahunAjaranCols+` FROM tahun_ajaran WHERE active = 1 LIMIT 1`)
	t, err := scanTahunAjaran(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return t, nil
}

func (s *TahunAjaranStore) Get(ctx context.Context, id string) (*TahunAjaran, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+tahunAjaranCols+` FROM tahun_ajaran WHERE id = ?`, id)
	t, err := scanTahunAjaran(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return t, nil
}

func (s *TahunAjaranStore) Create(ctx context.Context, in TahunAjaranInput) (*TahunAjaran, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if in.Semester1StartMonth == 0 {
		in.Semester1StartMonth = 7
	}
	if in.Semester2StartMonth == 0 {
		in.Semester2StartMonth = 1
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO tahun_ajaran (id, nama, active, semester1_start_month, semester2_start_month,
		   tanggal_mulai, tanggal_selesai, created_at, updated_at)
		 VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`,
		id, in.Nama, in.Semester1StartMonth, in.Semester2StartMonth,
		in.TanggalMulai, in.TanggalSelesai, now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *TahunAjaranStore) Update(ctx context.Context, id string, in TahunAjaranInput) (*TahunAjaran, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	res, err := s.db.ExecContext(ctx,
		`UPDATE tahun_ajaran SET nama = ?, semester1_start_month = ?, semester2_start_month = ?,
		   tanggal_mulai = ?, tanggal_selesai = ?, updated_at = ?
		 WHERE id = ?`,
		in.Nama, in.Semester1StartMonth, in.Semester2StartMonth,
		in.TanggalMulai, in.TanggalSelesai, now, id,
	)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

func (s *TahunAjaranStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM tahun_ajaran WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// SetActive flips the active flag of `id` to 1 and demotes every other row
// to 0, atomically inside a transaction.
func (s *TahunAjaranStore) SetActive(ctx context.Context, id string) (*TahunAjaran, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE tahun_ajaran SET active = 0 WHERE active = 1`); err != nil {
		return nil, err
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE tahun_ajaran SET active = 1, updated_at = ? WHERE id = ?`,
		time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func scanTahunAjaran(s scanner) (*TahunAjaran, error) {
	var t TahunAjaran
	var active int
	if err := s.Scan(
		&t.ID, &t.Nama, &active, &t.Semester1StartMonth, &t.Semester2StartMonth,
		&t.TanggalMulai, &t.TanggalSelesai, &t.CreatedAt, &t.UpdatedAt,
	); err != nil {
		return nil, err
	}
	t.Active = active == 1
	return &t, nil
}
