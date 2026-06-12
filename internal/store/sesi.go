package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// Sesi is one scheduled (or live) class session — the teaching-plan unit
// rendered on the kehadiran calendar.
type Sesi struct {
	ID            string   `json:"id"`
	Tanggal       string   `json:"tanggal"`
	Mulai         *string  `json:"mulai,omitempty"`
	Selesai       *string  `json:"selesai,omitempty"`
	Topik         string   `json:"topik"`
	Catatan       *string  `json:"catatan,omitempty"`
	Tingkat       *string  `json:"tingkat,omitempty"`
	MateriAjarID  *string  `json:"materiAjarId,omitempty"`
	MateriAjarIDs []string `json:"materiAjarIds"`
	GuruID        *string  `json:"guruId,omitempty"`
	KelasID       *string  `json:"kelasId,omitempty"`
	LibraryKind   *string  `json:"libraryKind,omitempty"`
	LibraryAspect *string  `json:"libraryAspect,omitempty"`
	LibraryRef    *string  `json:"libraryRef,omitempty"`
	LibraryItems  []SesiLibraryItem `json:"libraryItems"`
	StartedAt     *string  `json:"startedAt,omitempty"`
	EndedAt       *string  `json:"endedAt,omitempty"`
	LiveMateriID    *string `json:"liveMateriId,omitempty"`
	LiveDisplayMode *string `json:"liveDisplayMode,omitempty"`
	CreatedBy     *string  `json:"createdBy,omitempty"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
	JadwalID      *string  `json:"jadwalId,omitempty"`
}

// SesiLibraryItem is one non-kurikulum reference attached to a sesi.
// `Kind` is one of quran/hadits/tilawati/doa. Aspect/Ref semantics match
// the single-shot Sesi.LibraryKind columns.
type SesiLibraryItem struct {
	ID            string  `json:"id"`
	Kind          string  `json:"libraryKind"`
	LibraryAspect *string `json:"libraryAspect,omitempty"`
	LibraryRef    string  `json:"libraryRef"`
}

type SesiInput struct {
	Tanggal       string
	Mulai         *string
	Selesai       *string
	Topik         string
	Catatan       *string
	Tingkat       *string
	MateriAjarID  *string
	MateriAjarIDs []string
	GuruID        *string
	KelasID       *string
	LibraryKind   *string
	LibraryAspect *string
	LibraryRef    *string
	LibraryItems  []SesiLibraryItem
	JadwalID      *string
}

type SesiListParams struct {
	From    string // inclusive YYYY-MM-DD
	To      string // inclusive YYYY-MM-DD
	Tingkat string
	GuruID  string
	KelasID string
}

type SesiStore struct {
	db      *sql.DB
	rencana *RencanaStore
}

func NewSesi(db *sql.DB) *SesiStore { return &SesiStore{db: db} }

// AttachRencana wires the rencana store so that creating or updating a
// sesi auto-includes any picked materi (kurikulum or library) into the
// monthly rencana_bulanan of the sesi's kelas. Best-effort — failures
// here don't fail the create/update.
func (s *SesiStore) AttachRencana(r *RencanaStore) { s.rencana = r }

const sesiCols = `id, tanggal, mulai, selesai, topik, catatan, tingkat,
	materi_ajar_id, guru_id, kelas_id, library_kind, library_aspect, library_ref,
	started_at, ended_at, live_materi_id, live_display_mode,
	created_by, created_at, updated_at, jadwal_id`

// loadMateriIDs fills MateriAjarIDs on every sesi in the slice. Uses a
// single IN() query to avoid N+1.
func (s *SesiStore) loadMateriIDs(ctx context.Context, list []Sesi) error {
	if len(list) == 0 {
		return nil
	}
	ph := strings.Repeat("?,", len(list))
	ph = ph[:len(ph)-1]
	args := make([]any, 0, len(list))
	idx := make(map[string]int, len(list))
	for i, v := range list {
		args = append(args, v.ID)
		idx[v.ID] = i
		list[i].MateriAjarIDs = []string{}
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT sesi_id, materi_ajar_id FROM sesi_materi WHERE sesi_id IN (`+ph+`)
		 ORDER BY created_at ASC`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var sid, mid string
		if err := rows.Scan(&sid, &mid); err != nil {
			return err
		}
		if i, ok := idx[sid]; ok {
			list[i].MateriAjarIDs = append(list[i].MateriAjarIDs, mid)
		}
	}
	return rows.Err()
}

