package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func wilayahTestDB(t *testing.T) *Wilayah {
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
	return NewWilayah(db)
}

func TestWilayahTreeAndCascade(t *testing.T) {
	w := wilayahTestDB(t)
	ctx := context.Background()

	dID, err := w.CreateDaerah(ctx, "Cikarang")
	if err != nil {
		t.Fatalf("create daerah: %v", err)
	}
	vID, err := w.CreateDesa(ctx, dID, "Jababeka")
	if err != nil {
		t.Fatalf("create desa: %v", err)
	}
	if _, err := w.CreateKelompok(ctx, vID, "JB1"); err != nil {
		t.Fatalf("create kelompok: %v", err)
	}
	if _, err := w.CreateKelompok(ctx, vID, "JB2"); err != nil {
		t.Fatalf("create kelompok2: %v", err)
	}

	tree, err := w.Tree(ctx)
	if err != nil {
		t.Fatalf("tree: %v", err)
	}
	if len(tree) != 1 || tree[0].Name != "Cikarang" {
		t.Fatalf("daerah: %+v", tree)
	}
	if len(tree[0].Desa) != 1 || tree[0].Desa[0].Name != "Jababeka" {
		t.Fatalf("desa: %+v", tree[0].Desa)
	}
	if len(tree[0].Desa[0].Kelompok) != 2 {
		t.Fatalf("kelompok count: %+v", tree[0].Desa[0].Kelompok)
	}

	// Names must be unique within their scope.
	if _, err := w.CreateDesa(ctx, dID, "Jababeka"); err == nil {
		t.Error("expected unique conflict on duplicate desa name")
	}

	// Deleting a daerah cascades to its desa + kelompok.
	if err := w.DeleteDaerah(ctx, dID); err != nil {
		t.Fatalf("delete daerah: %v", err)
	}
	tree, _ = w.Tree(ctx)
	if len(tree) != 0 {
		t.Fatalf("expected empty tree after cascade, got %+v", tree)
	}

	if err := w.DeleteDaerah(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete missing: got %v, want ErrNotFound", err)
	}
}
