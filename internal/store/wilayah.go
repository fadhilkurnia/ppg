package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// Wilayah is the master Daerah -> Desa -> Kelompok hierarchy that backs the
// cascading location dropdowns. Names only (no code). It is purely an option
// source: user rows still store the chosen names as free text.
type Wilayah struct {
	db *sql.DB
}

func NewWilayah(db *sql.DB) *Wilayah { return &Wilayah{db: db} }

type WilayahKelompok struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type WilayahDesa struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	Kelompok []WilayahKelompok `json:"kelompok"`
}

type WilayahDaerah struct {
	ID   string        `json:"id"`
	Name string        `json:"name"`
	Desa []WilayahDesa `json:"desa"`
}

// Tree returns the full hierarchy sorted by sort_order then name at each level.
func (w *Wilayah) Tree(ctx context.Context) ([]WilayahDaerah, error) {
	daerah := []WilayahDaerah{}
	idxD := map[string]int{} // daerahID -> index in daerah

	rows, err := w.db.QueryContext(ctx, `SELECT id, name FROM wilayah_daerah ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var d WilayahDaerah
		if err := rows.Scan(&d.ID, &d.Name); err != nil {
			rows.Close()
			return nil, err
		}
		d.Desa = []WilayahDesa{}
		idxD[d.ID] = len(daerah)
		daerah = append(daerah, d)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	idxV := map[string][2]int{} // desaID -> {daerahIdx, desaIdx}
	rows, err = w.db.QueryContext(ctx, `SELECT id, daerah_id, name FROM wilayah_desa ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var v WilayahDesa
		var daerahID string
		if err := rows.Scan(&v.ID, &daerahID, &v.Name); err != nil {
			rows.Close()
			return nil, err
		}
		v.Kelompok = []WilayahKelompok{}
		di, ok := idxD[daerahID]
		if !ok {
			continue
		}
		daerah[di].Desa = append(daerah[di].Desa, v)
		idxV[v.ID] = [2]int{di, len(daerah[di].Desa) - 1}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	rows, err = w.db.QueryContext(ctx, `SELECT id, desa_id, name FROM wilayah_kelompok ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k WilayahKelompok
		var desaID string
		if err := rows.Scan(&k.ID, &desaID, &k.Name); err != nil {
			rows.Close()
			return nil, err
		}
		pos, ok := idxV[desaID]
		if !ok {
			continue
		}
		daerah[pos[0]].Desa[pos[1]].Kelompok = append(daerah[pos[0]].Desa[pos[1]].Kelompok, k)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	return daerah, nil
}

// --- Daerah ---------------------------------------------------------------

func (w *Wilayah) CreateDaerah(ctx context.Context, name string) (string, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := w.db.ExecContext(ctx,
		`INSERT INTO wilayah_daerah (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		id, strings.TrimSpace(name), now, now)
	return id, err
}

func (w *Wilayah) RenameDaerah(ctx context.Context, id, name string) error {
	return w.rename(ctx, "wilayah_daerah", id, name)
}

func (w *Wilayah) DeleteDaerah(ctx context.Context, id string) error {
	return w.del(ctx, "wilayah_daerah", id)
}

// --- Desa -----------------------------------------------------------------

func (w *Wilayah) CreateDesa(ctx context.Context, daerahID, name string) (string, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := w.db.ExecContext(ctx,
		`INSERT INTO wilayah_desa (id, daerah_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, daerahID, strings.TrimSpace(name), now, now)
	return id, err
}

func (w *Wilayah) RenameDesa(ctx context.Context, id, name string) error {
	return w.rename(ctx, "wilayah_desa", id, name)
}

func (w *Wilayah) DeleteDesa(ctx context.Context, id string) error {
	return w.del(ctx, "wilayah_desa", id)
}

// --- Kelompok -------------------------------------------------------------

func (w *Wilayah) CreateKelompok(ctx context.Context, desaID, name string) (string, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := w.db.ExecContext(ctx,
		`INSERT INTO wilayah_kelompok (id, desa_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, desaID, strings.TrimSpace(name), now, now)
	return id, err
}

func (w *Wilayah) RenameKelompok(ctx context.Context, id, name string) error {
	return w.rename(ctx, "wilayah_kelompok", id, name)
}

func (w *Wilayah) DeleteKelompok(ctx context.Context, id string) error {
	return w.del(ctx, "wilayah_kelompok", id)
}

// --- shared helpers -------------------------------------------------------

func (w *Wilayah) rename(ctx context.Context, table, id, name string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := w.db.ExecContext(ctx,
		`UPDATE `+table+` SET name = ?, updated_at = ? WHERE id = ?`,
		strings.TrimSpace(name), now, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (w *Wilayah) del(ctx context.Context, table, id string) error {
	res, err := w.db.ExecContext(ctx, `DELETE FROM `+table+` WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
