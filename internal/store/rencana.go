package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// Rencana — monthly teaching plan for a kelas.
type Rencana struct {
	ID        string  `json:"id"`
	KelasID   string  `json:"kelasId"`
	Tahun     int     `json:"tahun"`
	Bulan     int     `json:"bulan"`
	Semester  *int    `json:"semester,omitempty"`
	Catatan   *string `json:"catatan,omitempty"`
	CreatedBy *string `json:"createdBy,omitempty"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`

	// Populated by GetWithItems.
	Items []RencanaItem `json:"items,omitempty"`
}

// RencanaItem — one planned slot within a Rencana. Either backed by a
// materi_ajar (kurikulum) or by a library reference (quran/hadits/tilawati/
// doa). Exactly one of MateriAjarID / LibraryKind is set.
type RencanaItem struct {
	ID             string  `json:"id"`
	RencanaID      string  `json:"rencanaId"`
	MateriAjarID   *string `json:"materiAjarId,omitempty"`
	LibraryKind    *string `json:"libraryKind,omitempty"`
	LibraryAspect  *string `json:"libraryAspect,omitempty"`
	LibraryRef     *string `json:"libraryRef,omitempty"`
	Urutan         int     `json:"urutan"`
	Selesai        bool    `json:"selesai"`
	TanggalSelesai *string `json:"tanggalSelesai,omitempty"`
	Catatan        *string `json:"catatan,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`

	// Hydrated materi_ajar payload (subset used by the UI).
	Ajar *MateriAjar `json:"ajar,omitempty"`
}

type RencanaStore struct {
	db *sql.DB
}

func NewRencana(db *sql.DB) *RencanaStore { return &RencanaStore{db: db} }

const rencanaCols = `id, kelas_id, tahun, bulan, semester, catatan, created_by, created_at, updated_at`

