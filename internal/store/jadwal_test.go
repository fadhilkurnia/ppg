package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

// newJadwalDB opens a freshly-migrated SQLite DB and returns the raw handle so
// tests can construct multiple stores (Kelas + Sesi) over the same DB.
func newJadwalDB(t *testing.T) *sql.DB {
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
	return db
}

func mkKelas(t *testing.T, ks *KelasStore, guru *string) string {
	t.Helper()
	k, err := ks.Create(context.Background(), KelasInput{
		Nama: "3A " + t.Name(), Tingkat: "PAUD", GuruUserID: guru, Tahun: 2026,
	})
	if err != nil {
		t.Fatalf("create kelas: %v", err)
	}
	return k.ID
}

func countSesi(t *testing.T, db *sql.DB, kelasID string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sesi WHERE kelas_id = ?`, kelasID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

func TestJadwalUpsertGetDelete(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)

	got, err := ks.GetJadwal(context.Background(), id)
	if err != nil || got != nil {
		t.Fatalf("expected nil jadwal, got %v err %v", got, err)
	}

	sel := "17:00"
	j, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", Selesai: &sel, HorizonMinggu: 8, Aktif: true,
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if len(j.Hari) != 2 || j.Hari[0] != 1 || j.Hari[1] != 3 || j.Mulai != "16:00" || !j.Aktif {
		t.Fatalf("bad jadwal: %+v", j)
	}

	j2, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{Hari: []int{5}, Mulai: "08:00", HorizonMinggu: 4, Aktif: true})
	if err != nil || j2.ID != j.ID || len(j2.Hari) != 1 || j2.Hari[0] != 5 {
		t.Fatalf("upsert update failed: %+v err %v", j2, err)
	}

	if err := ks.DeleteJadwal(context.Background(), id); err != nil {
		t.Fatalf("delete: %v", err)
	}
	got, _ = ks.GetJadwal(context.Background(), id)
	if got != nil {
		t.Fatalf("expected nil after delete, got %+v", got)
	}
}

func TestExpandJadwalWeekdays(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", HorizonMinggu: 8, Aktif: true, // Mon & Wed
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// 2026-06-15 is a Monday. Range covers Mon 15, Wed 17, Mon 22, Wed 24.
	cands, err := ks.ExpandJadwal(context.Background(), id, "2026-06-15", "2026-06-24")
	if err != nil {
		t.Fatalf("expand: %v", err)
	}
	want := []string{"2026-06-15", "2026-06-17", "2026-06-22", "2026-06-24"}
	if len(cands) != len(want) {
		t.Fatalf("got %d candidates, want %d: %+v", len(cands), len(want), cands)
	}
	for i, c := range cands {
		if c.Tanggal != want[i] {
			t.Fatalf("candidate %d = %s, want %s", i, c.Tanggal, want[i])
		}
		if c.Mulai == nil || *c.Mulai != "16:00" || c.JadwalID == nil || c.KelasID == nil || *c.KelasID != id {
			t.Fatalf("candidate %d missing fields: %+v", i, c)
		}
	}
}

func TestExpandJadwalRespectsBounds(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	start := "2026-06-17"
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1, 3}, Mulai: "16:00", MulaiTanggal: &start, HorizonMinggu: 8, Aktif: true,
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	cands, _ := ks.ExpandJadwal(context.Background(), id, "2026-06-15", "2026-06-24")
	// Mon 15 is before mulai_tanggal 17 → excluded. First is Wed 17.
	if len(cands) == 0 || cands[0].Tanggal != "2026-06-17" {
		t.Fatalf("bounds not applied: %+v", cands)
	}
}

func TestGenerateJadwalIdempotent(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	ss := NewSesi(db)
	ks.AttachSesi(ss)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{0, 1, 2, 3, 4, 5, 6}, Mulai: "16:00", HorizonMinggu: 4, Aktif: true,
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	// UpsertJadwal already regenerates once; capture the count.
	first := countSesi(t, db, id)
	if first == 0 {
		t.Fatalf("expected generated sesi, got 0")
	}
	created, err := ks.GenerateJadwal(context.Background(), id)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if created != 0 || countSesi(t, db, id) != first {
		t.Fatalf("not idempotent: created=%d count=%d first=%d", created, countSesi(t, db, id), first)
	}
}

func TestRegenerateOnDisablePreservesHistory(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	ss := NewSesi(db)
	ks.AttachSesi(ss)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{0, 1, 2, 3, 4, 5, 6}, Mulai: "16:00", HorizonMinggu: 4, Aktif: true,
	}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if countSesi(t, db, id) == 0 {
		t.Fatalf("expected generated rows")
	}
	// Mark the earliest generated sesi as started (history that must survive).
	if _, err := db.Exec(
		`UPDATE sesi SET started_at = '2020-01-01T00:00:00.000Z'
		   WHERE id IN (SELECT id FROM sesi WHERE kelas_id = ? AND jadwal_id IS NOT NULL
		                ORDER BY tanggal ASC LIMIT 1)`, id); err != nil {
		t.Fatalf("mark started: %v", err)
	}
	// Add a manual sesi (jadwal_id NULL) that must never be touched.
	if _, err := ss.Create(context.Background(), SesiInput{Tanggal: "2026-12-31", Topik: "Manual", KelasID: &id}, ""); err != nil {
		t.Fatalf("manual: %v", err)
	}
	// Disable the schedule → future un-started generated removed.
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{
		Hari: []int{1}, Mulai: "16:00", HorizonMinggu: 4, Aktif: false,
	}); err != nil {
		t.Fatalf("disable: %v", err)
	}
	var started, manual int
	db.QueryRow(`SELECT COUNT(*) FROM sesi WHERE kelas_id=? AND started_at IS NOT NULL`, id).Scan(&started)
	db.QueryRow(`SELECT COUNT(*) FROM sesi WHERE kelas_id=? AND jadwal_id IS NULL`, id).Scan(&manual)
	if started != 1 {
		t.Fatalf("started/history sesi lost: %d", started)
	}
	if manual != 1 {
		t.Fatalf("manual sesi lost: %d", manual)
	}
}

func TestDeleteKelasRemovesJadwal(t *testing.T) {
	db := newJadwalDB(t)
	ks := NewKelas(db)
	id := mkKelas(t, ks, nil)
	if _, err := ks.UpsertJadwal(context.Background(), id, KelasJadwalInput{Hari: []int{1}, Mulai: "16:00", HorizonMinggu: 4, Aktif: true}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := ks.Delete(context.Background(), id); err != nil {
		t.Fatalf("delete kelas: %v", err)
	}
	var n int
	db.QueryRow(`SELECT COUNT(*) FROM kelas_jadwal WHERE kelas_id = ?`, id).Scan(&n)
	if n != 0 {
		t.Fatalf("kelas_jadwal not cleaned up: %d rows", n)
	}
}
