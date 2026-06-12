package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/base64"
	"errors"
)

// Embed the whole seed-data dir so the build doesn't fail when the
// optional logo PNG is absent. SeedInstansiLogo reads the file
// best-effort and no-ops when missing.
//
//go:embed seed-data
var instansiLogoFS embed.FS

// SeedInstansiLogo populates `settings.instansi_logo` with a base64 data
// URL of the embedded PNG, unless the key already has a non-empty value.
// Returns the number of rows changed (0 or 1).
//
// If the seed file is missing or empty, this function silently no-ops —
// the asset is optional and only present when the design team ships an
// updated logo.
func SeedInstansiLogo(ctx context.Context, db *sql.DB) (int, error) {
	raw, err := instansiLogoFS.ReadFile("seed-data/logo_ppg_us.png")
	if err != nil || len(raw) == 0 {
		return 0, nil
	}
	var existing string
	err = db.QueryRowContext(ctx,
		`SELECT value FROM settings WHERE key = 'instansi_logo'`).Scan(&existing)
	if err == nil && existing != "" {
		return 0, nil
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(raw)
	if _, err := db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES ('instansi_logo', ?)
		 ON CONFLICT (key) DO UPDATE SET value = excluded.value,
		   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
		dataURL,
	); err != nil {
		return 0, err
	}
	return 1, nil
}
