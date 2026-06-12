package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// Kelas — classroom, a group of generus taught by one or more guru under a
// tingkat. `GuruUserID` is the primary guru (wali kelas); `GuruUserIDs`
// is the full set including primary, sourced from kelas_guru (mig 024).
type Kelas struct {
	ID          string   `json:"id"`
	Nama        string   `json:"nama"`
	Tingkat     string   `json:"tingkat"`
	GuruUserID  *string  `json:"guruUserId,omitempty"`
	GuruName    *string  `json:"guruName,omitempty"`
	GuruUserIDs []string `json:"guruUserIds"`
	Tahun       int      `json:"tahun"`
	Deskripsi   *string  `json:"deskripsi,omitempty"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

type KelasInput struct {
	Nama        string
	Tingkat     string
	GuruUserID  *string
	GuruUserIDs []string
	Tahun       int
	Deskripsi   *string
}

type KelasListParams struct {
	Tingkat string
	Tahun   int
	GuruID  string
}

type KelasStore struct {
	db   *sql.DB
	sesi *SesiStore
}

func NewKelas(db *sql.DB) *KelasStore { return &KelasStore{db: db} }

const kelasCols = `k.id, k.nama, k.tingkat, k.guru_user_id, u.name AS guru_name,
	k.tahun, k.deskripsi, k.created_at, k.updated_at`

func (s *KelasStore) List(ctx context.Context, p KelasListParams) ([]Kelas, error) {
	clauses := []string{"1=1"}
	var args []any
	if p.Tingkat != "" {
		clauses = append(clauses, "k.tingkat = ?")
		args = append(args, p.Tingkat)
	}
	if p.Tahun != 0 {
		clauses = append(clauses, "k.tahun = ?")
		args = append(args, p.Tahun)
	}
	if p.GuruID != "" {
		// Match either primary guru OR any entry in the kelas_guru join.
		clauses = append(clauses,
			"(k.guru_user_id = ? OR EXISTS (SELECT 1 FROM kelas_guru kg WHERE kg.kelas_id = k.id AND kg.guru_user_id = ?))")
		args = append(args, p.GuruID, p.GuruID)
	}
	q := `SELECT ` + kelasCols + ` FROM kelas k
	      LEFT JOIN users u ON u.id = k.guru_user_id
	      WHERE ` + strings.Join(clauses, " AND ") + `
	      ORDER BY k.tahun DESC, k.tingkat ASC, k.nama ASC`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Kelas{}
	for rows.Next() {
		k, err := scanKelas(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *k)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Populate GuruUserIDs in one batched query to avoid N+1.
	if err := s.loadGuruIDs(ctx, out); err != nil {
		return nil, err
	}
	return out, nil
}

// loadGuruIDs fills the GuruUserIDs slice on each kelas in the slice.
func (s *KelasStore) loadGuruIDs(ctx context.Context, list []Kelas) error {
	if len(list) == 0 {
		return nil
	}
	ph := strings.Repeat("?,", len(list))
	ph = ph[:len(ph)-1]
	args := make([]any, 0, len(list))
	idx := make(map[string]int, len(list))
	for i, k := range list {
		args = append(args, k.ID)
		idx[k.ID] = i
		list[i].GuruUserIDs = []string{}
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT kelas_id, guru_user_id FROM kelas_guru WHERE kelas_id IN (`+ph+`)
		 ORDER BY created_at ASC`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var kid, gid string
		if err := rows.Scan(&kid, &gid); err != nil {
			return err
		}
		if i, ok := idx[kid]; ok {
			list[i].GuruUserIDs = append(list[i].GuruUserIDs, gid)
		}
	}
	return rows.Err()
}

func (s *KelasStore) Get(ctx context.Context, id string) (*Kelas, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+kelasCols+` FROM kelas k LEFT JOIN users u ON u.id = k.guru_user_id WHERE k.id = ?`, id)
	k, err := scanKelas(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	one := []Kelas{*k}
	if err := s.loadGuruIDs(ctx, one); err != nil {
		return nil, err
	}
	return &one[0], nil
}

