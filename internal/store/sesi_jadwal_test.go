package store

import (
	"context"
	"testing"
)

func TestSesiCreateWithJadwalID(t *testing.T) {
	db := newJadwalDB(t)
	ss := NewSesi(db)
	jid := "JADWAL01"
	created, err := ss.Create(context.Background(), SesiInput{
		Tanggal:  "2026-06-15",
		Topik:    "Rutin",
		JadwalID: &jid,
	}, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.JadwalID == nil || *created.JadwalID != jid {
		t.Fatalf("JadwalID round-trip failed: got %v", created.JadwalID)
	}
}
