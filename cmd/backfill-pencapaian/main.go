// Command backfill-pencapaian walks every completed sesi (ended_at set,
// kelas_id set) and creates pencapaian rows for each kelas anggota × each
// materi/library item the sesi covered. Idempotent thanks to the unique
// indexes on pencapaian (per murid+materi or per murid+library tuple).
//
// Run once after deploying migration 040.
package main

import (
	"context"
	"database/sql"
	"flag"
	"log"
	"time"

	_ "modernc.org/sqlite"

	"github.com/oklog/ulid/v2"
)

func main() {
	dbPath := flag.String("db", "/app/data/app.db", "Path to SQLite database")
	flag.Parse()

	db, err := sql.Open("sqlite", *dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`PRAGMA foreign_keys=ON`); err != nil {
		log.Fatalf("pragma: %v", err)
	}

	ctx := context.Background()

	// Pre-load: anggota per kelas.
	anggotaByKelas := map[string][]string{}
	rows, err := db.QueryContext(ctx,
		`SELECT kelas_id, murid_user_id FROM kelas_anggota`)
	if err != nil {
		log.Fatalf("anggota: %v", err)
	}
	for rows.Next() {
		var k, m string
		if err := rows.Scan(&k, &m); err != nil {
			log.Fatalf("scan anggota: %v", err)
		}
		anggotaByKelas[k] = append(anggotaByKelas[k], m)
	}
	rows.Close()
	log.Printf("loaded anggota for %d kelas", len(anggotaByKelas))

	// Pre-load: completed diajarkan per sesi for status decision.
	completedKurikulum := map[string]map[string]bool{} // sesi → set(materi)
	completedLibrary := map[string]map[string]bool{}   // sesi → set("kind|ref")
	rows, err = db.QueryContext(ctx,
		`SELECT sesi_id, kind, materi_ajar_id, ref FROM sesi_materi_diajarkan
		  WHERE completed = 1`)
	if err != nil {
		log.Fatalf("diajarkan: %v", err)
	}
	for rows.Next() {
		var sid, kind string
		var mat, ref sql.NullString
		if err := rows.Scan(&sid, &kind, &mat, &ref); err != nil {
			log.Fatalf("scan diajarkan: %v", err)
		}
		if kind == "kurikulum" && mat.Valid {
			if completedKurikulum[sid] == nil {
				completedKurikulum[sid] = map[string]bool{}
			}
			completedKurikulum[sid][mat.String] = true
		} else if ref.Valid {
			if completedLibrary[sid] == nil {
				completedLibrary[sid] = map[string]bool{}
			}
			completedLibrary[sid][kind+"|"+ref.String] = true
		}
	}
	rows.Close()
	log.Printf("loaded completed flags for %d kurikulum + %d library bucket-sets",
		len(completedKurikulum), len(completedLibrary))

	// Walk every completed sesi.
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	rows, err = db.QueryContext(ctx,
		`SELECT id, kelas_id, tanggal, created_by FROM sesi
		  WHERE kelas_id IS NOT NULL AND ended_at IS NOT NULL`)
	if err != nil {
		log.Fatalf("sesi: %v", err)
	}
	type sesiRow struct {
		id, kelas, tanggal string
		createdBy          sql.NullString
	}
	var sesis []sesiRow
	for rows.Next() {
		var sr sesiRow
		if err := rows.Scan(&sr.id, &sr.kelas, &sr.tanggal, &sr.createdBy); err != nil {
			log.Fatalf("scan sesi: %v", err)
		}
		sesis = append(sesis, sr)
	}
	rows.Close()
	log.Printf("walking %d completed sesi", len(sesis))

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Fatalf("begin: %v", err)
	}
	defer tx.Rollback()

	stmtMateri, err := tx.PrepareContext(ctx,
		`SELECT materi_ajar_id FROM sesi_materi WHERE sesi_id = ?`)
	if err != nil {
		log.Fatalf("prep materi: %v", err)
	}
	defer stmtMateri.Close()
	stmtLibrary, err := tx.PrepareContext(ctx,
		`SELECT library_kind, library_aspect, library_ref FROM sesi_library WHERE sesi_id = ?`)
	if err != nil {
		log.Fatalf("prep library: %v", err)
	}
	defer stmtLibrary.Close()

	insMateri, err := tx.PrepareContext(ctx,
		`INSERT INTO pencapaian
		   (id, murid_user_id, materi_ajar_id, status, tanggal, recorded_by,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(murid_user_id, materi_ajar_id) WHERE materi_ajar_id IS NOT NULL
		 DO UPDATE SET
		   status = CASE WHEN excluded.status = 'tuntas' THEN 'tuntas' ELSE pencapaian.status END,
		   tanggal = CASE WHEN pencapaian.tanggal IS NULL OR excluded.tanggal > pencapaian.tanggal
		                  THEN excluded.tanggal ELSE pencapaian.tanggal END,
		   updated_at = excluded.updated_at`)
	if err != nil {
		log.Fatalf("prep insMateri: %v", err)
	}
	defer insMateri.Close()

	insLib, err := tx.PrepareContext(ctx,
		`INSERT INTO pencapaian
		   (id, murid_user_id, library_kind, library_aspect, library_ref, status,
		    tanggal, recorded_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(murid_user_id, library_kind, COALESCE(library_aspect, ''), library_ref)
		 WHERE library_kind IS NOT NULL
		 DO UPDATE SET
		   status = CASE WHEN excluded.status = 'tuntas' THEN 'tuntas' ELSE pencapaian.status END,
		   tanggal = CASE WHEN pencapaian.tanggal IS NULL OR excluded.tanggal > pencapaian.tanggal
		                  THEN excluded.tanggal ELSE pencapaian.tanggal END,
		   updated_at = excluded.updated_at`)
	if err != nil {
		log.Fatalf("prep insLib: %v", err)
	}
	defer insLib.Close()

	totalMateri, totalLib := 0, 0
	for i, sr := range sesis {
		muridList := anggotaByKelas[sr.kelas]
		if len(muridList) == 0 {
			continue
		}
		tanggal := sr.tanggal
		if len(tanggal) > 10 {
			tanggal = tanggal[:10]
		}
		var recordedBy *string
		if sr.createdBy.Valid && sr.createdBy.String != "" {
			s := sr.createdBy.String
			recordedBy = &s
		}

		// Materi (kurikulum).
		mRows, err := stmtMateri.QueryContext(ctx, sr.id)
		if err != nil {
			log.Fatalf("query materi: %v", err)
		}
		var materiIDs []string
		for mRows.Next() {
			var mid string
			if err := mRows.Scan(&mid); err != nil {
				mRows.Close()
				log.Fatalf("scan materi: %v", err)
			}
			materiIDs = append(materiIDs, mid)
		}
		mRows.Close()

		for _, mid := range materiIDs {
			status := "proses"
			if completedKurikulum[sr.id][mid] {
				status = "tuntas"
			}
			for _, mu := range muridList {
				id := ulid.Make().String()
				if _, err := insMateri.ExecContext(ctx,
					id, mu, mid, status, tanggal, recordedBy, now, now,
				); err != nil {
					log.Fatalf("insMateri: %v", err)
				}
				totalMateri++
			}
		}

		// Library.
		lRows, err := stmtLibrary.QueryContext(ctx, sr.id)
		if err != nil {
			log.Fatalf("query library: %v", err)
		}
		type libItem struct {
			kind, ref string
			aspect    sql.NullString
		}
		var items []libItem
		for lRows.Next() {
			var it libItem
			if err := lRows.Scan(&it.kind, &it.aspect, &it.ref); err != nil {
				lRows.Close()
				log.Fatalf("scan library: %v", err)
			}
			items = append(items, it)
		}
		lRows.Close()

		for _, it := range items {
			status := "proses"
			if completedLibrary[sr.id][it.kind+"|"+it.ref] {
				status = "tuntas"
			}
			var aspect any
			if it.aspect.Valid {
				aspect = it.aspect.String
			} else {
				aspect = nil
			}
			for _, mu := range muridList {
				id := ulid.Make().String()
				if _, err := insLib.ExecContext(ctx,
					id, mu, it.kind, aspect, it.ref, status, tanggal, recordedBy, now, now,
				); err != nil {
					log.Fatalf("insLib: %v", err)
				}
				totalLib++
			}
		}

		if (i+1)%500 == 0 {
			log.Printf("…processed %d/%d sesi; pencapaian materi=%d lib=%d",
				i+1, len(sesis), totalMateri, totalLib)
		}
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("commit: %v", err)
	}

	log.Printf("DONE pencapaian writes: materi=%d library=%d", totalMateri, totalLib)
}
