package store

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"
)

// haditsSeedGz is the gzipped, SQLite-compatible INSERT bundle produced by
// bin/convert_hadits.go from sitrac-v3's PostgreSQL dump. Roughly 27 MB
// compressed → 117 MB uncompressed → ~40k hadits across 15 kitab.
//
//go:embed seed-data/hadits.sql.gz
var haditsSeedGz []byte

// SeedHadits decompresses and replays haditsSeedGz into hadits_kitab,
// hadits_bab, hadits, and compact_ajar. Idempotent: replays only when
// BOTH hadits and compact_ajar are empty (so a fresh compact_ajar
// migration on an already-seeded DB still gets backfilled). All INSERTs use
// `INSERT OR IGNORE` so re-runs don't duplicate existing rows.
func SeedHadits(ctx context.Context, db *sql.DB) (int, int, int, int, error) {
	var nHadits, nCompact int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM hadits_kitab`).Scan(&nHadits); err != nil {
		return 0, 0, 0, 0, err
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM compact_ajar`).Scan(&nCompact); err != nil {
		return 0, 0, 0, 0, err
	}
	if nHadits > 0 && nCompact > 0 {
		return 0, 0, 0, 0, nil
	}
	if len(haditsSeedGz) == 0 {
		return 0, 0, 0, 0, errors.New("hadits seed bundle is empty")
	}

	gz, err := gzip.NewReader(bytes.NewReader(haditsSeedGz))
	if err != nil {
		return 0, 0, 0, 0, fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer tx.Rollback()

	br := bufio.NewReaderSize(gz, 1<<20)
	var kitab, bab, hadits, compact int

	// Quote-aware statement splitter. pg_dump emits hadith rows whose
	// terjemahan strings contain literal newlines; we accumulate until the
	// statement ends with `;` outside a single-quoted region. PostgreSQL
	// quoting uses doubled '' inside literals (no backslash escapes), which
	// SQLite supports identically.
	var stmt strings.Builder
	inQuote := false
	finish := func() error {
		s := strings.TrimSpace(stmt.String())
		stmt.Reset()
		if s == "" {
			return nil
		}
		if strings.HasPrefix(s, "--") || s == "BEGIN TRANSACTION;" || s == "COMMIT;" {
			return nil
		}
		if _, err := tx.ExecContext(ctx, s); err != nil {
			return fmt.Errorf("seed exec: %w (stmt: %s)", err, truncate(s, 200))
		}
		switch {
		case strings.HasPrefix(s, "INSERT OR IGNORE INTO hadits_kitab"):
			kitab++
		case strings.HasPrefix(s, "INSERT OR IGNORE INTO hadits_bab"):
			bab++
		case strings.HasPrefix(s, "INSERT OR IGNORE INTO hadits "):
			hadits++
		case strings.HasPrefix(s, "INSERT OR IGNORE INTO compact_ajar"):
			compact++
		}
		return nil
	}

	for {
		chunk, err := br.ReadString('\n')
		if len(chunk) > 0 {
			// Walk the chunk char-by-char tracking quote state so we can
			// detect a real terminator ';\n' (or ';' followed by line end).
			for i := 0; i < len(chunk); i++ {
				c := chunk[i]
				stmt.WriteByte(c)
				if c == '\'' {
					// Handle the '' escape (a single quote within a string).
					if inQuote && i+1 < len(chunk) && chunk[i+1] == '\'' {
						stmt.WriteByte(chunk[i+1])
						i++
						continue
					}
					inQuote = !inQuote
				}
				if !inQuote && c == ';' {
					if ferr := finish(); ferr != nil {
						return 0, 0, 0, 0, ferr
					}
				}
			}
		}
		if err != nil {
			// EOF or read error.
			break
		}
	}
	if stmt.Len() > 0 {
		if ferr := finish(); ferr != nil {
			return 0, 0, 0, 0, ferr
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, 0, 0, err
	}
	return kitab, bab, hadits, compact, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