func (s *KelasStore) Create(ctx context.Context, in KelasInput) (*Kelas, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	tahun := in.Tahun
	if tahun == 0 {
		tahun = time.Now().Year()
	}
	primary := primaryGuru(in)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO kelas (id, nama, tingkat, guru_user_id, tahun, deskripsi, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Nama, in.Tingkat, primary, tahun, in.Deskripsi, now, now,
	); err != nil {
		return nil, err
	}
	if err := writeGuruJoin(ctx, tx, id, in.GuruUserIDs, primary); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *KelasStore) Update(ctx context.Context, id string, in KelasInput) (*Kelas, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	tahun := in.Tahun
	if tahun == 0 {
		tahun = time.Now().Year()
	}
	primary := primaryGuru(in)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		`UPDATE kelas SET nama = ?, tingkat = ?, guru_user_id = ?, tahun = ?, deskripsi = ?, updated_at = ? WHERE id = ?`,
		in.Nama, in.Tingkat, primary, tahun, in.Deskripsi, now, id,
	)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	if err := writeGuruJoin(ctx, tx, id, in.GuruUserIDs, primary); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

// primaryGuru picks the primary/wali guru. If GuruUserID was set on the
// input we honour it; otherwise the first element of GuruUserIDs.
func primaryGuru(in KelasInput) *string {
	if in.GuruUserID != nil && *in.GuruUserID != "" {
		return in.GuruUserID
	}
	for _, g := range in.GuruUserIDs {
		if strings.TrimSpace(g) != "" {
			s := g
			return &s
		}
	}
	return nil
}