// loadLibraryItems fills LibraryItems on every sesi in the slice.
func (s *SesiStore) loadLibraryItems(ctx context.Context, list []Sesi) error {
	if len(list) == 0 {
		return nil
	}
	ph := strings.Repeat("?,", len(list))
	ph = ph[:len(ph)-1]
	args := make([]any, 0, len(list))
	idx := make(map[string]int, len(list))
	for i, v := range list {
		args = append(args, v.ID)
		idx[v.ID] = i
		list[i].LibraryItems = []SesiLibraryItem{}
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, sesi_id, library_kind, library_aspect, library_ref
		 FROM sesi_library WHERE sesi_id IN (`+ph+`)
		 ORDER BY position ASC, created_at ASC`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var sid string
		var it SesiLibraryItem
		if err := rows.Scan(&it.ID, &sid, &it.Kind, &it.LibraryAspect, &it.LibraryRef); err != nil {
			return err
		}
		if i, ok := idx[sid]; ok {
			list[i].LibraryItems = append(list[i].LibraryItems, it)
		}
	}
	return rows.Err()
}

// writeLibraryJoin replaces sesi_library rows for one sesi atomically. Each
// item gets an explicit position (input order) for stable ordering on read.
func writeLibraryJoin(ctx context.Context, tx *sql.Tx, sesiID string, items []SesiLibraryItem) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM sesi_library WHERE sesi_id = ?`, sesiID); err != nil {
		return err
	}
	pos := 0
	for _, it := range items {
		kind := strings.TrimSpace(it.Kind)
		ref := strings.TrimSpace(it.LibraryRef)
		if kind == "" || ref == "" || kind == "kurikulum" {
			continue
		}
		id := ulid.Make().String()
		var aspect *string
		if it.LibraryAspect != nil {
			a := strings.TrimSpace(*it.LibraryAspect)
			if a != "" {
				aspect = &a
			}
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO sesi_library (id, sesi_id, library_kind, library_aspect, library_ref, position)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			id, sesiID, kind, aspect, ref, pos,
		); err != nil {
			return err
		}
		pos++
	}
	return nil
}

