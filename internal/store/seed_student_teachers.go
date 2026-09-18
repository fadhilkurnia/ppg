package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/oklog/ulid/v2"
)

type InitialStudentTeacherPair struct {
	TeacherID   string
	StudentID   string
	TeacherName string
	StudentName string
}

// InitialStudentTeacherMappings contains the pre-defined 37 M:N assignments.
var InitialStudentTeacherMappings = []InitialStudentTeacherPair{
	// 1. Ilham
	{TeacherID: "01KX78S5BW8JD9KV7E3EBHPEVD", StudentID: "01KX78S5CVWHPS8K62KMDMZMBS", TeacherName: "Ilham", StudentName: "Dylan"},
	{TeacherID: "01KX78S5BW8JD9KV7E3EBHPEVD", StudentID: "01KX78S5CR3STZSBPE04Q12E61", TeacherName: "Ilham", StudentName: "Chester"},
	{TeacherID: "01KX78S5BW8JD9KV7E3EBHPEVD", StudentID: "01KX78S5CZ3FA661R7JBM39BPP", TeacherName: "Ilham", StudentName: "Jourdan"},

	// 2. Evan
	{TeacherID: "01KX78S5BV20AZMEW64DN437T9", StudentID: "01KX78S5D2HQJF03JXTNA98E9A", TeacherName: "Evan", StudentName: "Tami"},

	// 3. Fauzan
	{TeacherID: "01KX78S5BZF5SMNV2YF7GEK8Y2", StudentID: "01KX78S5D4YSM8J7YR86G8A43A", TeacherName: "Fauzan", StudentName: "Mikail"},

	// 4. Erma Mora
	{TeacherID: "01KX78S5BTA78D1MEN7H2HD8SW", StudentID: "01KX78S5D0GDX9FEKCSZTHFQZW", TeacherName: "Erma Mora", StudentName: "Khadijah"},
	{TeacherID: "01KX78S5BTA78D1MEN7H2HD8SW", StudentID: "01KX78S5D4YSM8J7YR8527Q3GD", TeacherName: "Erma Mora", StudentName: "Cheryl"},

	// 5. Ayu
	{TeacherID: "01KX78S5BTA78D1MEN7DFC8E32", StudentID: "01KX78S5CQGRPFZK2BJBAWG4VS", TeacherName: "Ayu", StudentName: "Kayla"},
	{TeacherID: "01KX78S5BTA78D1MEN7DFC8E32", StudentID: "01KX78S5CQGRPFZK2BJB47ARR5", TeacherName: "Ayu", StudentName: "Abell"},
	{TeacherID: "01KX78S5BTA78D1MEN7DFC8E32", StudentID: "01KX78S5CN6AF7G511Z9K1JPF1", TeacherName: "Ayu", StudentName: "Afiqa"},

	// 6. Aza
	{TeacherID: "01KX78S5BTA78D1MEN7F9V28N0", StudentID: "01KX78S5D2HQJF03JXTP2JHDZC", TeacherName: "Aza", StudentName: "Kirana"},
	{TeacherID: "01KX78S5BTA78D1MEN7F9V28N0", StudentID: "01KX78S5CWHF3PKVHP1QPEA3JN", TeacherName: "Aza", StudentName: "Rambo"},
	{TeacherID: "01KX78S5BTA78D1MEN7F9V28N0", StudentID: "01KX78S5CN6AF7G511Z9K1JPF1", TeacherName: "Aza", StudentName: "Afiqa"},
	{TeacherID: "01KX78S5BTA78D1MEN7F9V28N0", StudentID: "01KX78S5D4YSM8J7YR86G8A43A", TeacherName: "Aza", StudentName: "Mikail"},

	// 7. Rika
	{TeacherID: "01KX78S5BZF5SMNV2YFA3F0SV6", StudentID: "01KX78S5CX5S13WSV7P5Q6V7WZ", TeacherName: "Rika", StudentName: "Fitri"},
	{TeacherID: "01KX78S5BZF5SMNV2YFA3F0SV6", StudentID: "01KX78S5D511DE1PKXY1AQNJ9A", TeacherName: "Rika", StudentName: "Nadeen"},

	// 8. Fadly
	{TeacherID: "01KX78S5BW8JD9KV7E3DQV5GJ7", StudentID: "01KX78S5CX5S13WSV7P9PKCG5D", TeacherName: "Fadly", StudentName: "Gabriel"},
	{TeacherID: "01KX78S5BW8JD9KV7E3DQV5GJ7", StudentID: "01KX78S5CPBH272YFWTA0AW5J7", TeacherName: "Fadly", StudentName: "Hafiz"},

	// 9. Aziz
	{TeacherID: "01KX78S5BXDKNNC021W5QTQVRB", StudentID: "01KX78S5CS5SD1SV9DE9HN0FGA", TeacherName: "Aziz", StudentName: "Dehan"},

	// 10. Ammar
	{TeacherID: "01KX78S5BY2TS3ED2380GCGTWT", StudentID: "01KX78S5CS5SD1SV9DE7K3D02Z", TeacherName: "Ammar", StudentName: "Dawud"},
	{TeacherID: "01KX78S5BY2TS3ED2380GCGTWT", StudentID: "01KX78S5CVWHPS8K62KJXA5X4B", TeacherName: "Ammar", StudentName: "Dwiki"},
	{TeacherID: "01KX78S5BY2TS3ED2380GCGTWT", StudentID: "01KX78S5CWHF3PKVHP1QPEA3JN", TeacherName: "Ammar", StudentName: "Rambo"},

	// 11. Azki
	{TeacherID: "01KX78S5BZF5SMNV2YF78FZGTV", StudentID: "01KX78S5CTFEPK8DKEY83K7YZ8", TeacherName: "Azki", StudentName: "Denissa"},
	{TeacherID: "01KX78S5BZF5SMNV2YF78FZGTV", StudentID: "01KX78S5CR3STZSBPE04Q12E61", TeacherName: "Azki", StudentName: "Chester"},
	{TeacherID: "01KX78S5BZF5SMNV2YF78FZGTV", StudentID: "01KX78S5D511DE1PKXY1AQNJ9A", TeacherName: "Azki", StudentName: "Nadeen"},

	// 12. Artha
	{TeacherID: "01KX78S5BTA78D1MEN7CNMJVZY", StudentID: "01KX78S5CVWHPS8K62KJXA5X4B", TeacherName: "Artha", StudentName: "Dwiki"},
	{TeacherID: "01KX78S5BTA78D1MEN7CNMJVZY", StudentID: "01KX78S5CY1P8ENKKJWS77T2QP", TeacherName: "Artha", StudentName: "Irsan"},
	{TeacherID: "01KX78S5BTA78D1MEN7CNMJVZY", StudentID: "01KX78S5CTFEPK8DKEY83K7YZ8", TeacherName: "Artha", StudentName: "Denissa"},
	{TeacherID: "01KX78S5BTA78D1MEN7CNMJVZY", StudentID: "01KX78S5CZ3FA661R7JCJP4Z51", TeacherName: "Artha", StudentName: "Jubilee"},
	{TeacherID: "01KX78S5BTA78D1MEN7CNMJVZY", StudentID: "01KX78S5D30VQJ166WB65GNZ9T", TeacherName: "Artha", StudentName: "Liv"},

	// 13. Erma Fitria
	{TeacherID: "01KX78S5BV20AZMEW64BJJMHA0", StudentID: "01KX78S5CTFEPK8DKEY8S7ZEEA", TeacherName: "Erma Fitria", StudentName: "Dinda"},
	{TeacherID: "01KX78S5BV20AZMEW64BJJMHA0", StudentID: "01KX78S5D6235MV7NZKMYGRXKV", TeacherName: "Erma Fitria", StudentName: "Qalesya"},
	{TeacherID: "01KX78S5BV20AZMEW64BJJMHA0", StudentID: "01KX78S5CQGRPFZK2BJB47ARR5", TeacherName: "Erma Fitria", StudentName: "Abell"},
	{TeacherID: "01KX78S5BV20AZMEW64BJJMHA0", StudentID: "01KX78S5D4YSM8J7YR8527Q3GD", TeacherName: "Erma Fitria", StudentName: "Cheryl"},
	{TeacherID: "01KX78S5BV20AZMEW64BJJMHA0", StudentID: "01KX78S5CTFEPK8DKEY83K7YZ8", TeacherName: "Erma Fitria", StudentName: "Denissa"},

	// 14. Sifa / Sofia
	{TeacherID: "01KX78S5C1B1WGRDCRCW5TJ72B", StudentID: "01KX78S5D4YSM8J7YR8527Q3GD", TeacherName: "Sifa / Sofia", StudentName: "Cheryl"},
	{TeacherID: "01KX78S5C1B1WGRDCRCW5TJ72B", StudentID: "01KX78S5CQGRPFZK2BJB47ARR5", TeacherName: "Sifa / Sofia", StudentName: "Abell"},

	// 15. Sulkifli / Zul
	{TeacherID: "01KX78S5C1B1WGRDCRCYN1E3Y9", StudentID: "01KX78S5CY1P8ENKKJWS77T2QP", TeacherName: "Sulkifli / Zul", StudentName: "Irsan"},
	{TeacherID: "01KX78S5C1B1WGRDCRCYN1E3Y9", StudentID: "01KX78S5CY1P8ENKKJWRG38Y9M", TeacherName: "Sulkifli / Zul", StudentName: "Grazia"},
	{TeacherID: "01KX78S5C1B1WGRDCRCYN1E3Y9", StudentID: "01KX78S5D6235MV7NZKNRDD282", TeacherName: "Sulkifli / Zul", StudentName: "Abi"},

	// 16. Yasril
	{TeacherID: "01KX78S5C2E8Q9M0WHXXMWSNS5", StudentID: "01KX78S5D6235MV7NZKNRDD282", TeacherName: "Yasril", StudentName: "Abi"},
}

