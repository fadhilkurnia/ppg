package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// MateriDiajarkan is one materi that was actually projected/taught during a
// live sesi. Recorded each time the guru picks a materi in the Live Stage
// (append, not replace) so the end-sesi summary can list everything taught.
type MateriDiajarkan struct {
	ID                string  `json:"id"`
	SesiID            string  `json:"sesiId"`
	Kind              string  `json:"kind"`
	MateriAjarID      *string `json:"materiAjarId,omitempty"`
	Ref               *string `json:"ref,omitempty"`
	Label             *string `json:"label,omitempty"`
	// LibraryAspect is the planned activity type (reciting/memorizing/review/
	// manqul) for library-sourced materi, resolved on Create from what was
	// planned. Nil for kurikulum and ad-hoc picks not in any plan.
	LibraryAspect     *string `json:"libraryAspect,omitempty"`
	NeedsParentReview bool    `json:"needsParentReview"`
	ParentNote        *string `json:"parentNote,omitempty"`
	Completed         bool    `json:"completed"`
	CompletedAt       *string `json:"completedAt,omitempty"`
	TaughtAt          string  `json:"taughtAt"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

type MateriDiajarkanInput struct {
	Kind          string
	MateriAjarID  *string
	Ref           *string
	Label         *string
	LibraryAspect *string
}

type DiajarkanStore struct {
	db *sql.DB
}

func NewDiajarkan(db *sql.DB) *DiajarkanStore { return &DiajarkanStore{db: db} }

const diajarkanCols = `id, sesi_id, kind, materi_ajar_id, ref, label, library_aspect,
	needs_parent_review, parent_note, completed, completed_at,
	taught_at, created_at, updated_at`

func (s *DiajarkanStore) ListBySesi(ctx context.Context, sesiID string) ([]MateriDiajarkan, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+diajarkanCols+` FROM sesi_materi_diajarkan
		 WHERE sesi_id = ? ORDER BY taught_at ASC, created_at ASC`, sesiID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MateriDiajarkan{}
	for rows.Next() {
		v, err := scanDiajarkan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

func (s *DiajarkanStore) Create(ctx context.Context, sesiID string, in MateriDiajarkanInput) (*MateriDiajarkan, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	// Stamp the planned activity type. Honour an explicit aspect from the
	// caller (e.g. picking a planned item whose aspect the UI already knows),
	// otherwise resolve it from what was planned for this sesi/kelas.
	aspect := in.LibraryAspect
	if aspect == nil && in.Ref != nil {
		aspect = s.resolvePlannedAspect(ctx, sesiID, in.Kind, *in.Ref)
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sesi_materi_diajarkan
		   (id, sesi_id, kind, materi_ajar_id, ref, label, library_aspect,
		    needs_parent_review, parent_note, completed, completed_at,
		    taught_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, NULL, ?, ?, ?)`,
		id, sesiID, in.Kind, in.MateriAjarID, in.Ref, in.Label, aspect, now, now, now,
	)
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

