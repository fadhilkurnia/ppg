package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

// AttendancesBulk adapts *Attendances to bulk.Importer, bulk.Exporter and
// bulk.Deleter.
type AttendancesBulk struct {
	attendances *Attendances
}

func NewAttendancesBulk(a *Attendances) *AttendancesBulk { return &AttendancesBulk{attendances: a} }

func (b *AttendancesBulk) Name() string { return "attendances" }

func (b *AttendancesBulk) Headers() []string {
	return []string{
		"date", "durationMin", "teacherId", "teacherName",
		"studentId", "studentName", "status", "materi",
	}
}

func (b *AttendancesBulk) ParseRow(rec map[string]string) (AttendanceInput, error) {
	dateRaw := pickFirst(rec, "date", "Tanggal")
	if dateRaw == "" {
		return AttendanceInput{}, errors.New("date is empty")
	}
	t, err := time.Parse("2006-01-02", dateRaw)
	if err != nil {
		return AttendanceInput{}, fmt.Errorf("date: %w", err)
	}

	teacherID := pickFirst(rec, "teacherId", "TeacherId")
	if teacherID == "" {
		return AttendanceInput{}, errors.New("teacherId is empty")
	}
	studentID := pickFirst(rec, "studentId", "StudentId")
	if studentID == "" {
		return AttendanceInput{}, errors.New("studentId is empty")
	}

	statusRaw := strings.ToLower(strings.TrimSpace(pickFirst(rec, "status")))
	status, err := normaliseAttendanceStatus(statusRaw)
	if err != nil {
		return AttendanceInput{}, err
	}

	var durationMin *int
	if raw := strings.TrimSpace(pickFirst(rec, "durationMin")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return AttendanceInput{}, fmt.Errorf("durationMin %q: want non-negative integer", raw)
		}
		durationMin = &n
	}

	return AttendanceInput{
		Date:        t,
		DurationMin: durationMin,
		TeacherID:   teacherID,
		StudentID:   studentID,
		Status:      status,
		Materi:      nilIfEmpty(pickFirst(rec, "materi")),
	}, nil
}

// Upsert matches on (date, teacherId, studentId) — the same triple a user
// would treat as a duplicate.
func (b *AttendancesBulk) Upsert(ctx context.Context, in AttendanceInput, mode bulk.Mode) (string, bool, error) {
	existing, err := b.attendances.findOneByNaturalKey(ctx, in.Date, in.TeacherID, in.StudentID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", false, err
	}
	if existing != nil {
		if mode != bulk.ModeUpsert {
			return "", false, fmt.Errorf("duplicate attendance on %s for teacher/student", in.Date.Format("2006-01-02"))
		}
		if _, err := b.attendances.Update(ctx, existing.ID, in); err != nil {
			return "", false, err
		}
		return existing.ID, false, nil
	}
	created, err := b.attendances.Create(ctx, in)
	if err != nil {
		return "", false, err
	}
	return created.ID, true, nil
}

func (b *AttendancesBulk) StreamRows(ctx context.Context, q url.Values, write func([]string) error) error {
	const page = 500
	offset := 0

	p := AttendanceListParams{Limit: page}
	if v := q.Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateFrom = &t
		}
	}
	if v := q.Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			p.DateTo = &t
		}
	}
	p.TeacherID = q.Get("teacherId")
	p.StudentID = q.Get("studentId")
	p.Status = q.Get("status")

	for {
		p.Offset = offset
		res, err := b.attendances.List(ctx, p)
		if err != nil {
			return err
		}
		for _, a := range res.Items {
			duration := ""
			if a.DurationMin != nil {
				duration = strconv.Itoa(*a.DurationMin)
			}
			if err := write([]string{
				a.Date.Format("2006-01-02"),
				duration,
				a.TeacherID,
				a.TeacherName,
				a.StudentID,
				a.StudentName,
				string(a.Status),
				strOrEmpty(a.Materi),
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

// BulkDelete: archive mode is a no-op (no status column to flip), so it
// returns OutcomeFailed for archive requests. Hard mode runs DELETE.
func (b *AttendancesBulk) BulkDelete(ctx context.Context, ids []string, mode bulk.DeleteMode) []bulk.DeleteResult {
	out := make([]bulk.DeleteResult, 0, len(ids))
	if mode == bulk.DeleteModeArchive {
		for _, id := range ids {
			out = append(out, bulk.DeleteResult{
				ID: strings.TrimSpace(id), Outcome: bulk.OutcomeFailed,
				Error: "attendances do not support archive; use mode=hard",
			})
		}
		return out
	}
	for _, raw := range ids {
		id := strings.TrimSpace(raw)
		if id == "" {
			out = append(out, bulk.DeleteResult{ID: raw, Outcome: bulk.OutcomeFailed, Error: "empty id"})
			continue
		}
		err := b.attendances.Delete(ctx, id)
		if err != nil {
			out = append(out, bulk.DeleteResult{ID: id, Outcome: failOrSkip(err), Error: errMessage(err)})
			continue
		}
		out = append(out, bulk.DeleteResult{ID: id, Outcome: bulk.OutcomeUpdated})
	}
	return out
}

// findOneByNaturalKey matches on (date, teacherId, studentId).
func (a *Attendances) findOneByNaturalKey(ctx context.Context, date time.Time, teacherID, studentID string) (*model.Attendance, error) {
	row := a.db.QueryRowContext(ctx,
		selectAttendance+` WHERE a.date = ? AND a.teacher_id = ? AND a.student_id = ? ORDER BY a.id ASC LIMIT 1`,
		date.UTC(), teacherID, studentID)
	att, err := readAttendance(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return att, nil
}

func normaliseAttendanceStatus(raw string) (model.AttendanceStatus, error) {
	for _, s := range []model.AttendanceStatus{
		model.AttendanceHadir, model.AttendanceIzinMurid, model.AttendanceIzinGuru, model.AttendanceByVN,
	} {
		if strings.EqualFold(raw, string(s)) {
			return s, nil
		}
	}
	return "", fmt.Errorf("status %q: want hadir, izin_murid, izin_guru, or by_vn", raw)
}
