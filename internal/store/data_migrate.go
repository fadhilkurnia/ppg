package store

import (
	"context"
	"database/sql"
	"fmt"

	"golang.org/x/crypto/bcrypt"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

// MigrateLegacyData copies rows from the renamed students_legacy_008 and
// teachers_legacy_008 tables into users, then drops the legacy tables. It's
// idempotent — if the legacy tables don't exist (already migrated or fresh
// DB), the function is a no-op.
//
// All migrated users get a bcrypted "changeme" password (computed once and
// reused across rows). Admins should reset passwords from the Pengguna page.
// The original student.id / teacher.id is preserved as the new user.id so
// any external references stay valid; the email is synthesized from the id
// to satisfy the NOT NULL UNIQUE constraint without colliding.
func MigrateLegacyData(ctx context.Context, db *sql.DB) (int, int, error) {
	hadStudents, err := tableExists(ctx, db, "students_legacy_008")
	if err != nil {
		return 0, 0, fmt.Errorf("check students_legacy_008: %w", err)
	}
	hadTeachers, err := tableExists(ctx, db, "teachers_legacy_008")
	if err != nil {
		return 0, 0, fmt.Errorf("check teachers_legacy_008: %w", err)
	}
	if !hadStudents && !hadTeachers {
		return 0, 0, nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("changeme"), bcrypt.DefaultCost)
	if err != nil {
		return 0, 0, fmt.Errorf("hash default password: %w", err)
	}
	users := NewUsers(db)

	var migratedStudents, migratedTeachers int

	if hadStudents {
		migratedStudents, err = copyStudents(ctx, db, users, string(hash))
		if err != nil {
			return 0, 0, fmt.Errorf("migrate students: %w", err)
		}
		if _, err := db.ExecContext(ctx, `DROP TABLE students_legacy_008`); err != nil {
			return migratedStudents, 0, fmt.Errorf("drop students_legacy_008: %w", err)
		}
	}

	if hadTeachers {
		migratedTeachers, err = copyTeachers(ctx, db, users, string(hash))
		if err != nil {
			return migratedStudents, 0, fmt.Errorf("migrate teachers: %w", err)
		}
		if _, err := db.ExecContext(ctx, `DROP TABLE teachers_legacy_008`); err != nil {
			return migratedStudents, migratedTeachers, fmt.Errorf("drop teachers_legacy_008: %w", err)
		}
	}

	return migratedStudents, migratedTeachers, nil
}

func tableExists(ctx context.Context, db *sql.DB, name string) (bool, error) {
	var n int
	err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func copyStudents(ctx context.Context, db *sql.DB, users *Users, hash string) (int, error) {
	// Phase 1: drain rows into memory before any writes. The DB pool is
	// pinned to a single connection (SetMaxOpenConns=1), so holding `rows`
	// open while issuing INSERTs would deadlock — the cursor pins the
	// connection that createWithHash also needs.
	// Note: the legacy students_legacy_008 table still has joined_at /
	// left_at / leave_reason / status columns, but we deliberately omit
	// them from the projection below — after migration 041 they no longer
	// exist on the destination. The unified-user mechanism represents
	// status as a single `active` boolean, set true here for every
	// migrated row regardless of the source's membership_status.
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, nickname, date_of_birth, gender, level, kelompok,
		        parent_name, parent_phone, parent_email
		   FROM students_legacy_008`)
	if err != nil {
		return 0, err
	}
	inputs := []UserCreateInput{}
	for rows.Next() {
		var id, name, gender string
		var nickname, kelompok, parentName, parentPhone, parentEmail sql.NullString
		var level sql.NullString
		var dob sql.NullTime
		if err := rows.Scan(&id, &name, &nickname, &dob, &gender, &level, &kelompok,
			&parentName, &parentPhone, &parentEmail); err != nil {
			rows.Close()
			return 0, err
		}

		in := UserCreateInput{
			ID:       id,
			Email:    id + "@stub.gnrs.local",
			Name:     name,
			Password: "changeme", // ignored by createWithHash
			Role:     model.RoleMurid,
			Gender:   &gender,
		}
		in.Nickname = nullPtr(nickname)
		in.Kelompok = nullPtr(kelompok)
		in.ParentName = nullPtr(parentName)
		in.ParentPhone = nullPtr(parentPhone)
		in.ParentEmail = nullPtr(parentEmail)
		if dob.Valid {
			v := dob.Time
			in.DateOfBirth = &v
		}
		if level.Valid {
			v := model.StudentLevel(level.String)
			in.Level = &v
		}
		inputs = append(inputs, in)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	for _, in := range inputs {
		if _, err := users.createWithHash(ctx, in, hash); err != nil {
			return 0, fmt.Errorf("insert student %s: %w", in.ID, err)
		}
	}
	return len(inputs), nil
}

func copyTeachers(ctx context.Context, db *sql.DB, users *Users, hash string) (int, error) {
	// Drain first to avoid deadlocking on the single shared connection
	// (see copyStudents for the same dance).
	// teachers_legacy_008 still has joined_at / retired_at / status, but
	// they are omitted from the projection below — see the comment in
	// copyStudents for the rationale. Active=1 is set implicitly by
	// createWithHash for every migrated row.
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, nickname, kelompok, desa, daerah, notes
		   FROM teachers_legacy_008`)
	if err != nil {
		return 0, err
	}
	inputs := []UserCreateInput{}
	for rows.Next() {
		var id, name, kelompok, desa, daerah string
		var nickname, notes sql.NullString
		if err := rows.Scan(&id, &name, &nickname, &kelompok, &desa, &daerah, &notes); err != nil {
			rows.Close()
			return 0, err
		}

		in := UserCreateInput{
			ID:       id,
			Email:    id + "@stub.gnrs.local",
			Name:     name,
			Password: "changeme",
			Role:     model.RoleGuru,
			Kelompok: &kelompok,
			Desa:     &desa,
			Daerah:   &daerah,
		}
		in.Nickname = nullPtr(nickname)
		in.Notes = nullPtr(notes)
		inputs = append(inputs, in)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	for _, in := range inputs {
		if _, err := users.createWithHash(ctx, in, hash); err != nil {
			return 0, fmt.Errorf("insert teacher %s: %w", in.ID, err)
		}
	}
	return len(inputs), nil
}

func nullPtr(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	v := s.String
	return &v
}