// writeMateriJoin replaces sesi_materi rows for one sesi atomically. The
// legacy primary materi_ajar_id is always included.
func writeMateriJoin(ctx context.Context, tx *sql.Tx, sesiID string, materiIDs []string, primary *string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM sesi_materi WHERE sesi_id = ?`, sesiID); err != nil {
		return err
	}
	seen := map[string]bool{}
	add := func(m string) error {
		m = strings.TrimSpace(m)
		if m == "" || seen[m] {
			return nil
		}
		seen[m] = true
		_, err := tx.ExecContext(ctx,
			`INSERT INTO sesi_materi (sesi_id, materi_ajar_id) VALUES (?, ?)`, sesiID, m)
		return err
	}
	if primary != nil {
		if err := add(*primary); err != nil {
			return err
		}
	}
	for _, m := range materiIDs {
		if err := add(m); err != nil {
			return err
		}
	}
	return nil
}

// syncSesiToRencana best-effort ensures any kurikulum or library item
// attached to the sesi is also recorded in the kelas's monthly rencana
// for the sesi's tanggal. Called after Create / Update.
func (s *SesiStore) syncSesiToRencana(ctx context.Context, sesi *Sesi) {
	if s.rencana == nil || sesi == nil {
		return
	}
	if sesi.KelasID == nil || *sesi.KelasID == "" {
		return
	}
	// Pull (year, month) from tanggal (YYYY-MM-DD).
	if len(sesi.Tanggal) < 7 {
		return
	}
	var year, month int
	if _, err := scanYearMonth(sesi.Tanggal, &year, &month); err != nil {
		return
	}
	createdBy := ""
	if sesi.CreatedBy != nil {
		createdBy = *sesi.CreatedBy
	}
	rb, err := s.rencana.GetOrCreate(ctx, *sesi.KelasID, year, month, createdBy)
	if err != nil || rb == nil {
		return
	}
	// Add kurikulum materi (legacy single column + new multi).
	ids := []string{}
	if sesi.MateriAjarID != nil && *sesi.MateriAjarID != "" {
		ids = append(ids, *sesi.MateriAjarID)
	}
	for _, m := range sesi.MateriAjarIDs {
		if m != "" {
			ids = append(ids, m)
		}
	}
	if len(ids) > 0 {
		_ = s.rencana.AddItems(ctx, rb.ID, ids)
	}
	// Add library refs — every entry in LibraryItems plus the legacy single
	// columns if still set (Get fills LibraryItems on read, so when only the
	// legacy columns are populated they show up as a one-element slice via
	// mergedLibraryItems when nothing else exists; otherwise iterate.
	seen := map[string]bool{}
	addLib := func(kind, aspect, ref string) {
		if kind == "" || kind == "kurikulum" || ref == "" {
			return
		}
		key := kind + "|" + aspect + "|" + ref
		if seen[key] {
			return
		}
		seen[key] = true
		_ = s.rencana.AddLibraryItem(ctx, rb.ID, kind, aspect, ref)
	}
	for _, it := range sesi.LibraryItems {
		aspect := ""
		if it.LibraryAspect != nil {
			aspect = *it.LibraryAspect
		}
		addLib(it.Kind, aspect, it.LibraryRef)
	}
	if sesi.LibraryKind != nil && *sesi.LibraryKind != "" &&
		sesi.LibraryRef != nil && *sesi.LibraryRef != "" {
		aspect := ""
		if sesi.LibraryAspect != nil {
			aspect = *sesi.LibraryAspect
		}
		addLib(*sesi.LibraryKind, aspect, *sesi.LibraryRef)
	}
}

// scanYearMonth pulls year+month out of a YYYY-MM-DD prefix.
func scanYearMonth(date string, year, month *int) (int, error) {
	if len(date) < 7 {
		return 0, errors.New("date too short")
	}
	y, errY := atoiSafe(date[0:4])
	m, errM := atoiSafe(date[5:7])
	if errY != nil || errM != nil {
		return 0, errors.New("bad date")
	}
	*year = y
	*month = m
	return 0, nil
}

func atoiSafe(s string) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, errors.New("not a digit")
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}

func primarySesiMateri(in SesiInput) *string {
	if in.MateriAjarID != nil && strings.TrimSpace(*in.MateriAjarID) != "" {
		return in.MateriAjarID
	}
	for _, m := range in.MateriAjarIDs {
		if strings.TrimSpace(m) != "" {
			v := m
			return &v
		}
	}
	return nil
}

func (s *SesiStore) List(ctx context.Context, p SesiListParams) ([]Sesi, error) {
	clauses := []string{"1=1"}
	var args []any
	if p.From != "" {
		clauses = append(clauses, "tanggal >= ?")
		args = append(args, p.From)
	}
	if p.To != "" {
		clauses = append(clauses, "tanggal <= ?")
		args = append(args, p.To)
	}
	if p.Tingkat != "" {
		clauses = append(clauses, "tingkat = ?")
		args = append(args, p.Tingkat)
	}
	if p.GuruID != "" {
		clauses = append(clauses, "guru_id = ?")
		args = append(args, p.GuruID)
	}
	if p.KelasID != "" {
		clauses = append(clauses, "kelas_id = ?")
		args = append(args, p.KelasID)
	}
	where := " WHERE " + strings.Join(clauses, " AND ")

	rows, err := s.db.QueryContext(ctx,
		`SELECT `+sesiCols+` FROM sesi`+where+
			` ORDER BY tanggal ASC, COALESCE(mulai, '') ASC, topik ASC`,
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Sesi{}
	for rows.Next() {
		v, err := scanSesi(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := s.loadMateriIDs(ctx, out); err != nil {
		return nil, err
	}
	if err := s.loadLibraryItems(ctx, out); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *SesiStore) Get(ctx context.Context, id string) (*Sesi, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+sesiCols+` FROM sesi WHERE id = ?`, id)
	v, err := scanSesi(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	one := []Sesi{*v}
	if err := s.loadMateriIDs(ctx, one); err != nil {
		return nil, err
	}
	if err := s.loadLibraryItems(ctx, one); err != nil {
		return nil, err
	}
	return &one[0], nil
}

func (s *SesiStore) Create(ctx context.Context, in SesiInput, createdBy string) (*Sesi, error) {
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var createdByPtr *string
	if createdBy != "" {
		createdByPtr = &createdBy
	}
	primary := primarySesiMateri(in)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO sesi (id, tanggal, mulai, selesai, topik, catatan, tingkat,
		   materi_ajar_id, guru_id, kelas_id, library_kind, library_aspect, library_ref,
		   started_at, ended_at, live_materi_id, live_display_mode,
		   created_by, created_at, updated_at, jadwal_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
		id, in.Tanggal, in.Mulai, in.Selesai, in.Topik, in.Catatan, in.Tingkat,
		primary, in.GuruID, in.KelasID,
		in.LibraryKind, in.LibraryAspect, in.LibraryRef,
		createdByPtr, now, now, in.JadwalID,
	); err != nil {
		return nil, err
	}
	if err := writeMateriJoin(ctx, tx, id, in.MateriAjarIDs, primary); err != nil {
		return nil, err
	}
	if err := writeLibraryJoin(ctx, tx, id, mergedLibraryItems(in)); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	v, err := s.Get(ctx, id)
	if err == nil {
		s.syncSesiToRencana(ctx, v)
	}
	return v, err
}

func (s *SesiStore) Update(ctx context.Context, id string, in SesiInput) (*Sesi, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	primary := primarySesiMateri(in)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		`UPDATE sesi SET tanggal = ?, mulai = ?, selesai = ?, topik = ?, catatan = ?,
		   tingkat = ?, materi_ajar_id = ?, guru_id = ?, kelas_id = ?,
		   library_kind = ?, library_aspect = ?, library_ref = ?, updated_at = ?
		 WHERE id = ?`,
		in.Tanggal, in.Mulai, in.Selesai, in.Topik, in.Catatan,
		in.Tingkat, primary, in.GuruID, in.KelasID,
		in.LibraryKind, in.LibraryAspect, in.LibraryRef, now, id,
	)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, ErrNotFound
	}
	if err := writeMateriJoin(ctx, tx, id, in.MateriAjarIDs, primary); err != nil {
		return nil, err
	}
	if err := writeLibraryJoin(ctx, tx, id, mergedLibraryItems(in)); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	v, err := s.Get(ctx, id)
	if err == nil {
		s.syncSesiToRencana(ctx, v)
	}
	return v, err
}

// mergedLibraryItems returns the canonical list of library items to persist,
// combining the explicit LibraryItems slice with the legacy single-shot
// LibraryKind/LibraryRef fields if no explicit slice was sent. De-dupes by
// (kind, aspect, ref).
func mergedLibraryItems(in SesiInput) []SesiLibraryItem {
	if len(in.LibraryItems) > 0 {
		return in.LibraryItems
	}
	if in.LibraryKind == nil || *in.LibraryKind == "" || *in.LibraryKind == "kurikulum" {
		return nil
	}
	if in.LibraryRef == nil || *in.LibraryRef == "" {
		return nil
	}
	var aspect *string
	if in.LibraryAspect != nil && *in.LibraryAspect != "" {
		a := *in.LibraryAspect
		aspect = &a
	}
	return []SesiLibraryItem{{
		Kind:          *in.LibraryKind,
		LibraryAspect: aspect,
		LibraryRef:    *in.LibraryRef,
	}}
}

func (s *SesiStore) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sesi WHERE id = ?`, id)
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

