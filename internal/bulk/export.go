package bulk

import (
	"context"
	"encoding/csv"
	"errors"
	"io"
	"net/url"
)

// Exporter streams rows out as CSV. StreamRows is called once per export
// request; the adapter should iterate its store cursor and call write for
// each row without buffering the whole result set.
type Exporter interface {
	Name() string
	Headers() []string
	StreamRows(ctx context.Context, q url.Values, write func([]string) error) error
}

// WriteCSV runs exp.StreamRows and pipes each row through w. The header
// line is emitted first.
func WriteCSV(ctx context.Context, w io.Writer, exp Exporter, q url.Values) error {
	cw := csv.NewWriter(w)
	if err := cw.Write(exp.Headers()); err != nil {
		return err
	}
	err := exp.StreamRows(ctx, q, func(rec []string) error {
		return cw.Write(rec)
	})
	cw.Flush()
	if err != nil {
		return err
	}
	return cw.Error()
}

type DeleteMode string

const (
	DeleteModeArchive DeleteMode = "archive" // soft-archive (status flipped)
	DeleteModeHard    DeleteMode = "hard"    // DELETE FROM
)

func ParseDeleteMode(s string) (DeleteMode, error) {
	switch s {
	case "", string(DeleteModeArchive):
		return DeleteModeArchive, nil
	case string(DeleteModeHard):
		return DeleteModeHard, nil
	}
	return "", errors.New("mode must be 'archive' or 'hard'")
}

type DeleteResult struct {
	ID      string  `json:"id"`
	Outcome Outcome `json:"outcome"`
	Error   string  `json:"error,omitempty"`
}

// Deleter is implemented by entity adapters that support bulk delete.
// BulkDelete must produce one DeleteResult per id in the same order.
type Deleter interface {
	Name() string
	BulkDelete(ctx context.Context, ids []string, mode DeleteMode) []DeleteResult
}

type DeleteSummary struct {
	Total    int `json:"total"`
	Archived int `json:"archived"`
	Hard     int `json:"hard"`
	Skipped  int `json:"skipped"`
	Failed   int `json:"failed"`
}

type DeleteReport struct {
	Summary DeleteSummary  `json:"summary"`
	Results []DeleteResult `json:"results"`
}

// BuildDeleteReport wraps per-id results with a summary. Successful rows
// count under Archived or Hard depending on mode.
func BuildDeleteReport(results []DeleteResult, mode DeleteMode) *DeleteReport {
	out := &DeleteReport{Results: results, Summary: DeleteSummary{Total: len(results)}}
	for _, r := range results {
		switch r.Outcome {
		case OutcomeFailed:
			out.Summary.Failed++
		case OutcomeSkipped:
			out.Summary.Skipped++
		default:
			if mode == DeleteModeHard {
				out.Summary.Hard++
			} else {
				out.Summary.Archived++
			}
		}
	}
	return out
}
