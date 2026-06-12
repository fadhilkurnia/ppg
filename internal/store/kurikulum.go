package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/oklog/ulid/v2"
)

type Kurikulum struct {
	db *sql.DB
}

func NewKurikulum(db *sql.DB) *Kurikulum {
	return &Kurikulum{db: db}
}

type Tingkat struct {
	ID     string `json:"id"`
	Nama   string `json:"nama"`
	Urutan int    `json:"urutan"`
	Umur   *int   `json:"umur,omitempty"`
}

type MateriAjar struct {
	ID               string  `json:"id"`
	KodeMateri       string  `json:"kodeMateri"`
	RefRaportID      *string `json:"refRaportId,omitempty"`
	Tingkat          string  `json:"tingkat"`
	Tema             string  `json:"tema"`
	SubTema          string  `json:"subTema"`
	KelompokMateri   *string `json:"kelompokMateri,omitempty"`
	DetailMateri     string  `json:"detailMateri"`
	Semester         int     `json:"semester"`
	Kategori         string  `json:"kategori"`
	RefSourceTingkat *string `json:"refSourceTingkat,omitempty"`
	RefSourceKode    *string `json:"refSourceKode,omitempty"`
	PerluReviewOrtu  bool    `json:"perluReviewOrtu"`
	Progresif        bool    `json:"progresif"`
	LibraryRelation  *string `json:"libraryRelation,omitempty"`
}

type MateriAjarListParams struct {
	Tingkat  string
	Tema     string
	Semester int
	Query    string
}

// TingkatInput is the writable subset for create/update.
type TingkatInput struct {
	Nama   string
	Urutan int
	Umur   *int
}

// MateriAjarInput is the writable subset for create/update.
type MateriAjarInput struct {
	KodeMateri       string
	RefRaportID      *string
	Tingkat          string
	Tema             string
	SubTema          string
	KelompokMateri   *string
	DetailMateri     string
	Semester         int
	Kategori         string
	RefSourceTingkat *string
	RefSourceKode    *string
	PerluReviewOrtu  bool
	Progresif        bool
	LibraryRelation  *string
}