func (s *RencanaStore) List(ctx context.Context, kelasID string, tahun, bulan int) ([]Rencana, error) {
	clauses := []string{"1=1"}
	var args []any
	if kelasID != "" {
		clauses = append(clauses, "kelas_id = ?")
		args = append(args, kelasID)
	}
	if tahun != 0 {
		clauses = append(clauses, "tahun = ?")
		args = append(args, tahun)
	}
	if bulan != 0 {
		clauses = append(clauses, "bulan = ?")
		args = append(args, bulan)
	}
	q := `SELECT ` + rencanaCols + ` FROM rencana_bulanan WHERE ` + strings.Join(clauses, " AND ") +
		` ORDER BY tahun DESC, bulan DESC`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Rencana{}
	for rows.Next() {
		r, err := scanRencana(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (s *RencanaStore) Get(ctx context.Context, id string) (*Rencana, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+rencanaCols+` FROM rencana_bulanan WHERE id = ?`, id)
	r, err := scanRencana(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	items, err := s.listItems(ctx, id)
	if err != nil {
		return nil, err
	}
	r.Items = items
	return r, nil
}

// GetOrCreate finds the rencana for (kelas, tahun, bulan) or creates an empty
// one. Used by the FE "+ Add to plan" flow which doesn't pre-create.
func (s *RencanaStore) GetOrCreate(ctx context.Context, kelasID string, tahun, bulan int, createdBy string) (*Rencana, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+rencanaCols+` FROM rencana_bulanan WHERE kelas_id = ? AND tahun = ? AND bulan = ?`,
		kelasID, tahun, bulan)
	r, err := scanRencana(row)
	if err == nil {
		items, err := s.listItems(ctx, r.ID)
		if err != nil {
			return nil, err
		}
		r.Items = items
		return r, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	// Create
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	semester := 1
	if bulan >= 1 && bulan <= 6 {
		semester = 2
	}
	var createdByPtr *string
	if createdBy != "" {
		createdByPtr = &createdBy
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO rencana_bulanan (id, kelas_id, tahun, bulan, semester, created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, kelasID, tahun, bulan, semester, createdByPtr, now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *RencanaStore) Delete(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM rencana_bulanan_item WHERE rencana_id = ?`, id); err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM rencana_bulanan WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

// AddItems inserts multiple materi_ajar refs into a rencana, skipping any
// that already exist for the same (rencana_id, materi_ajar_id).
func (s *RencanaStore) AddItems(ctx context.Context, rencanaID string, materiIDs []string) error {
	if len(materiIDs) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	exists, err := tx.PrepareContext(ctx,
		`SELECT 1 FROM rencana_bulanan_item WHERE rencana_id = ? AND materi_ajar_id = ?`)
	if err != nil {
		return err
	}
	defer exists.Close()
	ins, err := tx.PrepareContext(ctx,
		`INSERT INTO rencana_bulanan_item (id, rencana_id, materi_ajar_id, urutan) VALUES (?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer ins.Close()
	var maxU int
	_ = tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(urutan), 0) FROM rencana_bulanan_item WHERE rencana_id = ?`, rencanaID).Scan(&maxU)
	for _, mid := range materiIDs {
		var flag int
		if err := exists.QueryRowContext(ctx, rencanaID, mid).Scan(&flag); err == nil {
			continue // already present
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		maxU++
		if _, err := ins.ExecContext(ctx, ulid.Make().String(), rencanaID, mid, maxU); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AddLibraryItem appends one library-sourced row (quran/hadits/tilawati/
// doa) to a rencana. Returns sql.ErrNoRows-equivalent ErrNotFound if the
// rencana doesn't exist.
func (s *RencanaStore) AddLibraryItem(ctx context.Context, rencanaID, kind, aspect, ref string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var maxU int
	_ = tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(urutan), 0) FROM rencana_bulanan_item WHERE rencana_id = ?`, rencanaID).Scan(&maxU)
	id := ulid.Make().String()
	var aspectPtr, refPtr any
	if strings.TrimSpace(aspect) != "" {
		aspectPtr = aspect
	}
	if strings.TrimSpace(ref) != "" {
		refPtr = ref
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO rencana_bulanan_item
		   (id, rencana_id, library_kind, library_aspect, library_ref, urutan)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		id, rencanaID, kind, aspectPtr, refPtr, maxU+1,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *RencanaStore) ToggleSelesai(ctx context.Context, itemID string, selesai bool) error {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var tanggalSelesai any
	if selesai {
		tanggalSelesai = now
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE rencana_bulanan_item SET selesai = ?, tanggal_selesai = ?, updated_at = ? WHERE id = ?`,
		boolToInt(selesai), tanggalSelesai, now, itemID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *RencanaStore) RemoveItem(ctx context.Context, itemID string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM rencana_bulanan_item WHERE id = ?`, itemID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

const itemSelectCols = `i.id, i.rencana_id, i.materi_ajar_id,
	i.library_kind, i.library_aspect, i.library_ref,
	i.urutan, i.selesai,
	i.tanggal_selesai, i.catatan, i.created_at, i.updated_at,
	a.id, a."kodeMateri", a."refRaportId", a.tingkat, a.tema, a."subTema",
	a."kelompokMateri", a."detailMateri", a.semester, a.kategori,
	a."refSourceTingkat", a."refSourceKode", a."perluReviewOrtu", a.progresif, a."libraryRelation"`

func (s *RencanaStore) listItems(ctx context.Context, rencanaID string) ([]RencanaItem, error) {
	q := `SELECT ` + itemSelectCols + ` FROM rencana_bulanan_item i
	      LEFT JOIN materi_ajar a ON a.id = i.materi_ajar_id
	      WHERE i.rencana_id = ?
	      ORDER BY i.urutan ASC, i.created_at ASC`
	rows, err := s.db.QueryContext(ctx, q, rencanaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RencanaItem{}
	for rows.Next() {
		var it RencanaItem
		var selesaiInt int
		var ajar MateriAjar
		var perluReview, progresif int
		var ajarID, ajarKode, ajarTingkat, ajarTema, ajarSubTema, ajarDetail, ajarKategori sql.NullString
		var ajarSemester sql.NullInt64
		var ajarRefRaport, ajarKelompok, ajarRefSrcTingkat, ajarRefSrcKode, ajarLibRel sql.NullString
		var perluReviewN, progresifN sql.NullInt64
		if err := rows.Scan(
			&it.ID, &it.RencanaID, &it.MateriAjarID,
			&it.LibraryKind, &it.LibraryAspect, &it.LibraryRef,
			&it.Urutan, &selesaiInt,
			&it.TanggalSelesai, &it.Catatan, &it.CreatedAt, &it.UpdatedAt,
			&ajarID, &ajarKode, &ajarRefRaport, &ajarTingkat, &ajarTema, &ajarSubTema,
			&ajarKelompok, &ajarDetail, &ajarSemester, &ajarKategori,
			&ajarRefSrcTingkat, &ajarRefSrcKode, &perluReviewN, &progresifN, &ajarLibRel,
		); err != nil {
			return nil, err
		}
		it.Selesai = selesaiInt == 1
		if ajarID.Valid {
			ajar.ID = ajarID.String
			ajar.KodeMateri = ajarKode.String
			if ajarRefRaport.Valid {
				v := ajarRefRaport.String
				ajar.RefRaportID = &v
			}
			ajar.Tingkat = ajarTingkat.String
			ajar.Tema = ajarTema.String
			ajar.SubTema = ajarSubTema.String
			if ajarKelompok.Valid {
				v := ajarKelompok.String
				ajar.KelompokMateri = &v
			}
			ajar.DetailMateri = ajarDetail.String
			ajar.Semester = int(ajarSemester.Int64)
			ajar.Kategori = ajarKategori.String
			if ajarRefSrcTingkat.Valid {
				v := ajarRefSrcTingkat.String
				ajar.RefSourceTingkat = &v
			}
			if ajarRefSrcKode.Valid {
				v := ajarRefSrcKode.String
				ajar.RefSourceKode = &v
			}
			perluReview = int(perluReviewN.Int64)
			progresif = int(progresifN.Int64)
			ajar.PerluReviewOrtu = perluReview == 1
			ajar.Progresif = progresif == 1
			if ajarLibRel.Valid {
				v := ajarLibRel.String
				ajar.LibraryRelation = &v
			}
			it.Ajar = &ajar
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func scanRencana(s scanner) (*Rencana, error) {
	var r Rencana
	if err := s.Scan(
		&r.ID, &r.KelasID, &r.Tahun, &r.Bulan, &r.Semester, &r.Catatan,
		&r.CreatedBy, &r.CreatedAt, &r.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &r, nil
}
