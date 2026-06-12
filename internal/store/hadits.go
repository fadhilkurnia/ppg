package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/oklog/ulid/v2"
)

// ErrHaditsKitabConflict — slug already exists when creating a kitab.
var ErrHaditsKitabConflict = errors.New("hadits kitab slug exists")

// HaditsKitab — a hadith book (kitab himpunan / maktabah syamilah).
type HaditsKitab struct {
	ID             string  `json:"id"`
	Slug           string  `json:"slug"`
	Nama           string  `json:"nama"`
	NamaArab       *string `json:"namaArab,omitempty"`
	Deskripsi      *string `json:"deskripsi,omitempty"`
	Perawi         *string `json:"perawi,omitempty"`
	Urutan         int     `json:"urutan"`
	Scope          string  `json:"scope"`
	JumlahHalaman  int     `json:"jumlahHalaman"`
	BabCount       int     `json:"babCount"`
	HaditsCount    int     `json:"haditsCount"`
}

type HaditsBab struct {
	ID        string  `json:"id"`
	KitabID   string  `json:"kitabId"`
	Nomor     int     `json:"nomor"`
	Nama      string  `json:"nama"`
	Deskripsi *string `json:"deskripsi,omitempty"`
}

type Hadits struct {
	ID            string  `json:"id"`
	KitabID       string  `json:"kitabId"`
	BabID         *string `json:"babId,omitempty"`
	Nomor         int     `json:"nomor"`
	TeksArab      *string `json:"teksArab,omitempty"`
	TeksLatin     *string `json:"teksLatin,omitempty"`
	Terjemahan    *string `json:"terjemahan,omitempty"`
	TerjemahanEn  *string `json:"terjemahanEn,omitempty"`
	Perawi        *string `json:"perawi,omitempty"`
	Derajat       *string `json:"derajat,omitempty"`
	SumberAsli    *string `json:"sumberAsli,omitempty"`
}

type HaditsStore struct {
	db *sql.DB
}

func NewHadits(db *sql.DB) *HaditsStore { return &HaditsStore{db: db} }

// ListKitab returns the kitab catalogue, optionally filtered by scope.
// scope "all" or "" returns everything. The returned rows include the
// derived bab + hadits counts so the FE can render badges without an extra
// round trip.
func (s *HaditsStore) ListKitab(ctx context.Context, scope string) ([]HaditsKitab, error) {
	clauses := []string{"1=1"}
	var args []any
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "hadits":
		clauses = append(clauses, "(scope = 'hadits' OR scope = 'both')")
	case "maktabah":
		clauses = append(clauses, "(scope = 'maktabah' OR scope = 'both')")
	}
	q := `SELECT k.id, k.slug, k.nama, k.nama_arab, k.deskripsi, k.perawi, k.urutan, k.scope, k.jumlah_halaman,
	             (SELECT COUNT(*) FROM hadits_bab b WHERE b.kitab_id = k.id) AS bab_count,
	             (SELECT COUNT(*) FROM hadits h WHERE h.kitab_id = k.id) AS hadits_count
	      FROM hadits_kitab k
	      WHERE ` + strings.Join(clauses, " AND ") + `
	      ORDER BY k.urutan ASC, k.nama ASC`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HaditsKitab{}
	for rows.Next() {
		var k HaditsKitab
		if err := rows.Scan(&k.ID, &k.Slug, &k.Nama, &k.NamaArab, &k.Deskripsi, &k.Perawi,
			&k.Urutan, &k.Scope, &k.JumlahHalaman, &k.BabCount, &k.HaditsCount); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// KitabInput — payload used by Create/Update kitab.
type KitabInput struct {
	Slug          string
	Nama          string
	NamaArab      *string
	Deskripsi     *string
	Perawi        *string
	Urutan        int
	Scope         string
	JumlahHalaman int
}

// CreateKitab inserts a new hadits kitab. Returns ErrConflict if the slug
// already exists.
func (s *HaditsStore) CreateKitab(ctx context.Context, in KitabInput) (*HaditsKitab, error) {
	id := ulid.Make().String()
	if in.Scope == "" {
		in.Scope = "hadits"
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO hadits_kitab (id, slug, nama, nama_arab, deskripsi, perawi,
		   urutan, scope, jumlah_halaman)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Slug, in.Nama, in.NamaArab, in.Deskripsi, in.Perawi,
		in.Urutan, in.Scope, in.JumlahHalaman,
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, ErrHaditsKitabConflict
		}
		return nil, err
	}
	return s.GetKitabBySlug(ctx, in.Slug)
}

