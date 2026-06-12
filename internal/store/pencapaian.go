package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

type PencapaianStatus string

const (
	PencapaianBelum  PencapaianStatus = "belum"
	PencapaianProses PencapaianStatus = "proses"
	PencapaianTuntas PencapaianStatus = "tuntas"
)

// Pencapaian — one murid's mastery record for one item, either a kurikulum
// materi_ajar or a library ref (Quran/Hadits/Tilawati/Doa). Exactly one of
// {MateriAjarID} or {LibraryKind+LibraryRef} is set per row.
type Pencapaian struct {
	ID            string  `json:"id"`
	MuridUserID   string  `json:"muridUserId"`
	MateriAjarID  *string `json:"materiAjarId,omitempty"`
	LibraryKind   *string `json:"libraryKind,omitempty"`
	LibraryAspect *string `json:"libraryAspect,omitempty"`
	LibraryRef    *string `json:"libraryRef,omitempty"`
	Status        string  `json:"status"`
	NilaiAngka    *int    `json:"nilaiAngka,omitempty"`
	NilaiHuruf    *string `json:"nilaiHuruf,omitempty"`
	Tanggal       *string `json:"tanggal,omitempty"`
	Catatan       *string `json:"catatan,omitempty"`
	RecordedBy    *string `json:"recordedBy,omitempty"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type PencapaianUpsertInput struct {
	MuridUserID   string
	MateriAjarID  *string
	LibraryKind   *string
	LibraryAspect *string
	LibraryRef    *string
	Status        string
	NilaiAngka    *int
	NilaiHuruf    *string
	Tanggal       *string
	Catatan       *string
}

type PencapaianStore struct{ db *sql.DB }

func NewPencapaian(db *sql.DB) *PencapaianStore { return &PencapaianStore{db: db} }

const pencapaianCols = `id, murid_user_id, materi_ajar_id, library_kind,
	library_aspect, library_ref, status, nilai_angka,
	nilai_huruf, tanggal, catatan, recorded_by, created_at, updated_at`

type PencapaianListParams struct {
	MuridUserID string
	FromUmur    *int // inclusive; matches against materi.tingkat.umur
	FromSem     *int // inclusive; semester within fromUmur
	ToUmur      *int // inclusive
	ToSem       *int // inclusive; semester within toUmur
}

// ListForMurid returns every materi_ajar in the given umur range PLUS the
// matching pencapaian row (if any) joined as a left-outer. Frontend uses
// this to render the hierarchical tree with per-item status. When umur
// filter is unset all materi for the murid's tingkat are returned.
type MateriWithPencapaian struct {
	Materi     MateriAjar
	Pencapaian *Pencapaian
	Umur       *int
}

func (s *PencapaianStore) ListForMurid(ctx context.Context, p PencapaianListParams) ([]MateriWithPencapaian, error) {
	where := []string{"1=1"}
	args := []any{p.MuridUserID}
	// Range bounds combine umur + semester so a range can start at "5 th
	// sem 2" and end at "7 th sem 1". The expression is
	//   (t.umur > fromUmur) OR (t.umur = fromUmur AND m.semester >= fromSem)
	// AND
	//   (t.umur < toUmur) OR (t.umur = toUmur AND m.semester <= toSem)
	if p.FromUmur != nil {
		fromSem := 1
		if p.FromSem != nil {
			fromSem = *p.FromSem
		}
		where = append(where, "(t.umur > ? OR (t.umur = ? AND m.semester >= ?))")
		args = append(args, *p.FromUmur, *p.FromUmur, fromSem)
	}
	if p.ToUmur != nil {
		toSem := 2
		if p.ToSem != nil {
			toSem = *p.ToSem
		}
		where = append(where, "(t.umur < ? OR (t.umur = ? AND m.semester <= ?))")
		args = append(args, *p.ToUmur, *p.ToUmur, toSem)
	}
	// Pencapaian join uses the same murid_user_id parameter so we can join
	// "for this murid only". The COALESCE in the SELECT lets the row remain
	// even when no pencapaian exists yet.
	q := `SELECT m.id, m."kodeMateri", m."refRaportId", m.tingkat, m.tema, m."subTema",
	             m."kelompokMateri", m."detailMateri", m.semester, m.kategori,
	             m."refSourceTingkat", m."refSourceKode", m."perluReviewOrtu",
	             m.progresif, m."libraryRelation",
	             t.umur,
	             p.id, p.murid_user_id, p.materi_ajar_id, p.status, p.nilai_angka,
	             p.nilai_huruf, p.tanggal, p.catatan, p.recorded_by,
	             p.created_at, p.updated_at
	      FROM materi_ajar m
	      LEFT JOIN tingkat t ON t.nama = m.tingkat
	      LEFT JOIN pencapaian p ON p.materi_ajar_id = m.id AND p.murid_user_id = ?
	      WHERE ` + strings.Join(where, " AND ") + `
	      ORDER BY COALESCE(t.urutan, 999) ASC, m.tingkat ASC, m.tema ASC, m."subTema" ASC,
	               m."kelompokMateri" ASC, m.semester ASC, m."kodeMateri" ASC`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MateriWithPencapaian{}
	for rows.Next() {
		var item MateriWithPencapaian
		var m MateriAjar
		var refRaport, kelompok, refSrcT, refSrcK, libRel sql.NullString
		var perluReview, progresif int
		var p Pencapaian
		var pID, pMurid, pMateri sql.NullString
		var pStatus, pNilaiHuruf, pTanggal, pCatatan, pBy sql.NullString
		var pNilaiAngka sql.NullInt64
		var pCreatedAt, pUpdatedAt sql.NullString
		if err := rows.Scan(
			&m.ID, &m.KodeMateri, &refRaport, &m.Tingkat, &m.Tema, &m.SubTema,
			&kelompok, &m.DetailMateri, &m.Semester, &m.Kategori,
			&refSrcT, &refSrcK, &perluReview, &progresif, &libRel,
			&item.Umur,
			&pID, &pMurid, &pMateri, &pStatus, &pNilaiAngka,
			&pNilaiHuruf, &pTanggal, &pCatatan, &pBy,
			&pCreatedAt, &pUpdatedAt,
		); err != nil {
			return nil, err
		}
		if refRaport.Valid {
			v := refRaport.String
			m.RefRaportID = &v
		}
		if kelompok.Valid {
			v := kelompok.String
			m.KelompokMateri = &v
		}
		if refSrcT.Valid {
			v := refSrcT.String
			m.RefSourceTingkat = &v
		}
		if refSrcK.Valid {
			v := refSrcK.String
			m.RefSourceKode = &v
		}
		if libRel.Valid {
			v := libRel.String
			m.LibraryRelation = &v
		}
		m.PerluReviewOrtu = perluReview == 1
		m.Progresif = progresif == 1
		item.Materi = m
		if pID.Valid {
			p.ID = pID.String
			p.MuridUserID = pMurid.String
			if pMateri.Valid {
				v := pMateri.String
				p.MateriAjarID = &v
			}
			p.Status = pStatus.String
			if pNilaiAngka.Valid {
				v := int(pNilaiAngka.Int64)
				p.NilaiAngka = &v
			}
			if pNilaiHuruf.Valid {
				v := pNilaiHuruf.String
				p.NilaiHuruf = &v
			}
			if pTanggal.Valid {
				v := pTanggal.String
				p.Tanggal = &v
			}
			if pCatatan.Valid {
				v := pCatatan.String
				p.Catatan = &v
			}
			if pBy.Valid {
				v := pBy.String
				p.RecordedBy = &v
			}
			p.CreatedAt = pCreatedAt.String
			p.UpdatedAt = pUpdatedAt.String
			item.Pencapaian = &p
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// Upsert creates or updates a pencapaian row. Keyed on (murid, materi_ajar_id)
// for kurikulum entries, or (murid, library_kind, library_aspect, library_ref)
// for library entries. Exactly one of the two key sets must be filled.
func (s *PencapaianStore) Upsert(ctx context.Context, in PencapaianUpsertInput, recordedBy string) (*Pencapaian, error) {
	if in.Status != string(PencapaianBelum) && in.Status != string(PencapaianProses) && in.Status != string(PencapaianTuntas) {
		in.Status = string(PencapaianBelum)
	}
	isKurikulum := in.MateriAjarID != nil && *in.MateriAjarID != ""
	isLibrary := in.LibraryKind != nil && *in.LibraryKind != "" &&
		in.LibraryRef != nil && *in.LibraryRef != ""
	if isKurikulum == isLibrary {
		return nil, errors.New("pencapaian needs exactly one of materi_ajar_id or library_kind+library_ref")
	}

	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var byPtr *string
	if strings.TrimSpace(recordedBy) != "" {
		byPtr = &recordedBy
	}

	if isKurikulum {
		res, err := s.db.ExecContext(ctx,
			`UPDATE pencapaian
			    SET status = ?, nilai_angka = ?, nilai_huruf = ?, tanggal = ?, catatan = ?,
			        recorded_by = COALESCE(?, recorded_by), updated_at = ?
			  WHERE murid_user_id = ? AND materi_ajar_id = ?`,
			in.Status, in.NilaiAngka, in.NilaiHuruf, in.Tanggal, in.Catatan,
			byPtr, now, in.MuridUserID, *in.MateriAjarID,
		)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			id := ulid.Make().String()
			if _, err := s.db.ExecContext(ctx,
				`INSERT INTO pencapaian
				   (id, murid_user_id, materi_ajar_id, status, nilai_angka, nilai_huruf,
				    tanggal, catatan, recorded_by, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				id, in.MuridUserID, *in.MateriAjarID, in.Status,
				in.NilaiAngka, in.NilaiHuruf, in.Tanggal, in.Catatan,
				byPtr, now, now,
			); err != nil {
				return nil, err
			}
		}
		return s.findKurikulum(ctx, in.MuridUserID, *in.MateriAjarID)
	}

	// Library entry — aspect is part of the key.
	aspect := ""
	if in.LibraryAspect != nil {
		aspect = *in.LibraryAspect
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE pencapaian
		    SET status = ?, nilai_angka = ?, nilai_huruf = ?, tanggal = ?, catatan = ?,
		        recorded_by = COALESCE(?, recorded_by), updated_at = ?
		  WHERE murid_user_id = ? AND library_kind = ?
		    AND COALESCE(library_aspect, '') = ? AND library_ref = ?`,
		in.Status, in.NilaiAngka, in.NilaiHuruf, in.Tanggal, in.Catatan,
		byPtr, now, in.MuridUserID, *in.LibraryKind, aspect, *in.LibraryRef,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		id := ulid.Make().String()
		var aspectPtr *string
		if aspect != "" {
			aspectPtr = &aspect
		}
		if _, err := s.db.ExecContext(ctx,
			`INSERT INTO pencapaian
			   (id, murid_user_id, library_kind, library_aspect, library_ref,
			    status, nilai_angka, nilai_huruf, tanggal, catatan, recorded_by,
			    created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, in.MuridUserID, *in.LibraryKind, aspectPtr, *in.LibraryRef,
			in.Status, in.NilaiAngka, in.NilaiHuruf, in.Tanggal, in.Catatan,
			byPtr, now, now,
		); err != nil {
			return nil, err
		}
	}
	return s.findLibrary(ctx, in.MuridUserID, *in.LibraryKind, aspect, *in.LibraryRef)
}

