//go:build ignore

package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func main() {
	db, err := sql.Open("sqlite", "data/app.db?_journal=WAL")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	rows, _ := db.Query(`SELECT nickname, name, role, email FROM users WHERE role IN ('guru','murid') ORDER BY nickname`)
	defer rows.Close()
	for rows.Next() {
		var nick, name, role, email sql.NullString
		rows.Scan(&nick, &name, &role, &email)
		fmt.Printf("%-30s | %-25s | %-6s | %s\n", nick.String, name.String, role.String, email.String)
	}
}
