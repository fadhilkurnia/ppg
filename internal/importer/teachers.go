// Package importer parses spreadsheet exports and inserts them into the
// store. Indonesian-friendly date parsing is centralized here so the same
// rules apply to any future CSVs that share the format.
package importer

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Result reports what happened to each input row.
type Result struct {
	Inserted int
	Skipped  int
	Errors   []RowError
}

type RowError struct {
	Line int
	Err  error
}

// expected CSV header (in order). Values are matched case-insensitively after
// trimming.
var teachersHeader = []string{
	"No.", "Nama Guru", "Nama Panggilan", "Kelompok", "Desa", "Daerah",
	"Tanggal Masuk", "Tanggal Purna", "Keterangan",
}

// Teachers reads `r` as a CSV in the teachers_data.csv format, normalizes
// each row, and inserts it via the provided store. Returns counts and a
// slice of per-row errors (so a single bad row doesn't abort the whole run).
func Teachers(ctx context.Context, r io.Reader, t *store.Teachers) (Result, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return Result{}, fmt.Errorf("read header: %w", err)
	}
	if err := validateHeader(header); err != nil {
		return Result{}, err
	}

	res := Result{}
	line := 1
	for {
		line++
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			res.Errors = append(res.Errors, RowError{Line: line, Err: err})
			res.Skipped++
			continue
		}
		// pad short rows so column access is safe
		for len(row) < len(teachersHeader) {
			row = append(row, "")
		}

		in, skipReason := parseRow(row)
		if skipReason != nil {
			res.Errors = append(res.Errors, RowError{Line: line, Err: skipReason})
			res.Skipped++
			continue
		}

		if _, err := t.Create(ctx, in); err != nil {
			res.Errors = append(res.Errors, RowError{Line: line, Err: err})
			res.Skipped++
			continue
		}
		res.Inserted++
	}
	return res, nil
}

func validateHeader(got []string) error {
	if len(got) < len(teachersHeader) {
		return fmt.Errorf("header has %d columns, want at least %d", len(got), len(teachersHeader))
	}
	for i, want := range teachersHeader {
		if !strings.EqualFold(strings.TrimSpace(got[i]), want) {
			return fmt.Errorf("header column %d = %q, want %q", i+1, got[i], want)
		}
	}
	return nil
}

// parseRow turns a CSV row into a TeacherInput. Returns a non-nil error if
// the row should be skipped (e.g., empty name, missing required fields).
func parseRow(row []string) (store.TeacherInput, error) {
	name := strings.TrimSpace(row[1])
	if name == "" {
		return store.TeacherInput{}, errors.New("Nama Guru is empty")
	}

	kelompok := strings.TrimSpace(row[3])
	desa := strings.TrimSpace(row[4])
	daerah := strings.TrimSpace(row[5])
	if kelompok == "" || desa == "" || daerah == "" {
		return store.TeacherInput{}, errors.New("Kelompok/Desa/Daerah is empty")
	}

	joinedAt, err := parseIndoDate(row[6])
	if err != nil {
		return store.TeacherInput{}, fmt.Errorf("Tanggal Masuk: %w", err)
	}
	retiredAt, err := parseIndoDate(row[7])
	if err != nil {
		return store.TeacherInput{}, fmt.Errorf("Tanggal Purna: %w", err)
	}

	keterangan := strings.TrimSpace(row[8])
	status := model.TeacherActive
	var notes *string
	if strings.EqualFold(keterangan, "Purna") {
		status = model.TeacherRetired
	} else if keterangan != "" {
		notes = &keterangan
	}

	return store.TeacherInput{
		Name:      name,
		Nickname:  nilIfEmpty(row[2]),
		Kelompok:  kelompok,
		Desa:      desa,
		Daerah:    daerah,
		JoinedAt:  joinedAt,
		RetiredAt: retiredAt,
		Status:    status,
		Notes:     notes,
	}, nil
}

func nilIfEmpty(s string) *string {
	v := strings.TrimSpace(s)
	if v == "" {
		return nil
	}
	return &v
}

// parseIndoDate accepts:
//   - empty                → nil
//   - "2024"               → 2024-01-01
//   - "September 2023"     → 2023-09-01 (month name in Indonesian, any case)
//   - "2024-03-15"         → that ISO date
//
// Anything else returns an error.
func parseIndoDate(raw string) (*time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t, nil
	}
	parts := strings.Fields(s)
	switch len(parts) {
	case 1:
		y, err := strconv.Atoi(parts[0])
		if err != nil || y < 1900 || y > 2200 {
			return nil, fmt.Errorf("unrecognized date %q", s)
		}
		t := time.Date(y, time.January, 1, 0, 0, 0, 0, time.UTC)
		return &t, nil
	case 2:
		m, ok := indoMonths[strings.ToLower(parts[0])]
		if !ok {
			return nil, fmt.Errorf("unknown month %q in date %q", parts[0], s)
		}
		y, err := strconv.Atoi(parts[1])
		if err != nil || y < 1900 || y > 2200 {
			return nil, fmt.Errorf("invalid year in date %q", s)
		}
		t := time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
		return &t, nil
	default:
		return nil, fmt.Errorf("unrecognized date %q", s)
	}
}

var indoMonths = map[string]time.Month{
	"januari":   time.January,
	"februari":  time.February,
	"maret":     time.March,
	"april":     time.April,
	"mei":       time.May,
	"juni":      time.June,
	"juli":      time.July,
	"agustus":   time.August,
	"september": time.September,
	"oktober":   time.October,
	"november":  time.November,
	"desember":  time.December,
}
