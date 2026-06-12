package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

// KelasJadwal is a kelas's recurring weekly schedule (one row per kelas). The
// selected weekdays (`Hari`, 0=Minggu..6=Sabtu) share one mulai/selesai time.
// It lazily auto-generates individual sesi rows via GenerateJadwal.
type KelasJadwal struct {
	ID            string  `json:"id"`
	KelasID       string  `json:"kelasId"`
	Hari          []int   `json:"hari"`
	Mulai         string  `json:"mulai"`
	Selesai       *string `json:"selesai,omitempty"`
	TopikDefault  *string `json:"topikDefault,omitempty"`
	MulaiTanggal  *string `json:"mulaiTanggal,omitempty"`
	SampaiTanggal *string `json:"sampaiTanggal,omitempty"`
	HorizonMinggu int     `json:"horizonMinggu"`
	Aktif         bool    `json:"aktif"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type KelasJadwalInput struct {
	Hari          []int
	Mulai         string
	Selesai       *string
	TopikDefault  *string
	MulaiTanggal  *string
	SampaiTanggal *string
	HorizonMinggu int
	Aktif         bool
}

// AttachSesi wires the sesi store so jadwal generation can materialize sesi
// rows. Best-effort — nil-safe (generation no-ops when unset).
func (s *KelasStore) AttachSesi(se *SesiStore) { s.sesi = se }

// encodeHari renders a weekday set as a sorted, de-duplicated CSV like "1,3".
func encodeHari(days []int) string {
	seen := map[int]bool{}
	var keep []int
	for _, d := range days {
		if d >= 0 && d <= 6 && !seen[d] {
			seen[d] = true
			keep = append(keep, d)
		}
	}
	for i := 0; i < len(keep); i++ {
		for j := i + 1; j < len(keep); j++ {
			if keep[j] < keep[i] {
				keep[i], keep[j] = keep[j], keep[i]
			}
		}
	}
	parts := make([]string, len(keep))
	for i, d := range keep {
		parts[i] = strconv.Itoa(d)
	}
	return strings.Join(parts, ",")
}

func decodeHari(s string) []int {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	var out []int
	for _, p := range strings.Split(s, ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && n >= 0 && n <= 6 {
			out = append(out, n)
		}
	}
	return out
}

func (s *KelasStore) GetJadwal(ctx context.Context, kelasID string) (*KelasJadwal, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, kelas_id, hari, mulai, selesai, topik_default,
		        mulai_tanggal, sampai_tanggal, horizon_minggu, aktif,
		        created_at, updated_at
		   FROM kelas_jadwal WHERE kelas_id = ?`, kelasID)
	var j KelasJadwal
	var hari string
	var aktif int
	if err := row.Scan(&j.ID, &j.KelasID, &hari, &j.Mulai, &j.Selesai, &j.TopikDefault,
		&j.MulaiTanggal, &j.SampaiTanggal, &j.HorizonMinggu, &aktif,
		&j.CreatedAt, &j.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // no schedule configured
		}
		return nil, err
	}
	j.Hari = decodeHari(hari)
	j.Aktif = aktif != 0
	return &j, nil
}

