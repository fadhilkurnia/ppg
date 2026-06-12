package store

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Budi":        "budi",
		"Pak Budi":    "pakbudi",
		"  A.B-C 12 ": "abc12",
		"":            "",
		"!!!":         "",
		"Núr":         "nr", // non-ascii letters are dropped
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestEmailLocalPartFallback(t *testing.T) {
	if got := emailLocalPart("Budi", "Budi Santoso"); got != "budi" {
		t.Errorf("nickname preferred: got %q, want budi", got)
	}
	if got := emailLocalPart("", "Budi Santoso"); got != "budisantoso" {
		t.Errorf("name fallback: got %q, want budisantoso", got)
	}
	if got := emailLocalPart("   ", "!!!"); got != "user" {
		t.Errorf("user fallback: got %q, want user", got)
	}
}

func usersBackfillDB(t *testing.T) *Users {
	t.Helper()
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return NewUsers(db)
}

func TestBackfillEmails(t *testing.T) {
	users := usersBackfillDB(t)
	ctx := context.Background()

	mk := func(name, nick, email string) {
		var np *string
		if nick != "" {
			np = &nick
		}
		if _, err := users.Create(ctx, UserCreateInput{
			Email: email, Password: "secret123", Name: name, Role: model.RoleMurid, Nickname: np,
		}); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}
	// Two share nickname "Budi" (dedup), one has no nickname (name fallback).
	mk("Budi One", "Budi", "old1@stub.gnrs.local")
	mk("Budi Two", "Budi", "old2@stub.gnrs.local")
	mk("No Nick", "", "old3@stub.gnrs.local")

	n, err := users.BackfillEmails(ctx)
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}
	if n != 3 {
		t.Fatalf("backfilled %d users, want 3", n)
	}

	byName := map[string]string{}
	res, err := users.List(ctx, UserListParams{Limit: 500})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, u := range res.Items {
		byName[u.Name] = u.Email
	}

	// The two "Budi"s must take budi@ and budi2@ (distinct), order by id.
	budis := map[string]bool{byName["Budi One"]: true, byName["Budi Two"]: true}
	if !budis["budi@gnrs.com"] || !budis["budi2@gnrs.com"] || len(budis) != 2 {
		t.Errorf("Budi emails = %q/%q, want budi@gnrs.com + budi2@gnrs.com",
			byName["Budi One"], byName["Budi Two"])
	}
	if byName["No Nick"] != "nonick@gnrs.com" {
		t.Errorf("No Nick email = %q, want nonick@gnrs.com", byName["No Nick"])
	}

	// Idempotent: a second run leaves the same addresses in place.
	if _, err := users.BackfillEmails(ctx); err != nil {
		t.Fatalf("backfill 2: %v", err)
	}
	res2, _ := users.List(ctx, UserListParams{Limit: 500})
	for _, u := range res2.Items {
		if byName[u.Name] != u.Email {
			t.Errorf("not idempotent: %s email changed %q -> %q", u.Name, byName[u.Name], u.Email)
		}
	}
}