func (s *PencapaianStore) findKurikulum(ctx context.Context, muridUserID, materiID string) (*Pencapaian, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+pencapaianCols+` FROM pencapaian
		 WHERE murid_user_id = ? AND materi_ajar_id = ?`,
		muridUserID, materiID,
	)
	return scanPencapaian(row)
}

func (s *PencapaianStore) findLibrary(ctx context.Context, muridUserID, kind, aspect, ref string) (*Pencapaian, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT `+pencapaianCols+` FROM pencapaian
		 WHERE murid_user_id = ? AND library_kind = ?
		   AND COALESCE(library_aspect, '') = ? AND library_ref = ?`,
		muridUserID, kind, aspect, ref,
	)
	return scanPencapaian(row)
}

func scanPencapaian(row *sql.Row) (*Pencapaian, error) {
	var p Pencapaian
	if err := row.Scan(&p.ID, &p.MuridUserID, &p.MateriAjarID, &p.LibraryKind,
		&p.LibraryAspect, &p.LibraryRef, &p.Status,
		&p.NilaiAngka, &p.NilaiHuruf, &p.Tanggal, &p.Catatan, &p.RecordedBy,
		&p.CreatedAt, &p.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// ListLibraryForMurid returns every library pencapaian row for one murid,
// ordered by library_kind then library_ref so the frontend can group them.
func (s *PencapaianStore) ListLibraryForMurid(ctx context.Context, muridUserID string) ([]Pencapaian, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+pencapaianCols+` FROM pencapaian
		  WHERE murid_user_id = ? AND library_kind IS NOT NULL
		  ORDER BY library_kind ASC, library_ref ASC`, muridUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Pencapaian{}
	for rows.Next() {
		var p Pencapaian
		if err := rows.Scan(&p.ID, &p.MuridUserID, &p.MateriAjarID, &p.LibraryKind,
			&p.LibraryAspect, &p.LibraryRef, &p.Status,
			&p.NilaiAngka, &p.NilaiHuruf, &p.Tanggal, &p.Catatan, &p.RecordedBy,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *PencapaianStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM pencapaian WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