// SetStarted / SetEnded toggle the live-session tracking timestamps. Idempotent:
// passing the same action twice is a no-op (the existing timestamp is kept).
func (s *SesiStore) SetStarted(ctx context.Context, id string) (*Sesi, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	res, err := s.db.ExecContext(ctx,
		`UPDATE sesi SET started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`,
		now, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

func (s *SesiStore) SetEnded(ctx context.Context, id string) (*Sesi, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	res, err := s.db.ExecContext(ctx,
		`UPDATE sesi SET ended_at = COALESCE(ended_at, ?),
		   live_materi_id = NULL, live_display_mode = NULL,
		   updated_at = ? WHERE id = ?`,
		now, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

// SetLive updates which materi is currently being shown on the live stage
// and the display mode. Pointers are sparse — nil means "leave unchanged".
// Pass empty-string pointers to clear a column.
func (s *SesiStore) SetLive(ctx context.Context, id string, materiID, displayMode *string) (*Sesi, error) {
	sets := []string{}
	args := []any{}
	if materiID != nil {
		sets = append(sets, "live_materi_id = ?")
		if *materiID == "" {
			args = append(args, nil)
		} else {
			args = append(args, *materiID)
		}
	}
	if displayMode != nil {
		sets = append(sets, "live_display_mode = ?")
		if *displayMode == "" {
			args = append(args, nil)
		} else {
			args = append(args, *displayMode)
		}
	}
	if len(sets) == 0 {
		return s.Get(ctx, id)
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	sets = append(sets, "updated_at = ?")
	args = append(args, now, id)
	res, err := s.db.ExecContext(ctx,
		`UPDATE sesi SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return s.Get(ctx, id)
}

func scanSesi(s scanner) (*Sesi, error) {
	var v Sesi
	if err := s.Scan(
		&v.ID, &v.Tanggal, &v.Mulai, &v.Selesai, &v.Topik, &v.Catatan, &v.Tingkat,
		&v.MateriAjarID, &v.GuruID, &v.KelasID,
		&v.LibraryKind, &v.LibraryAspect, &v.LibraryRef,
		&v.StartedAt, &v.EndedAt,
		&v.LiveMateriID, &v.LiveDisplayMode,
		&v.CreatedBy,
		&v.CreatedAt, &v.UpdatedAt, &v.JadwalID,
	); err != nil {
		return nil, err
	}
	return &v, nil
}
