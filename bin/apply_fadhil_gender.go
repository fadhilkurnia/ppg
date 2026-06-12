//go:build ignore

// apply_fadhil_gender.go — port the gender backfill list from
// fadhilkurnia/ppg migration 006_add_gender.up.sql to our local
// users table. Matches by full name (case-insensitive).
package main

import (
	"database/sql"
	"log"
	"os"

	_ "modernc.org/sqlite"
)

var male = []string{
	"Ahmad Hafiz Alexis",
	"Chester Damsyik",
	"Dawud Sofyan Abidin",
	"Dehan Satria Wiraputra",
	"Dwiki Yusuf Abidin",
	"Dylan",
	"Emil Khayri Arrauf",
	"Emir Rambo Althario",
	"Gabriel Khidhir Kusumo-Aji",
	"Irsan Haqi",
	"Jourdan",
	"Kaisar Fatih Kaysan",
	"Khatami Syahrul",
	"Mikail Yusuf Kusumo-Aji",
	"Syahrial abisha",
}

var female = []string{
	"Afiqa Kamilatunnisa Hafidza",
	"Bellycia Chloe Anaya",
	"Callista Kayla Permana",
	"Denissa Khusna Abidin",
	"Dinda Asyah Abidin",
	"Fitri Aisyah",
	"Grazia Annafia Gyanne",
	"Jubilee Hung",
	"Khadijah Ameera",
	"Khairuna Meivy Kamila",
	"Kirana Aisyah Kusumo-Aji",
	"Kizmira Fayra Kanaya",
	"Liv",
	"Michelle Cheryl Anaya",
	"Nadeen Haqi",
	"Qalesya Hamraa Fajarudin",
	"Zahra Evanto",
}

func main() {
	dbPath := os.Getenv("GNRS_DB")
	if dbPath == "" {
		dbPath = "data/app.db"
	}
	db, err := sql.Open("sqlite", dbPath+"?_journal=WAL&_busy_timeout=10000")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		log.Fatal(err)
	}
	defer tx.Rollback()

	apply := func(label string, names []string, gender string) {
		hits := 0
		miss := []string{}
		for _, n := range names {
			res, err := tx.Exec(
				`UPDATE users SET gender = ?,
				   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
				 WHERE role = 'murid' AND lower(name) = lower(?)`,
				gender, n)
			if err != nil {
				log.Fatalf("%s: %v", n, err)
			}
			r, _ := res.RowsAffected()
			if r > 0 {
				hits++
			} else {
				miss = append(miss, n)
			}
		}
		log.Printf("%s: matched %d/%d", label, hits, len(names))
		for _, m := range miss {
			log.Printf("  miss: %s", m)
		}
	}

	apply("male", male, "male")
	apply("female", female, "female")

	if err := tx.Commit(); err != nil {
		log.Fatal(err)
	}

	var m, f int
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE role='murid' AND gender='male'`).Scan(&m)
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE role='murid' AND gender='female'`).Scan(&f)
	log.Printf("post: male=%d female=%d", m, f)
}
