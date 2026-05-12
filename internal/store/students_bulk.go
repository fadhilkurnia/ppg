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

// StudentsBulk adapts *Students to bulk.Importer, bulk.Exporter and
// bulk.Deleter.
type StudentsBulk struct {
	students *Students
}

func NewStudentsBulk(s *Students) *StudentsBulk { return &StudentsBulk{students: s} }

func (b *StudentsBulk) Name() string { return "students" }

func (b *StudentsBulk) Headers() []string {
	return []string{
		"name", "nickname", "dateOfBirth", "gender", "level", "kelompok", "city",
		"joinedAt", "leftAt", "leaveReason", "status",
		"parentName", "parentPhone", "parentEmail",
	}
}

func (b *StudentsBulk) ParseRow(rec map[string]string) (StudentInput, error) {
	name := pickFirst(rec, "name", "Nama")
	if name == "" {
		return StudentInput{}, errors.New("name is empty")
	}
	kelompok := pickFirst(rec, "kelompok", "Kelompok")
	if kelompok == "" {
		return StudentInput{}, errors.New("kelompok is empty")
	}
	levelRaw := pickFirst(rec, "level", "Level", "Tingkat")
	if levelRaw == "" {
		return StudentInput{}, errors.New("level is empty")
	}
	level, err := normaliseStudentLevel(levelRaw)
	if err != nil {
		return StudentInput{}, err
	}

	gender := strings.ToLower(strings.TrimSpace(pickFirst(rec, "gender", "Gender", "JenisKelamin")))
	if gender != "" && gender != "male" && gender != "female" {
		return StudentInput{}, fmt.Errorf("gender %q: want male or female", gender)
	}

	dob, err := bulk.ParseIndoDate(pickFirst(rec, "dateOfBirth", "TanggalLahir", "Tanggal Lahir"))
	if err != nil {
		return StudentInput{}, fmt.Errorf("dateOfBirth: %w", err)
	}
	joined, err := bulk.ParseIndoDate(pickFirst(rec, "joinedAt", "Tanggal Masuk"))
	if err != nil {
		return StudentInput{}, fmt.Errorf("joinedAt: %w", err)
	}
	left, err := bulk.ParseIndoDate(pickFirst(rec, "leftAt", "Tanggal Keluar"))
	if err != nil {
		return StudentInput{}, fmt.Errorf("leftAt: %w", err)
	}

	statusRaw := strings.ToLower(strings.TrimSpace(pickFirst(rec, "status")))
	status := model.StudentActive
	if statusRaw == "left" {
		status = model.StudentLeft
	} else if statusRaw != "" && statusRaw != "active" {
		return StudentInput{}, fmt.Errorf("status %q: want active or left", statusRaw)
	}

	return StudentInput{
		Name:        name,
		Nickname:    nilIfEmpty(pickFirst(rec, "nickname", "Nama Panggilan")),
		DateOfBirth: dob,
		Gender:      gender,
		Level:       level,
		Kelompok:    kelompok,
		City:        nilIfEmpty(pickFirst(rec, "city", "Kota")),
		JoinedAt:    joined,
		LeftAt:      left,
		LeaveReason: nilIfEmpty(pickFirst(rec, "leaveReason", "Alasan Keluar")),
		Status:      status,
		ParentName:  nilIfEmpty(pickFirst(rec, "parentName", "Nama Wali")),
		ParentPhone: nilIfEmpty(pickFirst(rec, "parentPhone", "No HP Wali")),
		ParentEmail: nilIfEmpty(pickFirst(rec, "parentEmail", "Email Wali")),
	}, nil
}

