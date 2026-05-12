package bulk

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type stubItem struct {
	Name  string
	Value string
}

type stubImporter struct {
	created   map[string]string
	failOn    map[string]bool
	upserts   int
	createIDs []string
}

func newStub() *stubImporter {
	return &stubImporter{created: map[string]string{}, failOn: map[string]bool{}}
}

func (s *stubImporter) Name() string      { return "stub" }
func (s *stubImporter) Headers() []string { return []string{"name", "value"} }

func (s *stubImporter) ParseRow(rec map[string]string) (stubItem, error) {
	name := strings.TrimSpace(rec["name"])
	if name == "" {
		return stubItem{}, errors.New("name is empty")
	}
	return stubItem{Name: name, Value: rec["value"]}, nil
}

func (s *stubImporter) Upsert(ctx context.Context, item stubItem, mode Mode) (string, bool, error) {
	if s.failOn[item.Name] {
		return "", false, errors.New("forced failure")
	}
	if id, ok := s.created[item.Name]; ok {
		if mode != ModeUpsert {
			return "", false, errors.New("duplicate")
		}
		return id, false, nil
	}
	id := "id-" + item.Name
	s.created[item.Name] = id
	s.createIDs = append(s.createIDs, id)
	s.upserts++
	return id, true, nil
}

func TestProcess_BasicCounts(t *testing.T) {
	csv := "name,value\n" +
		"Alice,1\n" +
		"Bob,2\n" +
		"Carol,3\n" +
		"Alice,4\n" +
		",x\n"

	imp := newStub()
	rep, err := Process[stubItem](context.Background(), strings.NewReader(csv), imp, ModeCreate)
	if err != nil {
		t.Fatalf("Process: %v", err)
	}
	if rep.Summary.Created != 3 {
		t.Errorf("created = %d, want 3", rep.Summary.Created)
	}
	if rep.Summary.Failed != 2 {
		t.Errorf("failed = %d, want 2", rep.Summary.Failed)
	}
	if rep.Summary.Total != 5 {
		t.Errorf("total = %d, want 5", rep.Summary.Total)
	}
}

func TestProcess_UpsertUpdatesExisting(t *testing.T) {
	csv := "name,value\nAlice,1\nAlice,2\n"
	imp := newStub()
	rep, err := Process[stubItem](context.Background(), strings.NewReader(csv), imp, ModeUpsert)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Summary.Created != 1 || rep.Summary.Updated != 1 {
		t.Errorf("created/updated = %d/%d, want 1/1", rep.Summary.Created, rep.Summary.Updated)
	}
}

func TestProcess_DryRunWritesNothing(t *testing.T) {
	csv := "name,value\nAlice,1\nBob,2\n"
	imp := newStub()
	rep, err := Process[stubItem](context.Background(), strings.NewReader(csv), imp, ModeDryRun)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Summary.Skipped != 2 {
		t.Errorf("skipped = %d, want 2", rep.Summary.Skipped)
	}
	if imp.upserts != 0 {
		t.Errorf("upserts = %d, want 0 (dry-run)", imp.upserts)
	}
}

func TestProcess_BOMPrefixedUTF8(t *testing.T) {
	csv := "\xEF\xBB\xBFname,value\nAlice,1\n"
	imp := newStub()
	rep, err := Process[stubItem](context.Background(), strings.NewReader(csv), imp, ModeCreate)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Summary.Created != 1 {
		t.Errorf("created = %d, want 1; got results=%+v", rep.Summary.Created, rep.Results)
	}
}

func TestProcess_EmptyRowsSkipped(t *testing.T) {
	csv := "name,value\nAlice,1\n,\nBob,2\n"
	imp := newStub()
	rep, err := Process[stubItem](context.Background(), strings.NewReader(csv), imp, ModeCreate)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Summary.Created != 2 {
		t.Errorf("created = %d, want 2", rep.Summary.Created)
	}
}

func TestProcess_EmptyCSVReturnsError(t *testing.T) {
	imp := newStub()
	_, err := Process[stubItem](context.Background(), strings.NewReader(""), imp, ModeCreate)
	if err == nil {
		t.Fatal("expected error on empty CSV")
	}
}

func TestProcess_PerRowFailureContinues(t *testing.T) {
	csv := "name,value\nAlice,1\nBob,2\nCarol,3\n"
	imp := newStub()
	imp.failOn["Bob"] = true
	rep, err := Process[stubItem](context.Background(), strings.NewReader(csv), imp, ModeCreate)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Summary.Created != 2 || rep.Summary.Failed != 1 {
		t.Errorf("created/failed = %d/%d, want 2/1", rep.Summary.Created, rep.Summary.Failed)
	}
}

func TestParseMode(t *testing.T) {
	cases := map[string]Mode{
		"":        ModeCreate,
		"create":  ModeCreate,
		"upsert":  ModeUpsert,
		"UPSERT":  ModeUpsert,
		"dry-run": ModeDryRun,
		"dryrun":  ModeDryRun,
	}
	for in, want := range cases {
		got, err := ParseMode(in)
		if err != nil {
			t.Errorf("ParseMode(%q): %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("ParseMode(%q) = %q, want %q", in, got, want)
		}
	}
	if _, err := ParseMode("nope"); err == nil {
		t.Error("expected error on unknown mode")
	}
}

func TestParseIndoDate(t *testing.T) {
	if d, err := ParseIndoDate(""); err != nil || d != nil {
		t.Errorf("empty: got %v, %v", d, err)
	}
	d, err := ParseIndoDate("2024")
	if err != nil || d == nil || d.Year() != 2024 || d.Month() != 1 {
		t.Errorf("year-only: got %v, %v", d, err)
	}
	d, err = ParseIndoDate("September 2023")
	if err != nil || d == nil || d.Year() != 2023 || d.Month() != 9 {
		t.Errorf("month-name: got %v, %v", d, err)
	}
	d, err = ParseIndoDate("2024-03-15")
	if err != nil || d == nil || d.Day() != 15 {
		t.Errorf("ISO: got %v, %v", d, err)
	}
	if _, err := ParseIndoDate("garbage"); err == nil {
		t.Error("expected error on garbage input")
	}
}
