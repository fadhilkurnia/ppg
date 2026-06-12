package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// BacaanLog records that a user read a contiguous ayat range on a date.
// Two `source` values are tracked: 'pengajian' (mentored session) and
// 'mandiri' (self-study).
type BacaanLog struct {
	ID          string  `json:"id"`
	UserID      string  `json:"userId"`
	RecordedBy  *string `json:"recordedBy,omitempty"`
	Source      string  `json:"source"`
	Tanggal     string  `json:"tanggal"`
	Surah       int     `json:"surah"`
	AyatFrom    int     `json:"ayatFrom"`
	AyatTo      int     `json:"ayatTo"`
	Catatan     *string `json:"catatan,omitempty"`
	SesiID      *string `json:"sesiId,omitempty"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	// Denormalised — joined for list views so the frontend doesn't have
	// to do a second roundtrip.
	UserName    *string `json:"userName,omitempty"`
	RecorderName *string `json:"recorderName,omitempty"`
}

type BacaanInput struct {
	UserID    string
	Source    string
	Tanggal   string
	Surah     int
	AyatFrom  int
	AyatTo    int
	Catatan   *string
	SesiID    *string
}

type BacaanListParams struct {
	UserIDs []string // restrict to these users (empty = no restriction)
	UserID  string   // single-user filter (UI convenience)
	From    string   // YYYY-MM-DD inclusive
	To      string   // YYYY-MM-DD inclusive
	Source  string   // 'pengajian' | 'mandiri' | ''
	Limit   int
}

// BacaanSummary is the per-user aggregate: total distinct ayat-units read
// and latest read timestamp. Used for the progress dashboard.
type BacaanSummary struct {
	UserID       string  `json:"userId"`
	UserName     string  `json:"userName"`
	UserNickname *string `json:"userNickname,omitempty"`
	UserRole     string  `json:"userRole"`
	PhotoPath    *string `json:"photoPath,omitempty"`
	TotalAyat    int     `json:"totalAyat"`
	LastRead     *string `json:"lastRead,omitempty"`
	Sessions     int     `json:"sessions"`
	// LastSurah / LastAyatTo / LastAyatFrom describe the most recent log
	// entry, used by the UI to show "sedang dibaca" alongside the pie chart.
	LastSurah    *int `json:"lastSurah,omitempty"`
	LastAyatFrom *int `json:"lastAyatFrom,omitempty"`
	LastAyatTo   *int `json:"lastAyatTo,omitempty"`
}

// QuranTotalAyat is the well-known count of ayat across all 114 surah.
const QuranTotalAyat = 6236

type Bacaan struct{ db *sql.DB }

func NewBacaan(db *sql.DB) *Bacaan { return &Bacaan{db: db} }

const bacaanCols = `b.id, b.user_id, b.recorded_by, b.source, b.tanggal,
	b.surah, b.ayat_from, b.ayat_to, b.catatan, b.sesi_id, b.created_at, b.updated_at`

// VisibleUserIDs returns the user ids whose bacaan logs the caller may see.
// Kontrol Bacaan tracks generus (murid) only — guru/admin/pengurus/ortu
// don't have their own progress shown, they only get visibility into murid.
// Roles:
//   - admin / pengurus / guru  → all murid
//   - ortu                     → murid where parent_email == caller's email
//   - murid                    → themselves
//   - other                    → empty (no own progress, no list)
func (b *Bacaan) VisibleUserIDs(ctx context.Context, callerID, callerRole, callerEmail string) ([]string, error) {
	switch callerRole {
	case "admin", "pengurus", "guru":
		return b.allUserIDs(ctx, "murid")
	case "ortu":
		rows, err := b.db.QueryContext(ctx,
			`SELECT id FROM users
			 WHERE active = 1 AND role = 'murid' AND lower(parent_email) = lower(?)`,
			strings.TrimSpace(callerEmail))
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		ids := []string{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
		return ids, rows.Err()
	case "murid":
		return []string{callerID}, nil
	default:
		return []string{}, nil
	}
}

func (b *Bacaan) allUserIDs(ctx context.Context, role string) ([]string, error) {
	query := `SELECT id FROM users WHERE active = 1`
	args := []any{}
	if role != "" {
		query += ` AND role = ?`
		args = append(args, role)
	}
	rows, err := b.db.QueryContext(ctx, query, args...)
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

func appendUnique(s []string, v string) []string {
	for _, x := range s {
		if x == v {
			return s
		}
	}
	return append(s, v)
}

func (b *Bacaan) List(ctx context.Context, p BacaanListParams) ([]BacaanLog, error) {
	where := []string{"1=1"}
	args := []any{}
	if len(p.UserIDs) > 0 {
		ph := strings.Repeat("?,", len(p.UserIDs))
		ph = ph[:len(ph)-1]
		where = append(where, "b.user_id IN ("+ph+")")
		for _, id := range p.UserIDs {
			args = append(args, id)
		}
	}
	if p.UserID != "" {
		where = append(where, "b.user_id = ?")
		args = append(args, p.UserID)
	}
	if p.From != "" {
		where = append(where, "b.tanggal >= ?")
		args = append(args, p.From)
	}
	if p.To != "" {
		where = append(where, "b.tanggal <= ?")
		args = append(args, p.To)
	}
	if p.Source != "" {
		where = append(where, "b.source = ?")
		args = append(args, p.Source)
	}
	limit := 200
	if p.Limit > 0 && p.Limit < 2000 {
		limit = p.Limit
	}
	query := `SELECT ` + bacaanCols + `, u.name AS user_name, r.name AS recorder_name
	          FROM bacaan_log b
	          LEFT JOIN users u ON u.id = b.user_id
	          LEFT JOIN users r ON r.id = b.recorded_by
	          WHERE ` + strings.Join(where, " AND ") +
		` ORDER BY b.tanggal DESC, b.created_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := b.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BacaanLog{}
	for rows.Next() {
		var v BacaanLog
		if err := rows.Scan(
			&v.ID, &v.UserID, &v.RecordedBy, &v.Source, &v.Tanggal,
			&v.Surah, &v.AyatFrom, &v.AyatTo, &v.Catatan, &v.SesiID,
			&v.CreatedAt, &v.UpdatedAt, &v.UserName, &v.RecorderName,
		); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Summary returns per-user aggregate progress restricted to the given user
// id set. Users with zero bacaan rows are still emitted (TotalAyat=0) so
// the dashboard can show "belum mulai" entries.
func (b *Bacaan) Summary(ctx context.Context, userIDs []string) ([]BacaanSummary, error) {
	if len(userIDs) == 0 {
		return []BacaanSummary{}, nil
	}
	ph := strings.Repeat("?,", len(userIDs))
	ph = ph[:len(ph)-1]
	args := make([]any, 0, len(userIDs))
	for _, id := range userIDs {
		args = append(args, id)
	}
	// Sum of (ayat_to - ayat_from + 1) overcounts overlapping ranges, but for
	// a progress display that's acceptable; in practice users don't log the
	// same ayat twice in a session. Cap at QuranTotalAyat in the UI.
	// LEFT JOIN with the "latest log per user" — SQLite supports the
	// correlated subquery pattern here, keeping the existing aggregate happy.
	rows, err := b.db.QueryContext(ctx,
		`SELECT u.id, u.name, u.nickname, u.role, u.photo_path,
		        COALESCE(SUM(b.ayat_to - b.ayat_from + 1), 0) AS total_ayat,
		        MAX(b.tanggal)        AS last_read,
		        COUNT(b.id)           AS sessions,
		        last.surah, last.ayat_from, last.ayat_to
		 FROM users u
		 LEFT JOIN bacaan_log b ON b.user_id = u.id
		 LEFT JOIN (
		   SELECT bl.user_id, bl.surah, bl.ayat_from, bl.ayat_to
		   FROM bacaan_log bl
		   WHERE bl.id IN (
		     SELECT id FROM bacaan_log b2
		     WHERE b2.user_id = bl.user_id
		     ORDER BY b2.tanggal DESC, b2.created_at DESC LIMIT 1
		   )
		 ) last ON last.user_id = u.id
		 WHERE u.id IN (`+ph+`)
		 GROUP BY u.id, u.name, u.nickname, u.role, u.photo_path,
		          last.surah, last.ayat_from, last.ayat_to
		 ORDER BY total_ayat DESC, u.name ASC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BacaanSummary{}
	for rows.Next() {
		var s BacaanSummary
		if err := rows.Scan(&s.UserID, &s.UserName, &s.UserNickname, &s.UserRole, &s.PhotoPath,
			&s.TotalAyat, &s.LastRead, &s.Sessions,
			&s.LastSurah, &s.LastAyatFrom, &s.LastAyatTo); err != nil {
			return nil, err
		}
		if s.TotalAyat > QuranTotalAyat {
			s.TotalAyat = QuranTotalAyat
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SurahProgress is the per-surah max-ayat-reached aggregate for a user.
type SurahProgress struct {
	Surah    int `json:"surah"`
	AyatRead int `json:"ayatRead"` // max(ayat_to) across logs
	Sessions int `json:"sessions"`
}

// PerSurah aggregates max(ayat_to) per surah for a single user. Used to
// render one pie chart per surah they've started.
func (b *Bacaan) PerSurah(ctx context.Context, userID string) ([]SurahProgress, error) {
	rows, err := b.db.QueryContext(ctx,
		`SELECT surah, MAX(ayat_to) AS ayat_read, COUNT(*) AS sessions
		 FROM bacaan_log
		 WHERE user_id = ?
		 GROUP BY surah
		 ORDER BY surah ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SurahProgress{}
	for rows.Next() {
		var s SurahProgress
		if err := rows.Scan(&s.Surah, &s.AyatRead, &s.Sessions); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (b *Bacaan) Create(ctx context.Context, in BacaanInput, recordedBy string) (*BacaanLog, error) {
	if in.AyatTo < in.AyatFrom {
		in.AyatTo = in.AyatFrom
	}
	if in.Source != "pengajian" && in.Source != "mandiri" {
		in.Source = "mandiri"
	}
	id := ulid.Make().String()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	var rec *string
	if strings.TrimSpace(recordedBy) != "" {
		rec = &recordedBy
	}
	_, err := b.db.ExecContext(ctx,
		`INSERT INTO bacaan_log
		   (id, user_id, recorded_by, source, tanggal, surah, ayat_from, ayat_to,
		    catatan, sesi_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.UserID, rec, in.Source, in.Tanggal,
		in.Surah, in.AyatFrom, in.AyatTo, in.Catatan, in.SesiID, now, now,
	)
	if err != nil {
		return nil, err
	}
	return b.Get(ctx, id)
}

func (b *Bacaan) Get(ctx context.Context, id string) (*BacaanLog, error) {
	rows, err := b.List(ctx, BacaanListParams{Limit: 1})
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.ID == id {
			return &r, nil
		}
	}
	// Fall back to a direct query — List filters out unknown ids when the
	// user-restriction is in effect, but for self-create we don't apply that.
	row := b.db.QueryRowContext(ctx,
		`SELECT `+bacaanCols+`, u.name, r.name
		 FROM bacaan_log b
		 LEFT JOIN users u ON u.id = b.user_id
		 LEFT JOIN users r ON r.id = b.recorded_by
		 WHERE b.id = ?`, id)
	var v BacaanLog
	if err := row.Scan(
		&v.ID, &v.UserID, &v.RecordedBy, &v.Source, &v.Tanggal,
		&v.Surah, &v.AyatFrom, &v.AyatTo, &v.Catatan, &v.SesiID,
		&v.CreatedAt, &v.UpdatedAt, &v.UserName, &v.RecorderName,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &v, nil
}

func (b *Bacaan) Delete(ctx context.Context, id string) error {
	res, err := b.db.ExecContext(ctx, `DELETE FROM bacaan_log WHERE id = ?`, id)
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
