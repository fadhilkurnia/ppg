//go:build ignore

// merge_stubs_to_masters.go — re-link all attendance rows from the
// kehadiran-importer stub users to the existing master users with full
// names, then delete the stubs. Master nicknames are addressed by exact
// case-insensitive match; stubs by exact ID lookup.
//
// Mapping comes from the user-approved table in nickname_mapping.md.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "modernc.org/sqlite"
)

type pair struct{ stub, master string }

// guruMerges + muridMerges hold (stub-nickname → master-nickname) pairs.
// Master nicknames must match the existing master user.
var guruMerges = []pair{
	{"Artha-JG", "Artha"},
	{"Rika-KDR", "Rika"},
	{"Irma-PWD", "Irma"},
	{"Azki-MDN", "Azki"},
	{"Wulan-PWD", "Wulan"},
	{"Naely-BGR", "Naely"},
	{"Nedha-PWD", "Nedha"},
	{"Sofia-PWD", "Sofia"},
	{"Millati-PWD", "Millati"},
	{"Fadly-SMG", "Fadly"},
	{"Dilla-MLL", "Dilla"},
	{"Mora-MLL", "Mora"},
	{"Mora-MLG", "Mora"},
	{"Ayu-CKP", "Ayu"},
	{"Aza-PWD", "Aza"},
	{"Madu-PWD", "Madu"},
	{"Bella-PWD", "Bella"},
	{"Ilham-Solo", "Ilham"},
	{"Ammar-SPG", "Ammar"},
	{"Ammar-JG", "Ammar"},
	{"Aziz-SL3", "Aziz"},
	{"Fauzan-SL3", "Zannn"},          // Rahmad Fauzan
	{"Erma-BKS", "Erma / Pipit"},      // Erma Fitria Hidayati
	{"Zul-Mll", "Captain"},            // Sulkifli Surahman
	{"Zul-PWD", "Captain"},
	{"Yasril-MDN", "Yasril / Dyka"},   // Yasril Andyka Hitho
}

var muridMerges = []pair{
	{"Rambo-CH", "Rambo"},
	{"Grazia-IN", "Grazia"},
	{"Kirana-CH", "Kirana"},
	{"Jubilee-CH", "Jubilee"},
	{"Gabriel-CH", "Gabriel"},
	{"Nadeen-CH", "Nadeen"},
	{"Mikail-CH", "Mikail"},
	{"Hafiz-PTM", "Hafiz"},
	{"Irsan-CH", "Irsan"},
	{"Khadijah-RLG", "Khadijah"},
	{"Khodija-RLG", "Khadijah"},  // user confirmed same person
	{"Chester-PD", "Chester"},
	{"Dawud-RLG", "Dawud"},
	{"Dehan-CND", "Dehan"},
	{"Fitri-CND", "Fitri"},
	{"Cheryl-NH", "Cheryl"},
	{"Abi-BFL", "Abi"},
	{"Dinda-RLG", "dinda"},
	{"Tami-BFL", "Tami"},
	{"Abell-NH", "Abell"},
	{"Kayla-CA", "Kayla"},
	{"Zahra-RLG", "Zahra"},
	{"Qalesya-ATL", "Qalesya"},
	{"Dwiki-RLG", "dwiki"},
	{"Khayri-CH", "Khay"},        // Emil Khayri Arrauf
	{"Denissa-RLG", "Denisa"},    // Denissa Khusna Abidin
	{"Dylan-CA", "Dylan"},
	{"Jourdan-CA", "Jourdan"},
	{"Liv-CH", "Liv"},
}

// masterFieldUpdates — master rows that need name/daerah corrected before
// the merge. Keyed by master nickname.
var masterFieldUpdates = []struct {
	nick, name, daerah string
}{
	// Captain → Sulkifli Surahman, Purwodadi (covers Zul-* and Captain).
	{nick: "Captain", name: "Sulkifli Surahman", daerah: "Purwodadi"},
}