// writeGuruJoin replaces the kelas_guru rows for a kelas atomically. The
// primary guru is always included in the join.
func writeGuruJoin(ctx context.Context, tx *sql.Tx, kelasID string, guruIDs []string, primary *string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM kelas_guru WHERE kelas_id = ?`, kelasID); err != nil {
		return err
	}
	seen := map[string]bool{}
	add := func(g string) error {
		g = strings.TrimSpace(g)
		if g == "" || seen[g] {
			return nil
		}
		seen[g] = true
		_, err := tx.ExecContext(ctx,
			`INSERT INTO kelas_guru (kelas_id, guru_user_id) VALUES (?, ?)`, kelasID, g)
		return err
	}
	if primary != nil {
		if err := add(*primary); err != nil {
			return err
		}
	}
	for _, g := range guruIDs {
		if err := add(g); err != nil {
			return err
		}
	}
	return nil
}

func (s *KelasStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM kelas WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	// No SQL FK cascade — drop the kelas's recurring schedule explicitly.
	_, _ = s.db.ExecContext(ctx, `DELETE FROM kelas_jadwal WHERE kelas_id = ?`, id)
	return nil
}

// --- Anggota -------------------------------------------------------------

type KelasAnggota struct {
	KelasID    string `json:"kelasId"`
	MuridID    string `json:"muridUserId"`
	MuridName  string `json:"muridName"`
	CreatedAt  string `json:"createdAt"`
}

func (s *KelasStore) ListAnggota(ctx context.Context, kelasID string) ([]KelasAnggota, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT a.kelas_id, a.murid_user_id, u.name, a.created_at
		 FROM kelas_anggota a
		 JOIN users u ON u.id = a.murid_user_id
		 WHERE a.kelas_id = ?
		 ORDER BY u.name ASC`, kelasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []KelasAnggota{}
	for rows.Next() {
		var a KelasAnggota
		if err := rows.Scan(&a.KelasID, &a.MuridID, &a.MuridName, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *KelasStore) AddAnggota(ctx context.Context, kelasID string, muridIDs []string) error {
	if len(muridIDs) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.PrepareContext(ctx,
		`INSERT OR IGNORE INTO kelas_anggota (kelas_id, murid_user_id) VALUES (?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, id := range muridIDs {
		if _, err := stmt.ExecContext(ctx, kelasID, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *KelasStore) RemoveAnggota(ctx context.Context, kelasID, muridID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM kelas_anggota WHERE kelas_id = ? AND murid_user_id = ?`, kelasID, muridID)
	return err
}

// --- Guru anggota (kelas_guru) ------------------------------------------

type KelasGuruAnggota struct {
	KelasID   string `json:"kelasId"`
	GuruID    string `json:"guruUserId"`
	GuruName  string `json:"guruName"`
	IsPrimary bool   `json:"isPrimary"`
	CreatedAt string `json:"createdAt"`
}

func (s *KelasStore) ListGuruAnggota(ctx context.Context, kelasID string) ([]KelasGuruAnggota, error) {
	var primary sql.NullString
	if err := s.db.QueryRowContext(ctx,
		`SELECT guru_user_id FROM kelas WHERE id = ?`, kelasID).Scan(&primary); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT kg.kelas_id, kg.guru_user_id, u.name, kg.created_at
		 FROM kelas_guru kg
		 JOIN users u ON u.id = kg.guru_user_id
		 WHERE kg.kelas_id = ?
		 ORDER BY u.name ASC`, kelasID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []KelasGuruAnggota{}
	for rows.Next() {
		var a KelasGuruAnggota
		if err := rows.Scan(&a.KelasID, &a.GuruID, &a.GuruName, &a.CreatedAt); err != nil {
			return nil, err
		}
		if primary.Valid && primary.String == a.GuruID {
			a.IsPrimary = true
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *KelasStore) AddGuruAnggota(ctx context.Context, kelasID string, guruIDs []string) error {
	if len(guruIDs) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var primary sql.NullString
	if err := tx.QueryRowContext(ctx,
		`SELECT guru_user_id FROM kelas WHERE id = ?`, kelasID).Scan(&primary); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	stmt, err := tx.PrepareContext(ctx,
		`INSERT OR IGNORE INTO kelas_guru (kelas_id, guru_user_id) VALUES (?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	firstAdded := ""
	for _, id := range guruIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, err := stmt.ExecContext(ctx, kelasID, id); err != nil {
			return err
		}
		if firstAdded == "" {
			firstAdded = id
		}
	}

	if !primary.Valid && firstAdded != "" {
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		if _, err := tx.ExecContext(ctx,
			`UPDATE kelas SET guru_user_id = ?, updated_at = ? WHERE id = ?`,
			firstAdded, now, kelasID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *KelasStore) RemoveGuruAnggota(ctx context.Context, kelasID, guruID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM kelas_guru WHERE kelas_id = ? AND guru_user_id = ?`, kelasID, guruID); err != nil {
		return err
	}

	var primary sql.NullString
	if err := tx.QueryRowContext(ctx,
		`SELECT guru_user_id FROM kelas WHERE id = ?`, kelasID).Scan(&primary); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if primary.Valid && primary.String == guruID {
		var next sql.NullString
		if err := tx.QueryRowContext(ctx,
			`SELECT guru_user_id FROM kelas_guru WHERE kelas_id = ? ORDER BY created_at ASC LIMIT 1`,
			kelasID).Scan(&next); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		if next.Valid {
			if _, err := tx.ExecContext(ctx,
				`UPDATE kelas SET guru_user_id = ?, updated_at = ? WHERE id = ?`,
				next.String, now, kelasID); err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(ctx,
				`UPDATE kelas SET guru_user_id = NULL, updated_at = ? WHERE id = ?`,
				now, kelasID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func scanKelas(s scanner) (*Kelas, error) {
	var k Kelas
	if err := s.Scan(
		&k.ID, &k.Nama, &k.Tingkat, &k.GuruUserID, &k.GuruName,
		&k.Tahun, &k.Deskripsi, &k.CreatedAt, &k.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &k, nil
}