func (k *Kurikulum) ListTingkat(ctx context.Context) ([]Tingkat, error) {
	rows, err := k.db.QueryContext(ctx, `SELECT id, nama, urutan, umur FROM tingkat ORDER BY urutan ASC, nama ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Tingkat{}
	for rows.Next() {
		var t Tingkat
		if err := rows.Scan(&t.ID, &t.Nama, &t.Urutan, &t.Umur); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

const materiAjarCols = `id, "kodeMateri", "refRaportId", tingkat, tema, "subTema",
	"kelompokMateri", "detailMateri", semester, kategori,
	"refSourceTingkat", "refSourceKode", "perluReviewOrtu", progresif, "libraryRelation"`

func (k *Kurikulum) ListMateriAjar(ctx context.Context, p MateriAjarListParams) ([]MateriAjar, error) {
	clauses := []string{"1=1"}
	var args []any
	if p.Tingkat != "" {
		clauses = append(clauses, "tingkat = ?")
		args = append(args, p.Tingkat)
	}
	if p.Tema != "" {
		clauses = append(clauses, "tema = ?")
		args = append(args, p.Tema)
	}
	if p.Semester != 0 {
		clauses = append(clauses, "semester = ?")
		args = append(args, p.Semester)
	}
	if q := strings.TrimSpace(p.Query); q != "" {
		clauses = append(clauses, `(tema LIKE ? OR "subTema" LIKE ? OR "kelompokMateri" LIKE ? OR "detailMateri" LIKE ?)`)
		like := "%" + q + "%"
		args = append(args, like, like, like, like)
	}
	where := " WHERE " + strings.Join(clauses, " AND ")

	rows, err := k.db.QueryContext(ctx,
		`SELECT `+materiAjarCols+` FROM materi_ajar`+where+
			` ORDER BY tingkat ASC, tema ASC, "subTema" ASC, semester ASC`,
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []MateriAjar{}
	for rows.Next() {
		m, err := scanMateriAjar(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

func (k *Kurikulum) GetMateriAjar(ctx context.Context, id string) (*MateriAjar, error) {
	row := k.db.QueryRowContext(ctx,
		`SELECT `+materiAjarCols+` FROM materi_ajar WHERE id = ?`, id)
	m, err := scanMateriAjar(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return m, nil
}

func (k *Kurikulum) CreateMateriAjar(ctx context.Context, in MateriAjarInput) (*MateriAjar, error) {
	if in.Kategori == "" {
		in.Kategori = "baru"
	}
	id := ulid.Make().String()
	_, err := k.db.ExecContext(ctx,
		`INSERT INTO materi_ajar (
		   id, "kodeMateri", "refRaportId", tingkat, tema, "subTema",
		   "kelompokMateri", "detailMateri", semester, kategori,
		   "refSourceTingkat", "refSourceKode", "perluReviewOrtu", progresif, "libraryRelation"
		 ) VALUES (?, ?, ?, ?, ?, ?,
		           ?, ?, ?, ?,
		           ?, ?, ?, ?, ?)`,
		id, in.KodeMateri, in.RefRaportID, in.Tingkat, in.Tema, in.SubTema,
		in.KelompokMateri, in.DetailMateri, in.Semester, in.Kategori,
		in.RefSourceTingkat, in.RefSourceKode, boolToInt(in.PerluReviewOrtu), boolToInt(in.Progresif), in.LibraryRelation,
	)
	if err != nil {
		return nil, err
	}
	return k.GetMateriAjar(ctx, id)
}

func (k *Kurikulum) UpdateMateriAjar(ctx context.Context, id string, in MateriAjarInput) (*MateriAjar, error) {
	if in.Kategori == "" {
		in.Kategori = "baru"
	}
	res, err := k.db.ExecContext(ctx,
		`UPDATE materi_ajar SET
		   "kodeMateri" = ?, "refRaportId" = ?, tingkat = ?, tema = ?, "subTema" = ?,
		   "kelompokMateri" = ?, "detailMateri" = ?, semester = ?, kategori = ?,
		   "refSourceTingkat" = ?, "refSourceKode" = ?, "perluReviewOrtu" = ?, progresif = ?, "libraryRelation" = ?
		 WHERE id = ?`,
		in.KodeMateri, in.RefRaportID, in.Tingkat, in.Tema, in.SubTema,
		in.KelompokMateri, in.DetailMateri, in.Semester, in.Kategori,
		in.RefSourceTingkat, in.RefSourceKode, boolToInt(in.PerluReviewOrtu), boolToInt(in.Progresif), in.LibraryRelation,
		id,
	)
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrNotFound
	}
	return k.GetMateriAjar(ctx, id)
}

// DeleteByTema removes every materi_ajar row whose `tema` matches. Returns
// the row count removed.
func (k *Kurikulum) DeleteByTema(ctx context.Context, tema string) (int, error) {
	res, err := k.db.ExecContext(ctx, `DELETE FROM materi_ajar WHERE tema = ?`, tema)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// DeleteBySubTema removes every materi_ajar row whose (tema, subTema) match.
func (k *Kurikulum) DeleteBySubTema(ctx context.Context, tema, subTema string) (int, error) {
	res, err := k.db.ExecContext(ctx,
		`DELETE FROM materi_ajar WHERE tema = ? AND "subTema" = ?`, tema, subTema)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

func (k *Kurikulum) DeleteMateriAjar(ctx context.Context, id string) error {
	res, err := k.db.ExecContext(ctx, `DELETE FROM materi_ajar WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (k *Kurikulum) GetTingkat(ctx context.Context, id string) (*Tingkat, error) {
	var t Tingkat
	err := k.db.QueryRowContext(ctx,
		`SELECT id, nama, urutan, umur FROM tingkat WHERE id = ?`, id).
		Scan(&t.ID, &t.Nama, &t.Urutan, &t.Umur)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

func (k *Kurikulum) CreateTingkat(ctx context.Context, in TingkatInput) (*Tingkat, error) {
	id := ulid.Make().String()
	if _, err := k.db.ExecContext(ctx,
		`INSERT INTO tingkat (id, nama, urutan, umur) VALUES (?, ?, ?, ?)`,
		id, in.Nama, in.Urutan, in.Umur,
	); err != nil {
		return nil, err
	}
	return k.GetTingkat(ctx, id)
}

func (k *Kurikulum) UpdateTingkat(ctx context.Context, id string, in TingkatInput) (*Tingkat, error) {
	res, err := k.db.ExecContext(ctx,
		`UPDATE tingkat SET nama = ?, urutan = ?, umur = ? WHERE id = ?`,
		in.Nama, in.Urutan, in.Umur, id,
	)
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrNotFound
	}
	return k.GetTingkat(ctx, id)
}

// DeleteTingkat fails if any materi_ajar still references this tingkat by nama,
// to avoid orphaning the curriculum content.
func (k *Kurikulum) DeleteTingkat(ctx context.Context, id string) error {
	t, err := k.GetTingkat(ctx, id)
	if err != nil {
		return err
	}
	var refCount int
	if err := k.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM materi_ajar WHERE tingkat = ?`, t.Nama).Scan(&refCount); err != nil {
		return err
	}
	if refCount > 0 {
		return ErrTingkatInUse
	}
	res, err := k.db.ExecContext(ctx, `DELETE FROM tingkat WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ErrTingkatInUse signals an attempt to delete a tingkat that still has
// materi_ajar rows referencing it.
var ErrTingkatInUse = errors.New("tingkat still referenced by materi_ajar")

func scanMateriAjar(s scanner) (*MateriAjar, error) {
	var m MateriAjar
	var perluReview, progresif int
	if err := s.Scan(
		&m.ID, &m.KodeMateri, &m.RefRaportID, &m.Tingkat, &m.Tema, &m.SubTema,
		&m.KelompokMateri, &m.DetailMateri, &m.Semester, &m.Kategori,
		&m.RefSourceTingkat, &m.RefSourceKode, &perluReview, &progresif, &m.LibraryRelation,
	); err != nil {
		return nil, err
	}
	m.PerluReviewOrtu = perluReview == 1
	m.Progresif = progresif == 1
	return &m, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// =============================================================== Relations

// MateriLibraryRef ties one materi_ajar to one library item (quran ayat,
// hadits, tilawati page, or doa). A materi can have many refs.
type MateriLibraryRef struct {
	ID            string  `json:"id"`
	MateriAjarID  string  `json:"materiAjarId"`
	LibraryKind   string  `json:"libraryKind"`
	LibraryAspect *string `json:"libraryAspect,omitempty"`
	LibraryRef    string  `json:"libraryRef"`
	CreatedAt     string  `json:"createdAt"`
}

func (k *Kurikulum) ListLibraryRefs(ctx context.Context, materiAjarID string) ([]MateriLibraryRef, error) {
	rows, err := k.db.QueryContext(ctx,
		`SELECT id, materi_ajar_id, library_kind, library_aspect, library_ref, created_at
		 FROM materi_library_ref WHERE materi_ajar_id = ? ORDER BY created_at ASC`,
		materiAjarID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MateriLibraryRef{}
	for rows.Next() {
		var r MateriLibraryRef
		if err := rows.Scan(&r.ID, &r.MateriAjarID, &r.LibraryKind, &r.LibraryAspect, &r.LibraryRef, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (k *Kurikulum) AddLibraryRef(ctx context.Context, materiAjarID, kind, ref string, aspect *string) (*MateriLibraryRef, error) {
	id := ulid.Make().String()
	_, err := k.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO materi_library_ref
		   (id, materi_ajar_id, library_kind, library_aspect, library_ref)
		 VALUES (?, ?, ?, ?, ?)`,
		id, materiAjarID, kind, aspect, ref)
	if err != nil {
		return nil, err
	}
	// fetch the row (may be the existing one if ignored).
	row := k.db.QueryRowContext(ctx,
		`SELECT id, materi_ajar_id, library_kind, library_aspect, library_ref, created_at
		 FROM materi_library_ref
		 WHERE materi_ajar_id = ? AND library_kind = ? AND library_aspect IS ? AND library_ref = ?`,
		materiAjarID, kind, aspect, ref)
	var r MateriLibraryRef
	if err := row.Scan(&r.ID, &r.MateriAjarID, &r.LibraryKind, &r.LibraryAspect, &r.LibraryRef, &r.CreatedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

func (k *Kurikulum) DeleteLibraryRef(ctx context.Context, id string) error {
	res, err := k.db.ExecContext(ctx, `DELETE FROM materi_library_ref WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// MateriRelation pairs two materi_ajar ids that represent the same content
// at different umur levels.
type MateriRelation struct {
	MateriAID  string `json:"materiAId"`
	MateriBID  string `json:"materiBId"`
	CreatedAt  string `json:"createdAt"`
}

// ListRelations returns the OTHER id for every relation involving the
// given materi. The frontend hydrates the materi rows.
func (k *Kurikulum) ListRelations(ctx context.Context, materiAjarID string) ([]string, error) {
	rows, err := k.db.QueryContext(ctx,
		`SELECT CASE WHEN materi_a_id = ? THEN materi_b_id ELSE materi_a_id END
		 FROM materi_relation WHERE materi_a_id = ? OR materi_b_id = ?
		 ORDER BY created_at ASC`,
		materiAjarID, materiAjarID, materiAjarID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (k *Kurikulum) AddRelation(ctx context.Context, aID, bID string) error {
	if aID == bID {
		return errors.New("cannot relate materi to itself")
	}
	a, b := aID, bID
	if a > b {
		a, b = b, a
	}
	_, err := k.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO materi_relation (materi_a_id, materi_b_id) VALUES (?, ?)`,
		a, b)
	return err
}

func (k *Kurikulum) DeleteRelation(ctx context.Context, aID, bID string) error {
	a, b := aID, bID
	if a > b {
		a, b = b, a
	}
	res, err := k.db.ExecContext(ctx,
		`DELETE FROM materi_relation WHERE materi_a_id = ? AND materi_b_id = ?`, a, b)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