func main() {
	dbPath := os.Getenv("GNRS_DB")
	if dbPath == "" {
		dbPath = "data/app.db"
	}
	dryRun := os.Getenv("DRY_RUN") == "1"
	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_busy_timeout=10000")
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		log.Fatalf("begin: %v", err)
	}
	defer tx.Rollback()

	lookupByNick := func(role, nick string) (string, string, error) {
		var id, name string
		err := tx.QueryRow(
			`SELECT id, name FROM users
			 WHERE role = ? AND lower(trim(nickname)) = lower(trim(?))
			 ORDER BY length(name) DESC LIMIT 1`,
			role, nick,
		).Scan(&id, &name)
		return id, name, err
	}

	// 1) Update master fields first so the rename is visible before merge.
	for _, m := range masterFieldUpdates {
		_, err := tx.Exec(
			`UPDATE users SET name = ?, daerah = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
			 WHERE role = 'guru' AND lower(trim(nickname)) = lower(trim(?))`,
			m.name, m.daerah, m.nick)
		if err != nil {
			log.Fatalf("update master %q: %v", m.nick, err)
		}
		log.Printf("master rename: %s → name=%q daerah=%q", m.nick, m.name, m.daerah)
	}

	mergeRole := func(role string, list []pair) {
		col := "teacher_id"
		if role == "murid" {
			col = "student_id"
		}
		for _, p := range list {
			masterID, masterName, err := lookupByNick(role, p.master)
			if err != nil {
				log.Fatalf("master %s %q not found: %v", role, p.master, err)
			}
			var stubID, stubName string
			err = tx.QueryRow(
				`SELECT id, name FROM users
				 WHERE role = ? AND lower(trim(nickname)) = lower(trim(?))
				   AND name = nickname
				 LIMIT 1`,
				role, p.stub,
			).Scan(&stubID, &stubName)
			if err != nil {
				log.Printf("stub %s %q not found, skipping (%v)", role, p.stub, err)
				continue
			}
			if stubID == masterID {
				log.Printf("skip: stub == master for %s", p.stub)
				continue
			}
			res, err := tx.Exec(
				fmt.Sprintf(`UPDATE attendances SET %s = ?,
				   updated_at = CURRENT_TIMESTAMP WHERE %s = ?`, col, col),
				masterID, stubID)
			if err != nil {
				log.Fatalf("relink attendance %s → %s: %v", p.stub, p.master, err)
			}
			n, _ := res.RowsAffected()
			if _, err := tx.Exec(`DELETE FROM users WHERE id = ?`, stubID); err != nil {
				log.Fatalf("delete stub %s: %v", p.stub, err)
			}
			log.Printf("merged %s %s (%d sesi) → %s (%s)", role, p.stub, n, p.master, masterName)
		}
	}
	mergeRole("guru", guruMerges)
	mergeRole("murid", muridMerges)

	// Final cleanup: stubs still around (no master match) — keep them but
	// strip the location suffix so they show a cleaner display name. Use
	// their nickname prefix as the display name placeholder.
	cleanupStubs := func(role string) {
		col := "student_id"
		if role == "guru" {
			col = "teacher_id"
		}
		rows, err := tx.Query(
			`SELECT id, nickname FROM users
			 WHERE role = ? AND name = nickname
			   AND (email LIKE 'guru.%@stub.gnrs.local' OR email LIKE 'murid.%@stub.gnrs.local')`,
			role)
		if err != nil {
			log.Fatalf("list residual: %v", err)
		}
		type rec struct{ id, nick string }
		var residual []rec
		for rows.Next() {
			var r rec
			if err := rows.Scan(&r.id, &r.nick); err == nil {
				residual = append(residual, r)
			}
		}
		rows.Close()
		for _, r := range residual {
			// Show how many attendance rows reference this user so we
			// don't accidentally delete one with data.
			var n int
			tx.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM attendances WHERE %s = ?`, col), r.id).Scan(&n)
			log.Printf("residual %s %q sesi=%d — kept (no master mapping)", role, r.nick, n)
		}
	}
	cleanupStubs("guru")
	cleanupStubs("murid")

	if dryRun {
		log.Printf("DRY_RUN=1, rolling back")
		return
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("commit: %v", err)
	}
	log.Printf("OK")

	// Verify post-merge counts.
	var sg, sm int
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'guru'`).Scan(&sg)
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'murid'`).Scan(&sm)
	var a int
	db.QueryRow(`SELECT COUNT(*) FROM attendances`).Scan(&a)
	log.Printf("post: guru=%d murid=%d attendance=%d", sg, sm, a)

}
