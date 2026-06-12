package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"
)

//go:embed seed-data/kurikulum.sql
var kurikulumSeedSQL string

// SeedKurikulum runs the bundled curriculum INSERTs (26 tingkat + 2437
// materi_ajar rows, ported from sitrac-v3's production database) into a
// fresh tingkat table. Idempotent — if any tingkat row already exists, it
// skips. Returns the number of tingkat rows after seeding.
func SeedKurikulum(ctx context.Context, db *sql.DB) (int, error) {
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tingkat`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count tingkat: %w", err)
	}
	if n > 0 {
		return n, nil
	}

	// Split on the end-of-statement marker `);\n` because some materi_ajar
	// values (e.g., subTema) contain literal newlines, so a per-line split
	// would tear those statements in half.
	chunks := strings.Split(kurikulumSeedSQL, ");\n")
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	for i, chunk := range chunks {
		stmt := strings.TrimSpace(chunk)
		if stmt == "" {
			continue
		}
		if !strings.HasSuffix(stmt, ");") {
			stmt += ");"
		}
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return 0, fmt.Errorf("seed kurikulum stmt %d: %w", i+1, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tingkat`).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// tingkatAgeNorm maps the canonical Indonesian age-based tingkat name to:
//   - umur (age in years; 6 covers "≤ 6 Tahun"),
//   - urutan (display order, 0..12),
//   - aliases (legacy names that should be unified into the canonical name).
//
// Both grade-based (e.g., "PAUD (TK)", "SD-1") and English age-based
// (e.g., "7 Years Old") names are folded into the canonical Indonesian form.
var tingkatAgeNorm = []struct {
	Canonical string
	Umur      int
	Urutan    int
	Aliases   []string
}{
	{"≤ 6 Tahun", 6, 0, []string{"PAUD (TK)", "≤ 6 Years Old"}},
	{"7 Tahun", 7, 1, []string{"SD-1", "7 Years Old"}},
	{"8 Tahun", 8, 2, []string{"SD-2", "8 Years Old"}},
	{"9 Tahun", 9, 3, []string{"SD-3", "9 Years Old"}},
	{"10 Tahun", 10, 4, []string{"SD-4", "10 Years Old"}},
	{"11 Tahun", 11, 5, []string{"SD-5", "11 Years Old"}},
	{"12 Tahun", 12, 6, []string{"SD-6", "12 Years Old"}},
	{"13 Tahun", 13, 7, []string{"SMP-1", "13 Years Old"}},
	{"14 Tahun", 14, 8, []string{"SMP-2", "14 Years Old"}},
	{"15 Tahun", 15, 9, []string{"SMP-3", "15 Years Old"}},
	{"16 Tahun", 16, 10, []string{"SMA-1", "16 Years Old"}},
	{"17 Tahun", 17, 11, []string{"SMA-2", "17 Years Old"}},
	{"18 Tahun", 18, 12, []string{"SMA-3", "18 Years Old"}},
}

// NormalizeKurikulumAges folds legacy grade-based and English age-based
// tingkat names into a single Indonesian age-based set and populates the
// umur column. Idempotent: a clean DB short-circuits via the all-canonical
// check; running it twice yields the same result.
//
// Returns (canonicalCount, foldedCount): the number of canonical tingkat
// rows after the run, and how many materi_ajar references were rewritten.
func NormalizeKurikulumAges(ctx context.Context, db *sql.DB) (int, int, error) {
	// Short-circuit when there is nothing to fold: every alias is absent
	// and every canonical row already has a non-null umur set.
	needsWork := false
	for _, e := range tingkatAgeNorm {
		for _, alias := range e.Aliases {
			var c int
			if err := db.QueryRowContext(ctx,
				`SELECT COUNT(*) FROM tingkat WHERE nama = ?`, alias).Scan(&c); err != nil {
				return 0, 0, fmt.Errorf("check alias %q: %w", alias, err)
			}
			if c > 0 {
				needsWork = true
				break
			}
		}
		if needsWork {
			break
		}
		var nullUmur int
		if err := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM tingkat WHERE nama = ? AND umur IS NULL`, e.Canonical).Scan(&nullUmur); err != nil {
			return 0, 0, fmt.Errorf("check umur for %q: %w", e.Canonical, err)
		}
		if nullUmur > 0 {
			needsWork = true
			break
		}
	}
	if !needsWork {
		var canon int
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tingkat WHERE umur IS NOT NULL`).Scan(&canon)
		return canon, 0, nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	folded := 0
	for _, e := range tingkatAgeNorm {
		// Rewrite materi_ajar refs from each alias to the canonical name.
		for _, alias := range e.Aliases {
			if alias == e.Canonical {
				continue
			}
			res, err := tx.ExecContext(ctx,
				`UPDATE materi_ajar SET tingkat = ? WHERE tingkat = ?`, e.Canonical, alias)
			if err != nil {
				return 0, 0, fmt.Errorf("rewrite materi_ajar %q→%q: %w", alias, e.Canonical, err)
			}
			n, _ := res.RowsAffected()
			folded += int(n)
		}

		// Collapse tingkat rows: keep the lowest-id row matching any
		// alias or canonical, rename it to canonical, set umur+urutan,
		// delete the rest. Lowest id is just a stable, deterministic pick.
		names := append([]string{e.Canonical}, e.Aliases...)
		placeholders := strings.Repeat("?,", len(names))
		placeholders = placeholders[:len(placeholders)-1]
		nameArgs := make([]any, len(names))
		for i, n := range names {
			nameArgs[i] = n
		}
		var keepID sql.NullString
		err = tx.QueryRowContext(ctx,
			`SELECT id FROM tingkat WHERE nama IN (`+placeholders+`) ORDER BY id ASC LIMIT 1`,
			nameArgs...).Scan(&keepID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, 0, fmt.Errorf("pick keep row for %q: %w", e.Canonical, err)
		}
		if !keepID.Valid {
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE tingkat SET nama = ?, umur = ?, urutan = ? WHERE id = ?`,
			e.Canonical, e.Umur, e.Urutan, keepID.String); err != nil {
			return 0, 0, fmt.Errorf("update keep row %q: %w", e.Canonical, err)
		}
		delArgs := append([]any{keepID.String}, nameArgs...)
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM tingkat WHERE id <> ? AND nama IN (`+placeholders+`)`,
			delArgs...); err != nil {
			return 0, 0, fmt.Errorf("delete dup rows for %q: %w", e.Canonical, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, 0, fmt.Errorf("commit: %w", err)
	}

	var canon int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tingkat WHERE umur IS NOT NULL`).Scan(&canon); err != nil {
		return 0, 0, err
	}
	return canon, folded, nil
}
