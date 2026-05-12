package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

func newScopesDB(t *testing.T) *Scopes {
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
	return NewScopes(db)
}

func TestScopesSeed(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	_, total, err := s.List(ctx, ScopeListParams{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 9 {
		t.Fatalf("seed total = %d, want 9 (1 daerah + 4 desa + 4 kelompok)", total)
	}
}

func TestScopesKindValidation(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	parent := "SCOPE_DAERAH_AMERICAS"
	_, err := s.Create(ctx, CreateScopeInput{Kind: model.ScopeKindDaerah, Name: "X", ParentID: &parent})
	if !errors.Is(err, ErrInvalidParent) {
		t.Errorf("daerah w/ parent: err = %v, want ErrInvalidParent", err)
	}

	_, err = s.Create(ctx, CreateScopeInput{Kind: model.ScopeKindDesa, Name: "Orphan"})
	if !errors.Is(err, ErrInvalidParent) {
		t.Errorf("desa w/o parent: err = %v, want ErrInvalidParent", err)
	}

	_, err = s.Create(ctx, CreateScopeInput{Kind: model.ScopeKindKelompok, Name: "Bad", ParentID: &parent})
	if !errors.Is(err, ErrInvalidParent) {
		t.Errorf("kelompok w/ daerah parent: err = %v, want ErrInvalidParent", err)
	}
}

func TestScopesCreateValid(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	americas := "SCOPE_DAERAH_AMERICAS"
	desa, err := s.Create(ctx, CreateScopeInput{Kind: model.ScopeKindDesa, Name: "Florida", ParentID: &americas})
	if err != nil {
		t.Fatalf("create desa: %v", err)
	}
	if desa.Kind != model.ScopeKindDesa || desa.Name != "Florida" {
		t.Errorf("unexpected: %+v", desa)
	}

	kel, err := s.Create(ctx, CreateScopeInput{Kind: model.ScopeKindKelompok, Name: "Miami", ParentID: &desa.ID})
	if err != nil {
		t.Fatalf("create kelompok: %v", err)
	}
	if kel.ParentID == nil || *kel.ParentID != desa.ID {
		t.Errorf("parent mismatch: %+v", kel)
	}
}

func TestScopesAncestors(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	anc, err := s.Ancestors(ctx, "SCOPE_KEL_CALIFORNIA")
	if err != nil {
		t.Fatalf("ancestors: %v", err)
	}
	if len(anc) != 3 {
		t.Fatalf("ancestors length = %d, want 3", len(anc))
	}
	if anc[0].Kind != model.ScopeKindDaerah {
		t.Errorf("root kind = %v, want daerah", anc[0].Kind)
	}
	if anc[len(anc)-1].ID != "SCOPE_KEL_CALIFORNIA" {
		t.Errorf("leaf id = %v", anc[len(anc)-1].ID)
	}
}

func TestScopesDescendants(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	desc, err := s.Descendants(ctx, "SCOPE_DAERAH_AMERICAS")
	if err != nil {
		t.Fatalf("descendants: %v", err)
	}
	if len(desc) != 8 {
		t.Errorf("descendants length = %d, want 8 (4 desa + 4 kelompok)", len(desc))
	}
}

func TestScopesArchiveBlocksWithChildren(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	err := s.Archive(ctx, "SCOPE_DESA_WEST")
	if !errors.Is(err, ErrHasDescendants) {
		t.Errorf("archive parent: err = %v, want ErrHasDescendants", err)
	}

	if err := s.Archive(ctx, "SCOPE_KEL_CALIFORNIA"); err != nil {
		t.Errorf("archive leaf: %v", err)
	}
	got, err := s.Get(ctx, "SCOPE_KEL_CALIFORNIA")
	if err != nil {
		t.Fatalf("get archived: %v", err)
	}
	if got.Status != model.ScopeArchived {
		t.Errorf("status = %v, want archived", got.Status)
	}
}

func TestScopesTreeShape(t *testing.T) {
	s := newScopesDB(t)
	ctx := context.Background()

	roots, err := s.Tree(ctx)
	if err != nil {
		t.Fatalf("tree: %v", err)
	}
	if len(roots) != 1 || roots[0].Kind != model.ScopeKindDaerah {
		t.Fatalf("roots = %+v", roots)
	}
	if len(roots[0].Children) != 4 {
		t.Errorf("desa children = %d, want 4", len(roots[0].Children))
	}
}