// SeedStudentTeachers inserts the initial M:N assignments idempotently.
// If both the teacher and student exist, the relation is inserted if not already present.
func SeedStudentTeachers(ctx context.Context, db *sql.DB) (int, error) {
	now := time.Now().UTC()
	inserted := 0

	stmt, err := db.PrepareContext(ctx,
		`INSERT OR IGNORE INTO student_teachers (id, student_id, teacher_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare seed stmt: %w", err)
	}
	defer stmt.Close()

	checkStudentStmt, err := db.PrepareContext(ctx, `SELECT 1 FROM students WHERE id = ?`)
	if err != nil {
		return 0, fmt.Errorf("prepare check student: %w", err)
	}
	defer checkStudentStmt.Close()

	checkTeacherStmt, err := db.PrepareContext(ctx, `SELECT 1 FROM teachers WHERE id = ?`)
	if err != nil {
		return 0, fmt.Errorf("prepare check teacher: %w", err)
	}
	defer checkTeacherStmt.Close()

	for _, pair := range InitialStudentTeacherMappings {
		var dummy int
		if err := checkTeacherStmt.QueryRowContext(ctx, pair.TeacherID).Scan(&dummy); err != nil {
			continue // teacher not in this db (e.g. unit test or custom env), skip gracefully
		}
		if err := checkStudentStmt.QueryRowContext(ctx, pair.StudentID).Scan(&dummy); err != nil {
			continue // student not in this db, skip gracefully
		}

		id := ulid.Make().String()
		res, err := stmt.ExecContext(ctx, id, pair.StudentID, pair.TeacherID, now, now)
		if err != nil {
			return inserted, fmt.Errorf("seed student teacher (%s, %s): %w", pair.StudentID, pair.TeacherID, err)
		}
		n, _ := res.RowsAffected()
		if n > 0 {
			inserted++
		}
	}

	return inserted, nil
}