// UpdateKitab replaces all editable fields of a kitab in one shot.
func (s *HaditsStore) UpdateKitab(ctx context.Context, slug string, in KitabInput) (*HaditsKitab, error) {
	if in.Scope == "" {
		in.Scope = "hadits"
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE hadits_kitab SET
		   nama = ?, nama_arab = ?, deskripsi = ?, perawi = ?,
		   urutan = ?, scope = ?, jumlah_halaman = ?,
		   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE slug = ?`,
		in.Nama, in.NamaArab, in.Deskripsi, in.Perawi,
		in.Urutan, in.Scope, in.JumlahHalaman, slug,
	)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	return s.GetKitabBySlug(ctx, slug)
}

// DeleteKitab removes a kitab and its child bab + hadits rows.
func (s *HaditsStore) DeleteKitab(ctx context.Context, slug string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var kitabID string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM hadits_kitab WHERE slug = ?`, slug).Scan(&kitabID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM hadits WHERE kitab_id = ?`, kitabID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM hadits_bab WHERE kitab_id = ?`, kitabID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM hadits_kitab WHERE id = ?`, kitabID); err != nil {
		return err
	}
	return tx.Commit()
}

// UpdateKitabJumlahHalaman sets the target page count for a kitab himpunan.
// Admin uses this to configure how many "pages" of the kitab need to be
// covered (each kitab in PPG curriculum has a target page count for the
// teaching plan / raport coverage).
func (s *HaditsStore) UpdateKitabJumlahHalaman(ctx context.Context, slug string, jumlah int) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE hadits_kitab SET jumlah_halaman = ?,
		   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		 WHERE slug = ?`,
		jumlah, slug)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *HaditsStore) GetKitabBySlug(ctx context.Context, slug string) (*HaditsKitab, error) {
	q := `SELECT k.id, k.slug, k.nama, k.nama_arab, k.deskripsi, k.perawi, k.urutan, k.scope, k.jumlah_halaman,
	             (SELECT COUNT(*) FROM hadits_bab b WHERE b.kitab_id = k.id),
	             (SELECT COUNT(*) FROM hadits h WHERE h.kitab_id = k.id)
	      FROM hadits_kitab k WHERE k.slug = ?`
	var k HaditsKitab
	if err := s.db.QueryRowContext(ctx, q, slug).Scan(
		&k.ID, &k.Slug, &k.Nama, &k.NamaArab, &k.Deskripsi, &k.Perawi,
		&k.Urutan, &k.Scope, &k.JumlahHalaman, &k.BabCount, &k.HaditsCount,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &k, nil
}

func (s *HaditsStore) ListBab(ctx context.Context, kitabID string) ([]HaditsBab, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, kitab_id, nomor, nama, deskripsi FROM hadits_bab
		 WHERE kitab_id = ? ORDER BY nomor ASC`, kitabID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HaditsBab{}
	for rows.Next() {
		var b HaditsBab
		if err := rows.Scan(&b.ID, &b.KitabID, &b.Nomor, &b.Nama, &b.Deskripsi); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

type HaditsListParams struct {
	KitabID string
	BabID   string
	Query   string
	Limit   int
	Offset  int
}

// ListHadits paginates hadits with optional bab + text search. Search runs
// across teks_latin, terjemahan, and terjemahan_en (case-insensitive LIKE).
func (s *HaditsStore) ListHadits(ctx context.Context, p HaditsListParams) ([]Hadits, int, error) {
	if p.Limit <= 0 || p.Limit > 500 {
		p.Limit = 50
	}
	if p.Offset < 0 {
		p.Offset = 0
	}
	clauses := []string{"1=1"}
	var args []any
	if p.KitabID != "" {
		clauses = append(clauses, "kitab_id = ?")
		args = append(args, p.KitabID)
	}
	if p.BabID != "" {
		clauses = append(clauses, "bab_id = ?")
		args = append(args, p.BabID)
	}
	if q := strings.TrimSpace(p.Query); q != "" {
		clauses = append(clauses,
			"(teks_arab LIKE ? OR teks_latin LIKE ? OR terjemahan LIKE ? OR terjemahan_en LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like, like, like)
	}
	where := " WHERE " + strings.Join(clauses, " AND ")

	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM hadits`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, p.Limit, p.Offset)
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, kitab_id, bab_id, nomor, teks_arab, teks_latin, terjemahan, terjemahan_en,
		        perawi, derajat, sumber_asli
		 FROM hadits`+where+` ORDER BY nomor ASC LIMIT ? OFFSET ?`,
		args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Hadits{}
	for rows.Next() {
		var h Hadits
		if err := rows.Scan(
			&h.ID, &h.KitabID, &h.BabID, &h.Nomor,
			&h.TeksArab, &h.TeksLatin, &h.Terjemahan, &h.TerjemahanEn,
			&h.Perawi, &h.Derajat, &h.SumberAsli,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, h)
	}
	return out, total, rows.Err()
}
