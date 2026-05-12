// Package bulk implements a generic CSV import / export pipeline that any
// entity can plug into by satisfying the Importer or Exporter interface.
//
// The handler layer (internal/handler) wires HTTP routes around these
// pieces; the CLI (cmd/server) uses the same Process function so there is
// one code path for "ingest a CSV row by row and report per-row outcomes".
package bulk

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

type Outcome string

const (
	OutcomeCreated Outcome = "created"
	OutcomeUpdated Outcome = "updated"
	OutcomeSkipped Outcome = "skipped"
	OutcomeFailed  Outcome = "failed"
)

type Mode string

const (
	ModeCreate Mode = "create"  // fail on duplicate key (default)
	ModeUpsert Mode = "upsert"  // update if key matches; insert otherwise
	ModeDryRun Mode = "dry-run" // validate every row, write nothing
)

func ParseMode(s string) (Mode, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", string(ModeCreate):
		return ModeCreate, nil
	case string(ModeUpsert):
		return ModeUpsert, nil
	case string(ModeDryRun), "dryrun", "dry_run":
		return ModeDryRun, nil
	}
	return "", fmt.Errorf("unknown mode %q (want create, upsert, or dry-run)", s)
}

type RowResult struct {
	Row     int     `json:"row"`     // 1-based, header is row 0
	Outcome Outcome `json:"outcome"`
	ID      string  `json:"id,omitempty"`
	Error   string  `json:"error,omitempty"`
}

type Summary struct {
	Total   int `json:"total"`
	Created int `json:"created"`
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
}

type Report struct {
	Summary Summary     `json:"summary"`
	Results []RowResult `json:"results"`
}

// Importer is implemented by each entity adapter. T is the parsed/validated
// row type that Upsert consumes.
type Importer[T any] interface {
	Name() string
	Headers() []string
	ParseRow(rec map[string]string) (T, error)
	Upsert(ctx context.Context, item T, mode Mode) (id string, created bool, err error)
}

// Process reads a CSV from r, walks the rows through imp, and returns a
// per-row report. It never aborts on row errors — a single bad row is
// recorded as failed and the rest continue.
//
// In ModeDryRun, Upsert is never called: every parsed row becomes a
// Skipped outcome, and parse failures still become Failed.
func Process[T any](ctx context.Context, r io.Reader, imp Importer[T], mode Mode) (*Report, error) {
	stripped, err := stripBOM(r)
	if err != nil {
		return nil, err
	}
	cr := csv.NewReader(stripped)
	cr.TrimLeadingSpace = true
	cr.FieldsPerRecord = -1

	head, err := cr.Read()
	if err != nil {
		if errors.Is(err, io.EOF) {
			return nil, errors.New("csv is empty")
		}
		return nil, fmt.Errorf("read header: %w", err)
	}
	for i, h := range head {
		head[i] = strings.TrimSpace(h)
	}

	report := &Report{Results: []RowResult{}}
	row := 0
	for {
		if err := ctx.Err(); err != nil {
			return report, err
		}
		rec, err := cr.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		row++
		if err != nil {
			report.Results = append(report.Results, RowResult{
				Row: row, Outcome: OutcomeFailed, Error: err.Error(),
			})
			continue
		}
		if isEmptyRecord(rec) {
			continue
		}
		m := make(map[string]string, len(head))
		for i, h := range head {
			if i < len(rec) {
				m[h] = strings.TrimSpace(rec[i])
			}
		}
		item, err := imp.ParseRow(m)
		if err != nil {
			report.Results = append(report.Results, RowResult{
				Row: row, Outcome: OutcomeFailed, Error: err.Error(),
			})
			continue
		}
		if mode == ModeDryRun {
			report.Results = append(report.Results, RowResult{
				Row: row, Outcome: OutcomeSkipped,
			})
			continue
		}
		rowCtx, cancel := context.WithTimeout(ctx, perRowBudget)
		id, created, err := imp.Upsert(rowCtx, item, mode)
		cancel()
		switch {
		case err != nil:
			report.Results = append(report.Results, RowResult{
				Row: row, Outcome: OutcomeFailed, Error: err.Error(),
			})
		case created:
			report.Results = append(report.Results, RowResult{
				Row: row, Outcome: OutcomeCreated, ID: id,
			})
		default:
			report.Results = append(report.Results, RowResult{
				Row: row, Outcome: OutcomeUpdated, ID: id,
			})
		}
	}
	report.Summary = summarise(report.Results)
	return report, nil
}

// perRowBudget bounds a single row's Upsert. SQLite under load can blow
// past 100ms; 5s keeps slow writes from being marked failed while still
// bounding stuck calls.
const perRowBudget = 5 * time.Second

func summarise(results []RowResult) Summary {
	s := Summary{Total: len(results)}
	for _, r := range results {
		switch r.Outcome {
		case OutcomeCreated:
			s.Created++
		case OutcomeUpdated:
			s.Updated++
		case OutcomeSkipped:
			s.Skipped++
		case OutcomeFailed:
			s.Failed++
		}
	}
	return s
}

func isEmptyRecord(rec []string) bool {
	for _, v := range rec {
		if strings.TrimSpace(v) != "" {
			return false
		}
	}
	return true
}

// stripBOM peels a UTF-8 BOM off r if present. Excel writes BOM-prefixed
// CSVs; without this the first header would include the BOM bytes and the
// row->column mapping would silently break.
func stripBOM(r io.Reader) (io.Reader, error) {
	buf := make([]byte, 3)
	n, err := io.ReadFull(r, buf)
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return prefixReader(buf[:n], nil), nil
	}
	if err != nil {
		return nil, err
	}
	if buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF {
		return r, nil
	}
	return prefixReader(buf, r), nil
}

func prefixReader(prefix []byte, rest io.Reader) io.Reader {
	if rest == nil {
		return &bytePrefix{p: prefix}
	}
	return io.MultiReader(&bytePrefix{p: prefix}, rest)
}

type bytePrefix struct {
	p []byte
	i int
}

func (b *bytePrefix) Read(p []byte) (int, error) {
	if b.i >= len(b.p) {
		return 0, io.EOF
	}
	n := copy(p, b.p[b.i:])
	b.i += n
	return n, nil
}
