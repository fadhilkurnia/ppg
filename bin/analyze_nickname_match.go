//go:build ignore

// analyze_nickname_match.go — pair every stub-imported guru/murid user
// (nickname format "Prefix-SUFFIX") with the most likely existing master
// user (matching nickname prefix). Outputs a markdown table the user can
// review before we actually merge attendance rows.
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

type user struct {
	id, name, nick, role, daerah string
	stub                         bool
	sesi                         int
}

func main() {
	dbPath := os.Getenv("GNRS_DB")
	if dbPath == "" {
		dbPath = "data/app.db"
	}
	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_busy_timeout=10000")
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer db.Close()

	// Heuristic: stub records were created by the kehadiran importer with
	// name == nickname (e.g., "Tami-BFL" / "Tami-BFL"). Master records
	// have a full name distinct from the nickname.
	rows, err := db.Query(
		`SELECT u.id, u.name, COALESCE(u.nickname,''), u.role, COALESCE(u.daerah,''),
		        CASE WHEN u.email LIKE 'guru.%@stub.gnrs.local'
		             OR u.email LIKE 'murid.%@stub.gnrs.local'
		             OR u.name = COALESCE(u.nickname, '')
		        THEN 1 ELSE 0 END AS stub,
		        (SELECT COUNT(*) FROM attendances a WHERE a.teacher_id = u.id OR a.student_id = u.id) AS sesi
		 FROM users u
		 WHERE u.role IN ('guru','murid')
		 ORDER BY u.role, lower(u.nickname)`)
	if err != nil {
		log.Fatalf("query: %v", err)
	}
	defer rows.Close()

	var all []user
	for rows.Next() {
		var u user
		var stubInt int
		if err := rows.Scan(&u.id, &u.name, &u.nick, &u.role, &u.daerah, &stubInt, &u.sesi); err != nil {
			log.Fatal(err)
		}
		u.stub = stubInt == 1
		all = append(all, u)
	}

	// Split into master + stub per role.
	type bucket struct{ masters, stubs []user }
	by := map[string]*bucket{"guru": {}, "murid": {}}
	for _, u := range all {
		b := by[u.role]
		if u.stub {
			b.stubs = append(b.stubs, u)
		} else {
			b.masters = append(b.masters, u)
		}
	}

	// Index masters by lowercased nickname for prefix match.
	prefixOf := func(nick string) string {
		i := strings.LastIndex(nick, "-")
		if i < 0 {
			return strings.ToLower(strings.TrimSpace(nick))
		}
		return strings.ToLower(strings.TrimSpace(nick[:i]))
	}

	report := func(role string) {
		b := by[role]
		masters := map[string][]*user{}
		for i := range b.masters {
			m := &b.masters[i]
			key := strings.ToLower(strings.TrimSpace(m.nick))
			masters[key] = append(masters[key], m)
		}

		fmt.Printf("\n## %s — Master vs Stub mapping\n\n", strings.ToUpper(role))
		fmt.Printf("| Stub nickname | Sesi | Prefix | → Master (id short) | Master name | Daerah |\n")
		fmt.Printf("|---|---:|---|---|---|---|\n")
		var unmatched []*user
		sort.Slice(b.stubs, func(i, j int) bool { return b.stubs[i].sesi > b.stubs[j].sesi })
		for i := range b.stubs {
			s := &b.stubs[i]
			pre := prefixOf(s.nick)
			ms, ok := masters[pre]
			if !ok || len(ms) == 0 {
				unmatched = append(unmatched, s)
				continue
			}
			pick := ms[0]
			fmt.Printf("| %s | %d | %s | %s | %s | %s |\n",
				s.nick, s.sesi, pre, pick.id[len(pick.id)-6:], pick.name, pick.daerah)
		}
		if len(unmatched) > 0 {
			fmt.Printf("\n### Stubs without master (need user input)\n\n")
			fmt.Printf("| Stub nickname | Sesi | Daerah suffix |\n")
			fmt.Printf("|---|---:|---|\n")
			for _, s := range unmatched {
				fmt.Printf("| %s | %d | %s |\n", s.nick, s.sesi, s.daerah)
			}
		}

		fmt.Printf("\n### Master users with no attendance match\n\n")
		fmt.Printf("| Nickname | Name | Daerah | Sesi langsung |\n")
		fmt.Printf("|---|---|---|---:|\n")
		matched := map[string]bool{}
		for i := range b.stubs {
			pre := prefixOf(b.stubs[i].nick)
			matched[pre] = true
		}
		for i := range b.masters {
			m := &b.masters[i]
			k := strings.ToLower(strings.TrimSpace(m.nick))
			if !matched[k] && m.sesi == 0 {
				fmt.Printf("| %s | %s | %s | %d |\n", m.nick, m.name, m.daerah, m.sesi)
			}
		}
	}
	report("guru")
	report("murid")
}
