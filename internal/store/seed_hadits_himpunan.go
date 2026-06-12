package store

import (
	"context"
	"database/sql"
)

// haditsHimpunanKitab is one additional Kitabul Hadits entry from the
// classical PPG curriculum (Himpunan). The list below was supplied by the
// user with explicit page counts; Arabic names are the standard
// transliteration→Arabic mapping used in PPG materials.
type haditsHimpunanKitab struct {
	slug      string
	nama      string
	namaArab  string
	jumlahHal int
	urutan    int
}

var haditsHimpunan = []haditsHimpunanKitab{
	{slug: "k-kitabussolah", nama: "Kitabussolah", namaArab: "كِتَابُ الصَّلَاةِ", jumlahHal: 151, urutan: 200},
	{slug: "k-kitab-nawafil", nama: "Kitab Nawafil", namaArab: "كِتَابُ النَّوَافِلِ", jumlahHal: 98, urutan: 201},
	{slug: "k-dawat", nama: "Kitab Da'awat", namaArab: "كِتَابُ الدَّعَوَاتِ", jumlahHal: 65, urutan: 202},
	{slug: "k-jannat-wannar", nama: "Kitab Jannat wan Naar", namaArab: "كِتَابُ الْجَنَّةِ وَالنَّارِ", jumlahHal: 84, urutan: 203},
	{slug: "k-shoum", nama: "Kitab Shoum", namaArab: "كِتَابُ الصَّوْمِ", jumlahHal: 98, urutan: 204},
	{slug: "k-kanzil-ummal", nama: "Kitab Kanzil 'Ummal", namaArab: "كِتَابُ كَنْزِ الْعُمَّالِ", jumlahHal: 122, urutan: 205},
	{slug: "k-imaroh", nama: "Kitab Imaroh", namaArab: "كِتَابُ الْإِمَارَةِ", jumlahHal: 104, urutan: 206},
	{slug: "k-janaiz", nama: "Kitab Janaiz", namaArab: "كِتَابُ الْجَنَائِزِ", jumlahHal: 79, urutan: 207},
	{slug: "k-adab", nama: "Kitab Adab", namaArab: "كِتَابُ الْآدَابِ", jumlahHal: 96, urutan: 208},
	{slug: "k-adillah", nama: "Kitab Adillah", namaArab: "كِتَابُ الْأَدِلَّةِ", jumlahHal: 96, urutan: 209},
	{slug: "k-khotbah-awal", nama: "Kitab Khotbah Awal", namaArab: "كِتَابُ الْخُطْبَةِ الْأَوَّلِ", jumlahHal: 152, urutan: 210},
	{slug: "k-jihad", nama: "Kitab Jihad", namaArab: "كِتَابُ الْجِهَادِ", jumlahHal: 63, urutan: 211},
	{slug: "k-haji", nama: "Kitab Haji", namaArab: "كِتَابُ الْحَجِّ", jumlahHal: 111, urutan: 212},
	{slug: "k-manasik-haji", nama: "Kitab Manasik Haji", namaArab: "كِتَابُ مَنَاسِكِ الْحَجِّ", jumlahHal: 113, urutan: 213},
	{slug: "k-manasik-wal-jihad", nama: "Kitab Manasik wal Jihad", namaArab: "كِتَابُ الْمَنَاسِكِ وَالْجِهَادِ", jumlahHal: 51, urutan: 214},
	{slug: "k-ahkam", nama: "Kitab Ahkam", namaArab: "كِتَابُ الْأَحْكَامِ", jumlahHal: 124, urutan: 215},
	{slug: "k-nikah", nama: "Kitab Nikah", namaArab: "كِتَابُ النِّكَاحِ", jumlahHal: 101, urutan: 216},
	{slug: "k-tholaq", nama: "Kitab Tholaq", namaArab: "كِتَابُ الطَّلَاقِ", jumlahHal: 98, urutan: 217},
	{slug: "k-zakat", nama: "Kitab Zakat", namaArab: "كِتَابُ الزَّكَاةِ", jumlahHal: 81, urutan: 218},
	{slug: "k-thoharoh", nama: "Kitab Thoharoh", namaArab: "كِتَابُ الطَّهَارَةِ", jumlahHal: 149, urutan: 219},
	{slug: "k-khotbah-baru-j1", nama: "Khotbah Baru — Jilid 1", namaArab: "الْخُطْبَةُ الْجَدِيدَةُ - الْجِلْدُ الْأَوَّلُ", jumlahHal: 117, urutan: 220},
	{slug: "k-khotbah-baru-j2", nama: "Khotbah Baru — Jilid 2", namaArab: "الْخُطْبَةُ الْجَدِيدَةُ - الْجِلْدُ الثَّانِي", jumlahHal: 231, urutan: 221},
	{slug: "k-khotbah-baru-j3", nama: "Khotbah Baru — Jilid 3", namaArab: "الْخُطْبَةُ الْجَدِيدَةُ - الْجِلْدُ الثَّالِثُ", jumlahHal: 334, urutan: 222},
	{slug: "k-hidayatul-mustafid", nama: "Hidayatul Mustafid", namaArab: "هِدَايَةُ الْمُسْتَفِيدِ", jumlahHal: 94, urutan: 223},
}

// SeedHaditsHimpunan inserts the additional Himpunan kitab entries into
// hadits_kitab. Idempotent — uses INSERT OR IGNORE keyed on slug so a
// re-run is a no-op. Returns the number of newly inserted rows.
func SeedHaditsHimpunan(ctx context.Context, db *sql.DB) (int, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var inserted int
	for _, k := range haditsHimpunan {
		id := "hk_" + k.slug
		res, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO hadits_kitab
			   (id, slug, nama, nama_arab, perawi, urutan, scope, jumlah_halaman)
			 VALUES (?, ?, ?, ?, NULL, ?, 'hadits', ?)`,
			id, k.slug, k.nama, k.namaArab, k.urutan, k.jumlahHal,
		)
		if err != nil {
			return inserted, err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			inserted++
		}
	}
	return inserted, tx.Commit()
}
