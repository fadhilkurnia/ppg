package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

// TeachersBulk adapts *Teachers to bulk.Importer, bulk.Exporter and
// bulk.Deleter. Keep this thin — the heavy lifting belongs to *Teachers.
type TeachersBulk struct {
	teachers *Teachers
}

func NewTeachersBulk(t *Teachers) *TeachersBulk { return &TeachersBulk{teachers: t} }

func (b *TeachersBulk) Name() string { return "teachers" }

func (b *TeachersBulk) Headers() []string {
	return []string{
		"name", "nickname", "kelompok", "desa", "daerah",
		"joinedAt", "retiredAt", "status", "notes",
	}
}

// ParseRow accepts both canonical camelCase headers and the legacy
// Indonesian column names from the existing teachers_data.csv ("Nama Guru",
// "Tanggal Masuk", "Keterangan"), so operators can keep using their
// existing files.
func (b *TeachersBulk) ParseRow(rec map[string]string) (TeacherInput, error) {
	name := pickFirst(rec, "name", "Nama Guru")
	if name == "" {
		return TeacherInput{}, errors.New("name is empty")
	}
	kelompok := pickFirst(rec, "kelompok", "Kelompok")
	desa := pickFirst(rec, "desa", "Desa")
	daerah := pickFirst(rec, "daerah", "Daerah")
	if kelompok == "" || desa == "" || daerah == "" {
		return TeacherInput{}, errors.New("kelompok/desa/daerah is empty")
	}
	nickname := pickFirst(rec, "nickname", "Nama Panggilan")

	joined, err := bulk.ParseIndoDate(pickFirst(rec, "joinedAt", "Tanggal Masuk"))
	if err != nil {
		return TeacherInput{}, fmt.Errorf("joinedAt: %w", err)
	}
	retired, err := bulk.ParseIndoDate(pickFirst(rec, "retiredAt", "Tanggal Purna"))
	if err != nil {
		return TeacherInput{}, fmt.Errorf("retiredAt: %w", err)
	}

	statusRaw := strings.ToLower(strings.TrimSpace(pickFirst(rec, "status")))
	keterangan := strings.TrimSpace(pickFirst(rec, "Keterangan"))
	status := model.TeacherActive
	var notes *string
	switch {
	case statusRaw == "active" || statusRaw == "retired":
		status = model.TeacherStatus(statusRaw)
	case strings.EqualFold(keterangan, "Purna"):
		status = model.TeacherRetired
	case keterangan != "":
		notes = &keterangan
	}
	if n := strings.TrimSpace(rec["notes"]); n != "" {
		notes = &n
	}

	return TeacherInput{
		Name:      name,
		Nickname:  nilIfEmpty(nickname),
		Kelompok:  kelompok,
		Desa:      desa,
		Daerah:    daerah,
		JoinedAt:  joined,
		RetiredAt: retired,
		Status:    status,
		Notes:     notes,
	}, nil
}

// Upsert honours mode. teachers has no unique key besides id, so upsert
// matches on (name, kelompok, desa, daerah) — the same shape an operator
// would use to spot a duplicate by eye.
func (b *TeachersBulk) Upsert(ctx context.Context, in TeacherInput, mode bulk.Mode) (string, bool, error) {
	existing, err := b.teachers.findOneByNaturalKey(ctx, in.Name, in.Kelompok, in.Desa, in.Daerah)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", false, err
	}
	if existing != nil {
		if mode != bulk.ModeUpsert {
			return "", false, fmt.Errorf("duplicate teacher %q in %s/%s/%s", in.Name, in.Kelompok, in.Desa, in.Daerah)
		}
		if _, err := b.teachers.Update(ctx, existing.ID, in); err != nil {
			return "", false, err
		}
		return existing.ID, false, nil
	}
	created, err := b.teachers.Create(ctx, in)
	if err != nil {
		return "", false, err
	}
	return created.ID, true, nil
}

// StreamRows implements bulk.Exporter. Filters mirror /api/teachers list
// (q, status, daerah) and the store cursor is paged so the whole result is
// never buffered.
func (b *TeachersBulk) StreamRows(ctx context.Context, q url.Values, write func([]string) error) error {
	const page = 500
	offset := 0
	for {
		res, err := b.teachers.List(ctx, TeacherListParams{
			Query:  q.Get("q"),
			Status: q.Get("status"),
			Daerah: q.Get("daerah"),
			Limit:  page,
			Offset: offset,
		})
		if err != nil {
			return err
		}
		for _, t := range res.Items {
			if err := write([]string{
				t.Name,
				strOrEmpty(t.Nickname),
				t.Kelompok,
				t.Desa,
				t.Daerah,
				bulk.FormatDateOrEmpty(t.JoinedAt),
				bulk.FormatDateOrEmpty(t.RetiredAt),
				string(t.Status),
				strOrEmpty(t.Notes),
			}); err != nil {
				return err
			}
		}
		if len(res.Items) < page {
			return nil
		}
		offset += page
	}
}

// BulkDelete archives (status='retired') or hard-deletes per id.
// OutcomeSkipped is reserved for ids that don't exist. Successful rows
// use OutcomeUpdated as a generic "operation succeeded" marker — the
// request mode tells the caller whether that meant archive or hard delete.
func (b *TeachersBulk) BulkDelete(ctx context.Context, ids []string, mode bulk.DeleteMode) []bulk.DeleteResult {
	out := make([]bulk.DeleteResult, 0, len(ids))
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if id == "" {
			out = append(out, bulk.DeleteResult{ID: raw, Outcome: bulk.OutcomeFailed, Error: "empty id"})
			continue
		}
		var err error
		if mode == bulk.DeleteModeHard {
			err = b.teachers.Delete(ctx, id)
		} else {
			err = b.teachers.archive(ctx, id)
		}
		if err != nil {
			out = append(out, bulk.DeleteResult{
				ID: id, Outcome: failOrSkip(err), Error: errMessage(err),
			})
			continue
		}
		out = append(out, bulk.DeleteResult{ID: id, Outcome: bulk.OutcomeUpdated})
	}
	return out
}

// findOneByNaturalKey returns the matching teacher, ErrNotFound if none.
// Multiple matches return the lowest id so upserts converge.
func (t *Teachers) findOneByNaturalKey(ctx context.Context, name, kelompok, desa, daerah string) (*model.Teacher, error) {
	row := t.db.QueryRowContext(ctx,
		selectTeacher+` WHERE name = ? AND kelompok = ? AND desa = ? AND daerah = ? ORDER BY id ASC LIMIT 1`,
		name, kelompok, desa, daerah)
	tt, err := readTeacher(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return tt, nil
}

// archive flips status to 'retired' without touching other columns.
func (t *Teachers) archive(ctx context.Context, id string) error {
	res, err := t.db.ExecContext(ctx,
		`UPDATE teachers SET status = 'retired', updated_at = ? WHERE id = ?`,
		time.Now().UTC(), id)
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

// --- helpers shared across entity bulk adapters -------------------------

func pickFirst(rec map[string]string, keys ...string) string {
	for _, k := range keys {
		if v, ok := rec[k]; ok {
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		}
	}
	return ""
}

func nilIfEmpty(s string) *string {
	v := strings.TrimSpace(s)
	if v == "" {
		return nil
	}
	return &v
}

func strOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func failOrSkip(err error) bulk.Outcome {
	if errors.Is(err, ErrNotFound) {
		return bulk.OutcomeSkipped
	}
	return bulk.OutcomeFailed
}

func errMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