func (s *KelasStore) UpsertJadwal(ctx context.Context, kelasID string, in KelasJadwalInput) (*KelasJadwal, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	hari := encodeHari(in.Hari)
	aktif := 0
	if in.Aktif {
		aktif = 1
	}
	horizon := in.HorizonMinggu
	if horizon <= 0 {
		horizon = 8
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var existing string
	_ = tx.QueryRowContext(ctx, `SELECT id FROM kelas_jadwal WHERE kelas_id = ?`, kelasID).Scan(&existing)
	if existing == "" {
		id := ulid.Make().String()
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO kelas_jadwal (id, kelas_id, hari, mulai, selesai, topik_default,
			   mulai_tanggal, sampai_tanggal, horizon_minggu, aktif, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, kelasID, hari, in.Mulai, in.Selesai, in.TopikDefault,
			in.MulaiTanggal, in.SampaiTanggal, horizon, aktif, now, now); err != nil {
			return nil, err
		}
	} else {
		if _, err := tx.ExecContext(ctx,
			`UPDATE kelas_jadwal SET hari = ?, mulai = ?, selesai = ?, topik_default = ?,
			   mulai_tanggal = ?, sampai_tanggal = ?, horizon_minggu = ?, aktif = ?, updated_at = ?
			 WHERE kelas_id = ?`,
			hari, in.Mulai, in.Selesai, in.TopikDefault,
			in.MulaiTanggal, in.SampaiTanggal, horizon, aktif, now, kelasID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	// Post-commit: keep generated sesi in sync with the (possibly changed) rule.
	s.regenerate(ctx, kelasID)
	return s.GetJadwal(ctx, kelasID)
}

func (s *KelasStore) DeleteJadwal(ctx context.Context, kelasID string) error {
	today := time.Now().UTC().Format("2006-01-02")
	_ = s.deleteFutureGenerated(ctx, kelasID, today)
	_, err := s.db.ExecContext(ctx, `DELETE FROM kelas_jadwal WHERE kelas_id = ?`, kelasID)
	return err
}

func parseDate(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func addDays(s string, n int) string {
	t, ok := parseDate(s)
	if !ok {
		return s
	}
	return t.AddDate(0, 0, n).Format("2006-01-02")
}

// weekdayOf returns Go's Weekday int (Sunday=0..Saturday=6) for a YYYY-MM-DD.
func weekdayOf(s string) (int, bool) {
	t, ok := parseDate(s)
	if !ok {
		return 0, false
	}
	return int(t.Weekday()), true
}

func derefOr(p *string, def string) string {
	if p != nil && *p != "" {
		return *p
	}
	return def
}

// ExpandJadwal returns the SesiInput stubs the schedule implies within
// [from, to] (inclusive, YYYY-MM-DD), clamped to the rule's start/end dates.
// Returns nil when there is no active schedule.
func (s *KelasStore) ExpandJadwal(ctx context.Context, kelasID, from, to string) ([]SesiInput, error) {
	j, err := s.GetJadwal(ctx, kelasID)
	if err != nil || j == nil || !j.Aktif || len(j.Hari) == 0 {
		return nil, err
	}
	k, err := s.Get(ctx, kelasID)
	if err != nil {
		return nil, err
	}
	effFrom := from
	if j.MulaiTanggal != nil && *j.MulaiTanggal > effFrom {
		effFrom = *j.MulaiTanggal
	}
	effTo := to
	if j.SampaiTanggal != nil && *j.SampaiTanggal != "" && *j.SampaiTanggal < effTo {
		effTo = *j.SampaiTanggal
	}
	dayset := map[int]bool{}
	for _, d := range j.Hari {
		dayset[d] = true
	}
	topik := derefOr(j.TopikDefault, k.Nama)
	tingkat := k.Tingkat
	mulai := j.Mulai
	var out []SesiInput
	for d := effFrom; d <= effTo; d = addDays(d, 1) {
		wd, ok := weekdayOf(d)
		if !ok || !dayset[wd] {
			continue
		}
		date := d
		jid := j.ID
		out = append(out, SesiInput{
			Tanggal:  date,
			Mulai:    &mulai,
			Selesai:  j.Selesai,
			Topik:    topik,
			Tingkat:  &tingkat,
			GuruID:   k.GuruUserID,
			KelasID:  &kelasID,
			JadwalID: &jid,
		})
	}
	return out, nil
}

func (s *KelasStore) sesiExistsOnDate(ctx context.Context, kelasID, tanggal string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM sesi WHERE kelas_id = ? AND tanggal = ?`, kelasID, tanggal).Scan(&n)
	return n > 0, err
}

// deleteFutureGenerated removes schedule-generated, not-yet-started sesi from
// `today` onward so a rule change/disable/delete can cleanly regenerate
// without touching history or manually-created sessions.
func (s *KelasStore) deleteFutureGenerated(ctx context.Context, kelasID, today string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM sesi
		   WHERE kelas_id = ? AND jadwal_id IS NOT NULL AND started_at IS NULL AND tanggal >= ?`,
		kelasID, today)
	return err
}

// GenerateJadwal materializes missing sesi from the kelas's active schedule up
// to its horizon, starting today. Idempotent: a date that already has any sesi
// for the kelas is skipped (manual or previously generated).
func (s *KelasStore) GenerateJadwal(ctx context.Context, kelasID string) (int, error) {
	if s.sesi == nil {
		return 0, nil
	}
	j, err := s.GetJadwal(ctx, kelasID)
	if err != nil || j == nil || !j.Aktif {
		return 0, err
	}
	today := time.Now().UTC().Format("2006-01-02")
	to := addDays(today, j.HorizonMinggu*7)
	cands, err := s.ExpandJadwal(ctx, kelasID, today, to)
	if err != nil {
		return 0, err
	}
	created := 0
	for _, c := range cands {
		exists, err := s.sesiExistsOnDate(ctx, kelasID, c.Tanggal)
		if err != nil {
			return created, err
		}
		if exists {
			continue
		}
		if _, err := s.sesi.Create(ctx, c, ""); err != nil {
			return created, err
		}
		created++
	}
	return created, nil
}

// regenerate refreshes the rolling window after a rule change: drop future
// un-started generated rows, then (re)generate if the schedule is active.
func (s *KelasStore) regenerate(ctx context.Context, kelasID string) {
	if s.sesi == nil {
		return
	}
	today := time.Now().UTC().Format("2006-01-02")
	_ = s.deleteFutureGenerated(ctx, kelasID, today)
	_, _ = s.GenerateJadwal(ctx, kelasID) // no-ops when schedule is inactive/absent
}