// resolvePlannedAspect finds the library_aspect this (kind, ref) was planned
// with — first from what's attached to the sesi itself (sesi_library, then the
// legacy single sesi.library_* columns), then from the kelas's monthly
// rencana_bulanan for the sesi's month. Quran refs match on the surah even when
// the ayat range differs (plan "16:1-10" vs taught "16"). Best-effort: any
// lookup error or miss yields nil, leaving the aspect unset.
func (s *DiajarkanStore) resolvePlannedAspect(ctx context.Context, sesiID, kind, ref string) *string {
	kind = strings.TrimSpace(kind)
	ref = strings.TrimSpace(ref)
	if ref == "" || kind == "" || kind == "kurikulum" {
		return nil
	}

	// refClause builds a ref-match predicate for the given column. For quran we
	// also match by surah number so ayat granularity doesn't break the lookup.
	refClause := func(col string) (string, []any) {
		if kind == "quran" {
			surah := ref
			if i := strings.IndexByte(ref, ':'); i >= 0 {
				surah = ref[:i]
			}
			return "(" + col + " = ? OR " + col + " = ? OR " + col + " LIKE ?)",
				[]any{ref, surah, surah + ":%"}
		}
		return col + " = ?", []any{ref}
	}

	scanOne := func(query string, args ...any) *string {
		var asp sql.NullString
		if err := s.db.QueryRowContext(ctx, query, args...).Scan(&asp); err == nil && asp.Valid && asp.String != "" {
			v := asp.String
			return &v
		}
		return nil
	}

	// 1) Library items attached to this sesi.
	clause, cargs := refClause("library_ref")
	if a := scanOne(
		`SELECT library_aspect FROM sesi_library
		 WHERE sesi_id = ? AND library_kind = ? AND library_aspect IS NOT NULL AND `+clause+`
		 ORDER BY position ASC LIMIT 1`,
		append([]any{sesiID, kind}, cargs...)...); a != nil {
		return a
	}
	// 2) Legacy single library_* columns on the sesi row.
	clause, cargs = refClause("library_ref")
	if a := scanOne(
		`SELECT library_aspect FROM sesi
		 WHERE id = ? AND library_kind = ? AND library_aspect IS NOT NULL AND `+clause+` LIMIT 1`,
		append([]any{sesiID, kind}, cargs...)...); a != nil {
		return a
	}
	// 3) The kelas's monthly rencana_bulanan for the sesi's month.
	clause, cargs = refClause("i.library_ref")
	if a := scanOne(
		`SELECT i.library_aspect
		 FROM rencana_bulanan_item i
		 JOIN rencana_bulanan r ON r.id = i.rencana_id
		 JOIN sesi s ON s.kelas_id = r.kelas_id
		 WHERE s.id = ?
		   AND r.tahun = CAST(strftime('%Y', s.tanggal) AS INTEGER)
		   AND r.bulan = CAST(strftime('%m', s.tanggal) AS INTEGER)
		   AND i.library_kind = ? AND i.library_aspect IS NOT NULL AND `+clause+`
		 ORDER BY i.urutan ASC LIMIT 1`,
		append([]any{sesiID, kind}, cargs...)...); a != nil {
		return a
	}
	return nil
}

func (s *DiajarkanStore) Get(ctx context.Context, id string) (*MateriDiajarkan, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+diajarkanCols+` FROM sesi_materi_diajarkan WHERE id = ?`, id)
	v, err := scanDiajarkan(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return v, nil
}

// Update applies sparse changes (only non-nil fields). Used by the end-sesi
// summary dialog to toggle needs_parent_review and edit parent_note per row,
// and by the Live Stage to mark a materi completed before switching.
type MateriDiajarkanUpdate struct {
	NeedsParentReview *bool
	ParentNote        *string
	Completed         *bool
}

func (s *DiajarkanStore) Update(ctx context.Context, id string, in MateriDiajarkanUpdate) (*MateriDiajarkan, error) {
	sets := []string{}
	args := []any{}
	if in.NeedsParentReview != nil {
		sets = append(sets, "needs_parent_review = ?")
		v := 0
		if *in.NeedsParentReview {
			v = 1
		}
		args = append(args, v)
	}
	if in.ParentNote != nil {
		sets = append(sets, "parent_note = ?")
		if *in.ParentNote == "" {
			args = append(args, nil)
		} else {
			args = append(args, *in.ParentNote)
		}
	}
	if in.Completed != nil {
		sets = append(sets, "completed = ?")
		v := 0
		if *in.Completed {
			v = 1
		}
		args = append(args, v)
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		sets = append(sets, "completed_at = ?")
		if *in.Completed {
			args = append(args, now)
		} else {
			args = append(args, nil)
		}
	}
	if len(sets) == 0 {
		return s.Get(ctx, id)
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	sets = append(sets, "updated_at = ?")
	args = append(args, now, id)
	res, err := s.db.ExecContext(ctx,
		`UPDATE sesi_materi_diajarkan SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

func (s *DiajarkanStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sesi_materi_diajarkan WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func scanDiajarkan(s scanner) (*MateriDiajarkan, error) {
	var v MateriDiajarkan
	var review, completed int
	if err := s.Scan(
		&v.ID, &v.SesiID, &v.Kind, &v.MateriAjarID, &v.Ref, &v.Label, &v.LibraryAspect,
		&review, &v.ParentNote, &completed, &v.CompletedAt,
		&v.TaughtAt, &v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, err
	}
	v.NeedsParentReview = review != 0
	v.Completed = completed != 0
	return &v, nil
}