// Upsert matches on (name, kelompok, dateOfBirth) when DOB is set, falling
// back to (name, kelompok) when DOB is nil.
func (b *StudentsBulk) Upsert(ctx context.Context, in StudentInput, mode bulk.Mode) (string, bool, error) {
	existing, err := b.students.findOneByNaturalKey(ctx, in.Name, in.Kelompok, in.DateOfBirth)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", false, err
	}
	if existing != nil {
		if mode != bulk.ModeUpsert {
			return "", false, fmt.Errorf("duplicate student %q in %s", in.Name, in.Kelompok)
		}
		if _, err := b.students.Update(ctx, existing.ID, in); err != nil {
			return "", false, err
		}
		return existing.ID, false, nil
	}
	created, err := b.students.Create(ctx, in)
	if err != nil {
		return "", false, err
	}
	return created.ID, true, nil
}

func (b *StudentsBulk) StreamRows(ctx context.Context, q url.Values, write func([]string) error) error {
	const page = 500
	offset := 0
	for {
		res, err := b.students.List(ctx, ListParams{
			Query:    q.Get("q"),
			Status:   q.Get("status"),
			Kelompok: q.Get("kelompok"),
			Limit:    page,
			Offset:   offset,
		})
		if err != nil {
			return err
		}
		for _, s := range res.Items {
			if err := write([]string{
				s.Name,
				strOrEmpty(s.Nickname),
				bulk.FormatDateOrEmpty(s.DateOfBirth),
				s.Gender,
				string(s.Level),
				s.Kelompok,
				strOrEmpty(s.City),
				bulk.FormatDateOrEmpty(s.JoinedAt),
				bulk.FormatDateOrEmpty(s.LeftAt),
				strOrEmpty(s.LeaveReason),
				string(s.Status),
				strOrEmpty(s.ParentName),
				strOrEmpty(s.ParentPhone),
				strOrEmpty(s.ParentEmail),
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

func (b *StudentsBulk) BulkDelete(ctx context.Context, ids []string, mode bulk.DeleteMode) []bulk.DeleteResult {
	out := make([]bulk.DeleteResult, 0, len(ids))
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if id == "" {
			out = append(out, bulk.DeleteResult{ID: raw, Outcome: bulk.OutcomeFailed, Error: "empty id"})
			continue
		}
		var err error
		if mode == bulk.DeleteModeHard {
			err = b.students.Delete(ctx, id)
		} else {
			err = b.students.archive(ctx, id)
		}
		if err != nil {
			out = append(out, bulk.DeleteResult{ID: id, Outcome: failOrSkip(err), Error: errMessage(err)})
			continue
		}
		out = append(out, bulk.DeleteResult{ID: id, Outcome: bulk.OutcomeUpdated})
	}
	return out
}

// findOneByNaturalKey matches on (name, kelompok, dob) when dob is non-nil,
// otherwise (name, kelompok). Lowest id wins so upserts converge.
func (s *Students) findOneByNaturalKey(ctx context.Context, name, kelompok string, dob *time.Time) (*model.Student, error) {
	var row *sql.Row
	if dob == nil {
		row = s.db.QueryRowContext(ctx,
			selectStudent+` WHERE name = ? AND kelompok = ? AND date_of_birth IS NULL ORDER BY id ASC LIMIT 1`,
			name, kelompok)
	} else {
		row = s.db.QueryRowContext(ctx,
			selectStudent+` WHERE name = ? AND kelompok = ? AND date_of_birth = ? ORDER BY id ASC LIMIT 1`,
			name, kelompok, dob.UTC())
	}
	st, err := readStudent(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return st, nil
}

// archive flips status to 'left' without touching other columns.
func (s *Students) archive(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE students SET status = 'left', updated_at = ? WHERE id = ?`,
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

func normaliseStudentLevel(raw string) (model.StudentLevel, error) {
	s := strings.TrimSpace(raw)
	for _, l := range []model.StudentLevel{
		model.LevelCaberawit, model.LevelPraRemaja, model.LevelRemaja, model.LevelPraNikah,
	} {
		if strings.EqualFold(s, string(l)) {
			return l, nil
		}
	}
	return "", fmt.Errorf("level %q: want Caberawit, Pra Remaja, Remaja, or Pra Nikah", raw)
}
