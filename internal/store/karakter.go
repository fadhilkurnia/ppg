package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// KarakterItem — one row in the karakter_luhur table.
type KarakterItem struct {
	ID           string  `json:"id"`
	Parent       string  `json:"parent"`
	ParentEn     *string `json:"parentEn,omitempty"`
	ParentUrutan int     `json:"parentUrutan"`
	LabelID      string  `json:"labelId"`
	LabelEn      *string `json:"labelEn,omitempty"`
	ItemUrutan   int     `json:"itemUrutan"`
	Catatan      *string `json:"catatan,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type KarakterInput struct {
	Parent       string
	ParentEn     *string
	ParentUrutan int
	LabelID      string
	LabelEn      *string
	ItemUrutan   int
	Catatan      *string
}

type KarakterStore struct {
	db *sql.DB
}

func NewKarakter(db *sql.DB) *KarakterStore { return &KarakterStore{db: db} }

const karakterCols = `id, parent, parent_en, parent_urutan, label_id, label_en, item_urutan, catatan, created_at, updated_at`

func (s *KarakterStore) List(ctx context.Context) ([]KarakterItem, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+karakterCols+` FROM karakter_luhur
		 ORDER BY parent_urutan ASC, item_urutan ASC, label_id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []KarakterItem{}
	for rows.Next() {
		v, err := scanKarakter(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

func (s *KarakterStore) Get(ctx context.Context, id string) (*KarakterItem, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+karakterCols+` FROM karakter_luhur WHERE id = ?`, id)
	v, err := scanKarakter(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return v, nil
}

func (s *KarakterStore) Create(ctx context.Context, in KarakterInput) (*KarakterItem, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO karakter_luhur (id, parent, parent_en, parent_urutan, label_id, label_en, item_urutan, catatan, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Parent, in.ParentEn, in.ParentUrutan, in.LabelID, in.LabelEn, in.ItemUrutan, in.Catatan, now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *KarakterStore) Update(ctx context.Context, id string, in KarakterInput) (*KarakterItem, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	res, err := s.db.ExecContext(ctx,
		`UPDATE karakter_luhur SET parent = ?, parent_en = ?, parent_urutan = ?, label_id = ?, label_en = ?, item_urutan = ?, catatan = ?, updated_at = ?
		 WHERE id = ?`,
		in.Parent, in.ParentEn, in.ParentUrutan, in.LabelID, in.LabelEn, in.ItemUrutan, in.Catatan, now, id,
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

func (s *KarakterStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM karakter_luhur WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// RenameGroup renames a whole karakter group: every row whose parent matches
// `oldParent` is updated to the new parent (+ parentEn + urutan if provided).
// Returns the row count that was affected.
func (s *KarakterStore) RenameGroup(ctx context.Context, oldParent, newParent string, newParentEn *string, newUrutan *int) (int, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	sets := []string{"parent = ?", "updated_at = ?"}
	args := []any{newParent, now}
	if newParentEn != nil {
		sets = append(sets, "parent_en = ?")
		args = append(args, *newParentEn)
	}
	if newUrutan != nil {
		sets = append(sets, "parent_urutan = ?")
		args = append(args, *newUrutan)
	}
	args = append(args, oldParent)
	q := "UPDATE karakter_luhur SET " + strings.Join(sets, ", ") + " WHERE parent = ?"
	res, err := s.db.ExecContext(ctx, q, args...)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return 0, ErrNotFound
	}
	return int(n), nil
}

// DeleteGroup removes every karakter row that belongs to a given parent.
func (s *KarakterStore) DeleteGroup(ctx context.Context, parent string) (int, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM karakter_luhur WHERE parent = ?`, parent)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return 0, ErrNotFound
	}
	return int(n), nil
}

// SeedKarakter inserts the canonical 29-item default set if the table is
// empty. Idempotent.
func SeedKarakter(ctx context.Context, db *sql.DB) error {
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM karakter_luhur`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO karakter_luhur (id, parent, parent_en, parent_urutan, label_id, label_en, item_urutan)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, g := range karakterSeed {
		for i, it := range g.Items {
			if _, err := stmt.ExecContext(ctx,
				ulid.Make().String(),
				g.Parent, g.ParentEn, g.Urutan,
				it.ID, it.En, i,
			); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

type seedGroup struct {
	Parent   string
	ParentEn string
	Urutan   int
	Items    []seedItem
}
type seedItem struct {
	ID string
	En string
}

// karakterSeed mirrors web/app/src/lib/pustakaData.ts KARAKTER_LUHUR. Kept in
// sync manually — there's only 29 entries.
var karakterSeed = []seedGroup{
	{
		Parent: "4 Tali Keimanan", ParentEn: "4 Pillars of Faith", Urutan: 1,
		Items: []seedItem{
			{"Bersyukur", "Gratitude"},
			{"Mempersungguh", "Earnestness"},
			{"Berdoa", "Supplication"},
			{"Mengagungkan", "Glorification"},
		},
	},
	{
		Parent: "6 Tabi'at Luhur", ParentEn: "6 Noble Traits", Urutan: 2,
		Items: []seedItem{
			{"Rukun", "Harmony"},
			{"Kompak", "Solidarity"},
			{"Kerjasama yang Baik", "Good Cooperation"},
			{"Jujur", "Honesty"},
			{"Amanah", "Trustworthiness"},
			{"Mujhid Muzhid", "Diligent & Frugal"},
		},
	},
	{
		Parent: "5 Bisa (Karakter Sukses)", ParentEn: "5 Capabilities of Success", Urutan: 3,
		Items: []seedItem{
			{"Bisa Mengaji", "Can recite Qur'an"},
			{"Bisa Mengamalkan", "Can practice the teachings"},
			{"Bisa Membela", "Can defend the faith"},
			{"Bisa Menyebarkan (Berdakwah)", "Can spread / preach"},
			{"Bisa Berakhlakul Karimah", "Can uphold noble character"},
		},
	},
	{
		Parent: "3 Sukses Generus (Trisukses)", ParentEn: "3 Successes of the Younger Generation", Urutan: 4,
		Items: []seedItem{
			{"Faham Agama (Alim-Faqih)", "Religious Understanding (Alim-Faqih)"},
			{"Berakhlakul Karimah", "Noble Character"},
			{"Mandiri (Kemandirian)", "Independence"},
		},
	},
	{
		Parent: "5 Sukses Pembinaan Generus (Panca Bina)", ParentEn: "5 Successes of Youth Development", Urutan: 5,
		Items: []seedItem{
			{"Keilmuan", "Knowledge"},
			{"Kefahaman Agama", "Religious Comprehension"},
			{"Akhlakul Karimah", "Noble Character"},
			{"Kemandirian", "Self-reliance"},
			{"Kepemimpinan", "Leadership"},
		},
	},
	{
		Parent: "6 Karakter Sosial Luhur", ParentEn: "6 Noble Social Characters", Urutan: 6,
		Items: []seedItem{
			{"Sopan Santun", "Politeness"},
			{"Tata Krama", "Etiquette"},
			{"Toleransi", "Tolerance"},
			{"Tolong-Menolong", "Mutual Help"},
			{"Hormat kepada Orang Tua/Guru", "Respect to Parents/Teachers"},
			{"Cinta Tanah Air", "Love of Country"},
		},
	},
}

func scanKarakter(s scanner) (*KarakterItem, error) {
	var v KarakterItem
	if err := s.Scan(
		&v.ID, &v.Parent, &v.ParentEn, &v.ParentUrutan,
		&v.LabelID, &v.LabelEn, &v.ItemUrutan, &v.Catatan,
		&v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &v, nil
}
