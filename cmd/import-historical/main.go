// Command import-historical promotes raw imported attendance rows into
// the per-kelas sesi domain so they show up in the Kelas menu (calendar
// + sesi list + Live Stage riwayat) alongside live sessions.
//
// What it does, in order:
//  1. Fixes the lone 2005-08-26 date row to 2025-08-26 (data import typo).
//  2. Ensures a 1-on-1 kelas exists for every unique student that appears
//     in attendances. Kelas naming follows the existing pattern (one kelas
//     per student, name = student.name). The tingkat is derived from
//     student.date_of_birth → age → tingkat.umur match. All teachers that
//     ever taught the student are added to kelas_guru; the most recent
//     teacher becomes the primary (wali).
//  3. For each attendance row still without a `sesi_id`, parses the free
//     form `materi` text into library refs (Quran/Tilawati/Hadits/Doa)
//     plus a "catatan" remainder, creates the sesi row, writes the join
//     tables (sesi_library, sesi_materi_diajarkan), and links the
//     attendance back via `attendances.sesi_id`.
//
// Re-runnable: only attendance rows with a NULL sesi_id are processed,
// and kelas creation is idempotent on student_id.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/oklog/ulid/v2"
)

func main() {
	dbPath := flag.String("db", "/app/data/app.db", "Path to SQLite database")
	dryRun := flag.Bool("dry-run", false, "Parse + report without writing")
	limit := flag.Int("limit", 0, "Stop after N attendances (0=all)")
	flag.Parse()

	db, err := sql.Open("sqlite", *dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`PRAGMA foreign_keys=ON`); err != nil {
		log.Fatalf("pragma: %v", err)
	}

	ctx := context.Background()

	// 1) Fix the 2005 typo.
	if !*dryRun {
		res, err := db.ExecContext(ctx,
			`UPDATE attendances SET date = '2025-08-26' WHERE date LIKE '2005-%'`)
		if err != nil {
			log.Fatalf("fix 2005: %v", err)
		}
		n, _ := res.RowsAffected()
		log.Printf("fixed %d row(s) with 2005-* date → 2025-08-26", n)
	}

	// Load reference data.
	tingkatList, err := loadTingkat(ctx, db)
	if err != nil {
		log.Fatalf("load tingkat: %v", err)
	}
	doaList, err := loadDoa(ctx, db)
	if err != nil {
		log.Fatalf("load doa: %v", err)
	}
	kitabList, err := loadKitab(ctx, db)
	if err != nil {
		log.Fatalf("load kitab: %v", err)
	}
	students, err := loadStudents(ctx, db)
	if err != nil {
		log.Fatalf("load students: %v", err)
	}
	log.Printf("loaded tingkat=%d doa=%d kitab=%d students=%d",
		len(tingkatList), len(doaList), len(kitabList), len(students))

	// 2) Ensure kelas per student.
	studentKelas, err := ensureKelasPerStudent(ctx, db, students, tingkatList, *dryRun)
	if err != nil {
		log.Fatalf("ensure kelas: %v", err)
	}

	// 3) Walk attendances without a sesi_id and create sesi.
	parser := newParser(doaList, kitabList)
	imported, skipped, libRefs, riwayatRows := 0, 0, 0, 0
	rows, err := db.QueryContext(ctx,
		`SELECT id, date, duration_min, teacher_id, student_id, status, materi, created_at
		   FROM attendances
		  WHERE sesi_id IS NULL
		  ORDER BY date ASC, created_at ASC`)
	if err != nil {
		log.Fatalf("scan attendances: %v", err)
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var (
			id, teacher, student, status string
			date                         string
			dur                          sql.NullInt64
			materi                       sql.NullString
			createdAt                    string
		)
		if err := rows.Scan(&id, &date, &dur, &teacher, &student, &status, &materi, &createdAt); err != nil {
			log.Fatalf("scan row: %v", err)
		}
		count++
		if *limit > 0 && count > *limit {
			break
		}
		// Normalize date to YYYY-MM-DD.
		if len(date) > 10 {
			date = date[:10]
		}
		kelas, ok := studentKelas[student]
		if !ok {
			skipped++
			continue
		}
		parsed := parser.parse(materi.String)
		if *dryRun {
			imported++
			libRefs += len(parsed.libraryItems)
			riwayatRows += len(parsed.diajarkanLabels)
			if imported <= 10 {
				log.Printf("DRY [%s] %s → kelas %s | libs=%d riwayat=%d topik=%q alfa=%v conv=%v",
					date, id, kelas.id, len(parsed.libraryItems), len(parsed.diajarkanLabels), parsed.topik, parsed.isAlfa, parsed.isConversation)
			}
			continue
		}
		// Reclassify attendance.status when the materi text indicates an alfa.
		// Skip if the user has already set a non-default status (izin etc).
		if parsed.isAlfa && (status == "hadir" || status == "") {
			if _, err := db.ExecContext(ctx,
				`UPDATE attendances SET status = 'alfa' WHERE id = ?`, id); err != nil {
				log.Printf("WARN reclassify alfa %s: %v", id, err)
			}
			status = "alfa"
		}
		nLib, nRiwayat, err := createSesiFromAttendance(ctx, db, kelas, attendanceRow{
			id:        id,
			date:      date,
			duration:  intOrNil(dur),
			teacherID: teacher,
			studentID: student,
			status:    status,
			createdAt: createdAt,
		}, parsed)
		if err != nil {
			log.Printf("WARN attendance %s: %v", id, err)
			skipped++
			continue
		}
		imported++
		libRefs += nLib
		riwayatRows += nRiwayat
		if imported%500 == 0 {
			log.Printf("…progress: imported=%d skipped=%d lib=%d riwayat=%d",
				imported, skipped, libRefs, riwayatRows)
		}
	}
	if err := rows.Err(); err != nil {
		log.Fatalf("rows.Err: %v", err)
	}

	log.Printf("DONE imported=%d skipped=%d library_refs=%d riwayat_rows=%d (dryRun=%v)",
		imported, skipped, libRefs, riwayatRows, *dryRun)
	if *dryRun {
		os.Exit(0)
	}
}

// ----- Data structures ---------------------------------------------------

type tingkat struct {
	id    string
	nama  string
	umur  *int
	urutan int
}

type doaRef struct {
	id   string
	nama string
}

type kitabRef struct {
	slug string
	nama string
}

type student struct {
	id          string
	name        string
	dateOfBirth string // ISO YYYY-MM-DD or empty
}

type kelasInfo struct {
	id      string
	nama    string
	tingkat string
}

type attendanceRow struct {
	id        string
	date      string
	duration  *int
	teacherID string
	studentID string
	status    string
	createdAt string
}

type parsedMateri struct {
	topik           string
	catatan         string
	libraryItems    []libraryItem
	diajarkanLabels []string
	isAlfa          bool
	isConversation  bool
}

type libraryItem struct {
	kind   string
	aspect string
	ref    string
	label  string
}

// ----- Loaders -----------------------------------------------------------

func loadTingkat(ctx context.Context, db *sql.DB) ([]tingkat, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, nama, umur, urutan FROM tingkat ORDER BY urutan ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []tingkat{}
	for rows.Next() {
		var t tingkat
		var umur sql.NullInt64
		if err := rows.Scan(&t.id, &t.nama, &umur, &t.urutan); err != nil {
			return nil, err
		}
		if umur.Valid {
			v := int(umur.Int64)
			t.umur = &v
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func loadDoa(ctx context.Context, db *sql.DB) ([]doaRef, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, nama FROM compact_ajar WHERE aktif = 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []doaRef{}
	for rows.Next() {
		var d doaRef
		if err := rows.Scan(&d.id, &d.nama); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func loadKitab(ctx context.Context, db *sql.DB) ([]kitabRef, error) {
	rows, err := db.QueryContext(ctx, `SELECT slug, nama FROM hadits_kitab`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []kitabRef{}
	for rows.Next() {
		var k kitabRef
		if err := rows.Scan(&k.slug, &k.nama); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

func loadStudents(ctx context.Context, db *sql.DB) (map[string]student, error) {
	// Only students that appear in attendances.
	rows, err := db.QueryContext(ctx,
		`SELECT u.id, u.name, u.date_of_birth
		   FROM users u
		  WHERE u.id IN (SELECT DISTINCT student_id FROM attendances)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]student{}
	for rows.Next() {
		var s student
		var dob sql.NullString
		if err := rows.Scan(&s.id, &s.name, &dob); err != nil {
			return nil, err
		}
		if dob.Valid {
			s.dateOfBirth = dob.String
		}
		out[s.id] = s
	}
	return out, rows.Err()
}

// ----- Kelas ensure ------------------------------------------------------

// ensureKelasPerStudent makes sure each student has a 1-on-1 kelas, names
// it after the student, sets the tingkat by age, and writes all teachers
// they have appeared with into the kelas_guru join. Returns a map
// student_id → kelasInfo.
func ensureKelasPerStudent(
	ctx context.Context,
	db *sql.DB,
	students map[string]student,
	tingkatList []tingkat,
	dry bool,
) (map[string]kelasInfo, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")

	// Pre-load: existing kelas by name (we use student.name as canonical).
	existing := map[string]kelasInfo{}
	rows, err := db.QueryContext(ctx, `SELECT id, nama, tingkat FROM kelas`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var k kelasInfo
		if err := rows.Scan(&k.id, &k.nama, &k.tingkat); err != nil {
			rows.Close()
			return nil, err
		}
		existing[strings.ToLower(strings.TrimSpace(k.nama))] = k
	}
	rows.Close()

	// Map student → all teachers (with last-seen date).
	type teacherInfo struct {
		id       string
		lastSeen string
	}
	teachersByStudent := map[string]map[string]teacherInfo{}
	rows, err = db.QueryContext(ctx,
		`SELECT student_id, teacher_id, MAX(date)
		   FROM attendances GROUP BY student_id, teacher_id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var sid, tid, last string
		if err := rows.Scan(&sid, &tid, &last); err != nil {
			rows.Close()
			return nil, err
		}
		if teachersByStudent[sid] == nil {
			teachersByStudent[sid] = map[string]teacherInfo{}
		}
		teachersByStudent[sid][tid] = teacherInfo{id: tid, lastSeen: last}
	}
	rows.Close()

	result := map[string]kelasInfo{}
	tahun := time.Now().Year()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	for sid, s := range students {
		nameKey := strings.ToLower(strings.TrimSpace(s.name))
		var k kelasInfo
		if ek, ok := existing[nameKey]; ok {
			k = ek
		} else {
			k = kelasInfo{
				id:      ulid.Make().String(),
				nama:    s.name,
				tingkat: pickTingkatForStudent(s, tingkatList),
			}
			if !dry {
				if _, err := tx.ExecContext(ctx,
					`INSERT INTO kelas (id, nama, tingkat, guru_user_id, tahun, deskripsi, created_at, updated_at)
					 VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)`,
					k.id, k.nama, k.tingkat, tahun, now, now,
				); err != nil {
					return nil, fmt.Errorf("insert kelas %q: %w", k.nama, err)
				}
			}
			existing[nameKey] = k
		}
		result[sid] = k

		// Write/upsert kelas_anggota (the student).
		if !dry {
			if _, err := tx.ExecContext(ctx,
				`INSERT OR IGNORE INTO kelas_anggota (kelas_id, murid_user_id) VALUES (?, ?)`,
				k.id, sid,
			); err != nil {
				return nil, fmt.Errorf("insert anggota %q: %w", k.nama, err)
			}
		}

		// Write kelas_guru for each teacher seen, picking the latest as primary.
		teachers := teachersByStudent[sid]
		if len(teachers) == 0 {
			continue
		}
		latestID := ""
		latestDate := ""
		for _, t := range teachers {
			if t.lastSeen > latestDate {
				latestDate = t.lastSeen
				latestID = t.id
			}
			if !dry {
				if _, err := tx.ExecContext(ctx,
					`INSERT OR IGNORE INTO kelas_guru (kelas_id, guru_user_id) VALUES (?, ?)`,
					k.id, t.id,
				); err != nil {
					return nil, fmt.Errorf("insert kelas_guru: %w", err)
				}
			}
		}
		if !dry && latestID != "" {
			if _, err := tx.ExecContext(ctx,
				`UPDATE kelas SET guru_user_id = ?, updated_at = ? WHERE id = ? AND (guru_user_id IS NULL OR guru_user_id = '')`,
				latestID, now, k.id,
			); err != nil {
				return nil, fmt.Errorf("set primary guru: %w", err)
			}
		}
	}
	if !dry {
		if err := tx.Commit(); err != nil {
			return nil, err
		}
	}
	log.Printf("ensured kelas for %d students", len(result))
	return result, nil
}

func pickTingkatForStudent(s student, list []tingkat) string {
	if len(list) == 0 {
		return ""
	}
	// Normalise the DOB string — the database stores `YYYY-MM-DD HH:MM:SS+...`
	// for some rows, so slice down to the date portion before parsing.
	dob := s.dateOfBirth
	if len(dob) > 10 {
		dob = dob[:10]
	}
	if dob == "" {
		return list[len(list)-1].nama
	}
	t, err := time.Parse("2006-01-02", dob)
	if err != nil {
		return list[len(list)-1].nama
	}
	now := time.Now()
	age := now.Year() - t.Year()
	if now.YearDay() < t.YearDay() {
		age--
	}
	// Pick the smallest tingkat.umur that is >= age. If age exceeds all
	// buckets, fall back to the largest umur.
	var smallestGE *tingkat
	var largest *tingkat
	for i, x := range list {
		if x.umur == nil {
			continue
		}
		if largest == nil || *x.umur > *largest.umur {
			largest = &list[i]
		}
		if *x.umur >= age && (smallestGE == nil || *x.umur < *smallestGE.umur) {
			smallestGE = &list[i]
		}
	}
	if smallestGE != nil {
		return smallestGE.nama
	}
	if largest != nil {
		return largest.nama
	}
	return list[len(list)-1].nama
}

// ----- Sesi creation -----------------------------------------------------

func createSesiFromAttendance(
	ctx context.Context,
	db *sql.DB,
	kelas kelasInfo,
	a attendanceRow,
	p parsedMateri,
) (int, int, error) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	sesiID := ulid.Make().String()

	mulai := "09:00"
	selesai := ""
	startedAt := a.date + "T09:00:00.000Z"
	endedAt := ""
	if a.duration != nil && *a.duration > 0 {
		dur := *a.duration
		if dur > 240 {
			dur = 240
		}
		endTime := time.Date(2000, 1, 1, 9, 0, 0, 0, time.UTC).Add(time.Duration(dur) * time.Minute)
		selesai = endTime.Format("15:04")
		// Add duration to date+09:00 for ended_at.
		startT, _ := time.Parse("2006-01-02T15:04:05.000Z", startedAt)
		endTimeAbs := startT.Add(time.Duration(dur) * time.Minute)
		endedAt = endTimeAbs.UTC().Format("2006-01-02T15:04:05.000Z")
	} else {
		endedAt = a.date + "T10:00:00.000Z"
	}

	topik := strings.TrimSpace(p.topik)
	if topik == "" {
		topik = "Pengajian (imported)"
	}
	catatan := strings.TrimSpace(p.catatan)

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO sesi (id, tanggal, mulai, selesai, topik, catatan, tingkat,
		   materi_ajar_id, guru_id, kelas_id, library_kind, library_aspect, library_ref,
		   started_at, ended_at, live_materi_id, live_display_mode,
		   created_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, ?)`,
		sesiID, a.date, mulai, nullStr(selesai), topik, nullStr(catatan), kelas.tingkat,
		a.teacherID, kelas.id, startedAt, endedAt, now, now,
	); err != nil {
		return 0, 0, fmt.Errorf("insert sesi: %w", err)
	}

	nLib := 0
	for i, it := range p.libraryItems {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO sesi_library (id, sesi_id, library_kind, library_aspect, library_ref, position)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			ulid.Make().String(), sesiID, it.kind, nullStr(it.aspect), it.ref, i,
		)
		if err != nil {
			return 0, 0, fmt.Errorf("insert sesi_library: %w", err)
		}
		nLib++
	}

	nRiwayat := 0
	for _, label := range p.diajarkanLabels {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO sesi_materi_diajarkan (id, sesi_id, kind, materi_ajar_id, ref, label,
			   needs_parent_review, parent_note, completed, completed_at,
			   taught_at, created_at, updated_at)
			 VALUES (?, ?, ?, NULL, NULL, ?, 0, NULL, 1, ?, ?, ?, ?)`,
			ulid.Make().String(), sesiID, "kurikulum", label, endedAt, endedAt, now, now,
		)
		if err != nil {
			return 0, 0, fmt.Errorf("insert diajarkan: %w", err)
		}
		nRiwayat++
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE attendances SET sesi_id = ? WHERE id = ?`, sesiID, a.id,
	); err != nil {
		return 0, 0, fmt.Errorf("link attendance: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return nLib, nRiwayat, nil
}

// ----- Parser ------------------------------------------------------------

type parser struct {
	doas     []doaRef
	kitabs   []kitabRef
	surahMap map[string]int    // normalised name (lower, alnum) → surah id
}

func newParser(doas []doaRef, kitabs []kitabRef) *parser {
	return &parser{
		doas:     doas,
		kitabs:   kitabs,
		surahMap: buildSurahMap(),
	}
}

var (
	tilawatiRe = regexp.MustCompile(`(?i)tilawat[iy]\w*\s*(\d+)\s*(?:hal|halaman|page|hl|pg)?\.?\s*(\d+)(?:\s*[-&]+\s*(\d+))?`)
	suratRe    = regexp.MustCompile(`(?i)\b(?:surat|surah)\s+([a-z'\-‘’]+(?:\s+[a-z'\-‘’]+){0,2})(?:\s+ayat\s*(\d+)(?:\s*[-–]\s*(\d+))?)?`)
	plainSurat = regexp.MustCompile(`(?i)\b(al[\s-]?[a-z'‘’]+|yasin|yaasin|annaba|annaziat|annas|anfal|al-bayyinah)\s+(?:ayat\s+)?(\d+)(?:\s*[-–]\s*(\d+))?`)
	// Match abbreviated kitab references: "k. jannah wannar hal 12-14",
	// "k.sholah", "k jannat wannar". The name capture greedily consumes
	// alpha+space chars (up to ~40 chars) so multi-word kitab names like
	// "Jannat wan Naar" / "Sholah Bagi Wanita" survive intact.
	kitabAbbr  = regexp.MustCompile(`(?i)\bk\s*\.\s*([a-z][a-z\s'\-]{1,40})(?:\s+hal\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?)?`)
	hadithRe   = regexp.MustCompile(`(?i)\bhadit[sh]\s+([a-z0-9\s'\-]+?)(?:\s+no\.?\s*(\d+))?`)
	kitabFull  = regexp.MustCompile(`(?i)\bkitab\s+([a-z][a-z\s'\-]{2,40})`)
	asmaulRe   = regexp.MustCompile(`(?i)asmaul[\s-]?husna(?:\s+(\d+)(?:\s*[-–]\s*(\d+))?)?`)
	doaIntro   = regexp.MustCompile(`(?i)\b(doa|do'a|do\.a|do[' ]?a)\s+([a-z0-9'\-\s]+)`)
	noteHints  = regexp.MustCompile(`(?i)(alhamdulillah|semoga|moga2|barokah|lancar|bagus|sangat baik|aamiin|amin|insya\s?allah|insyaallah|gaenak|kurang fit|sakit|izin|rehat|cancel|cuti|tidak ada jawaban|#error|fokus ujian|libur|mohon izin|mohon amsol)`)
	// alfaPattern signals an absence without prior notice. Must match on a
	// SHORT materi (length-gated by the caller) to avoid false positives —
	// long materi text frequently mentions "ketiduran" as a side note while
	// the actual lesson did happen.
	alfaPattern = regexp.MustCompile(`(?i)\bketiduran\b|tidak ada balasan|tidak ada jawaban|gak ada balasan|nggak? ada balasan|no reply|no answer|belum di ?balas|tidak hadir tanpa|tidak dijawab|gak dijawab|nggak dijawab|nggak ada kabar|tidak ada kabar|alpa\b|\balfa\b`)
	// convPattern marks materi text that is purely conversational/nasihat
	// (no Qur'an/Tilawati/Doa/Hadits ref). Used to classify the sesi as
	// "Conversation / Nasihat" while keeping the attendance as Hadir.
	convPattern = regexp.MustCompile(`(?i)\bnasi[hr]?at\b|\bnaseh?at\b|\bngobrol\b|\bobrolan\b|\bdiskusi\b|sharing|\bopening\b|share\s+(story|cerita)|nyam[bp]ung[a-z]*`)
)

func (p *parser) parse(raw string) parsedMateri {
	result := parsedMateri{
		libraryItems:    []libraryItem{},
		diajarkanLabels: []string{},
	}
	if strings.TrimSpace(raw) == "" {
		return result
	}
	normalized := normalizeText(raw)
	lower := strings.ToLower(normalized)

	// Alfa heuristic: short text dominated by an absence signal.
	if len(strings.TrimSpace(normalized)) < 140 {
		if alfaPattern.MatchString(lower) {
			result.isAlfa = true
		}
	}
	if strings.TrimSpace(normalized) == "#error!" {
		result.isAlfa = true
	}
	// Split on newlines or pipe.
	chunks := splitLines(normalized)
	noteLines := []string{}
	topikCandidates := []string{}
	seenLib := map[string]bool{}
	addLib := func(li libraryItem) {
		key := li.kind + "|" + li.aspect + "|" + li.ref
		if seenLib[key] {
			return
		}
		seenLib[key] = true
		result.libraryItems = append(result.libraryItems, li)
		result.diajarkanLabels = append(result.diajarkanLabels, li.label)
	}

	for _, line := range chunks {
		trim := strings.TrimSpace(line)
		if trim == "" {
			continue
		}
		matched := false
		// Tilawati
		for _, m := range tilawatiRe.FindAllStringSubmatch(trim, -1) {
			jilid := m[1]
			from := m[2]
			to := m[3]
			ref := jilid
			if from != "" && to != "" && from != to {
				ref = fmt.Sprintf("%s:%s-%s", jilid, from, to)
			} else if from != "" {
				ref = fmt.Sprintf("%s:%s", jilid, from)
			}
			label := fmt.Sprintf("Tilawati Jilid %s", jilid)
			if from != "" {
				label += " · hal. " + from
				if to != "" && to != from {
					label += "-" + to
				}
			}
			addLib(libraryItem{kind: "tilawati", aspect: "reciting", ref: ref, label: label})
			matched = true
		}
		// Surat by explicit "surat <name>"
		for _, m := range suratRe.FindAllStringSubmatch(trim, -1) {
			name := m[1]
			from := m[2]
			to := m[3]
			id := p.matchSurah(name)
			if id == 0 {
				continue
			}
			ref := strconv.Itoa(id)
			label := fmt.Sprintf("Al-Qur'an surat %d", id)
			if from != "" && to != "" && from != to {
				ref = fmt.Sprintf("%d:%s-%s", id, from, to)
				label += fmt.Sprintf(" : %s-%s", from, to)
			} else if from != "" {
				ref = fmt.Sprintf("%d:%s", id, from)
				label += " : " + from
			}
			aspect := "reciting"
			if strings.Contains(strings.ToLower(trim), "hafal") || strings.Contains(strings.ToLower(trim), "memori") {
				aspect = "memorizing"
			} else if strings.Contains(strings.ToLower(trim), "murojaah") || strings.Contains(strings.ToLower(trim), "muroja") {
				aspect = "review"
			} else if strings.Contains(strings.ToLower(trim), "manqul") || strings.Contains(strings.ToLower(trim), "makna") || strings.Contains(strings.ToLower(trim), "mankul") {
				aspect = "manqul"
			}
			addLib(libraryItem{kind: "quran", aspect: aspect, ref: ref, label: label})
			matched = true
		}
		// Surah without explicit "surat" prefix
		for _, m := range plainSurat.FindAllStringSubmatch(trim, -1) {
			name := m[1]
			id := p.matchSurah(name)
			if id == 0 {
				continue
			}
			from := m[2]
			to := m[3]
			ref := strconv.Itoa(id)
			label := fmt.Sprintf("Al-Qur'an surat %d", id)
			if from != "" && to != "" && from != to {
				ref = fmt.Sprintf("%d:%s-%s", id, from, to)
				label += fmt.Sprintf(" : %s-%s", from, to)
			} else if from != "" {
				ref = fmt.Sprintf("%d:%s", id, from)
				label += " : " + from
			}
			addLib(libraryItem{kind: "quran", aspect: "reciting", ref: ref, label: label})
			matched = true
		}
		// Kitab abbreviation: "K. Sholah", "K. Jannah Wannar"
		for _, m := range kitabAbbr.FindAllStringSubmatch(trim, -1) {
			rawName := m[1]
			slug := p.matchKitab(rawName)
			if slug == "" {
				continue
			}
			from := m[2]
			to := m[3]
			ref := slug
			label := fmt.Sprintf("Hadits %s", slug)
			if from != "" {
				if to != "" && to != from {
					ref = fmt.Sprintf("%s#%s-%s", slug, from, to)
					label += fmt.Sprintf(" no. %s-%s", from, to)
				} else {
					ref = fmt.Sprintf("%s#%s", slug, from)
					label += " no. " + from
				}
			}
			addLib(libraryItem{kind: "hadits", aspect: "manqul", ref: ref, label: label})
			matched = true
		}
		// "hadits <name>"
		for _, m := range hadithRe.FindAllStringSubmatch(trim, -1) {
			rawName := m[1]
			slug := p.matchKitab(rawName)
			if slug == "" {
				continue
			}
			from := m[2]
			ref := slug
			label := fmt.Sprintf("Hadits %s", slug)
			if from != "" {
				ref = fmt.Sprintf("%s#%s", slug, from)
				label += " no. " + from
			}
			addLib(libraryItem{kind: "hadits", aspect: "manqul", ref: ref, label: label})
			matched = true
		}
		// "kitab <full name>"
		for _, m := range kitabFull.FindAllStringSubmatch(trim, -1) {
			slug := p.matchKitab(m[1])
			if slug == "" {
				continue
			}
			addLib(libraryItem{kind: "hadits", aspect: "manqul", ref: slug, label: "Hadits " + slug})
			matched = true
		}
		// Doa lookup — match against full doa name list (substring).
		lower := strings.ToLower(trim)
		if strings.Contains(lower, "doa") || strings.Contains(lower, "do'a") || strings.Contains(lower, "do.a") {
			for _, d := range p.doas {
				dn := strings.ToLower(d.nama)
				if dn == "" {
					continue
				}
				if strings.Contains(lower, dn) {
					addLib(libraryItem{
						kind: "doa", aspect: "memorizing", ref: d.id,
						label: "Doa " + d.nama,
					})
					matched = true
				}
			}
			// generic doa pattern → still mark
			if !matched && doaIntro.MatchString(trim) {
				topikCandidates = append(topikCandidates, trim)
			}
		}
		// Asmaul Husna
		if m := asmaulRe.FindStringSubmatch(trim); m != nil {
			label := "Asmaul Husna"
			if m[1] != "" && m[2] != "" {
				label = fmt.Sprintf("Asmaul Husna %s-%s", m[1], m[2])
			} else if m[1] != "" {
				label = fmt.Sprintf("Asmaul Husna %s", m[1])
			}
			result.diajarkanLabels = append(result.diajarkanLabels, label)
			matched = true
		}

		if !matched {
			if noteHints.MatchString(trim) {
				noteLines = append(noteLines, trim)
			} else if len(trim) <= 80 && len(topikCandidates) < 3 {
				topikCandidates = append(topikCandidates, trim)
			} else {
				noteLines = append(noteLines, trim)
			}
		}
	}

	// Conversation/Nasihat detection: no library items + obvious chat-only
	// keywords. Adds a diajarkan label so the sesi still has a "what was
	// covered" entry. Hadir, not alfa.
	if !result.isAlfa && len(result.libraryItems) == 0 && convPattern.MatchString(lower) {
		result.isConversation = true
		result.diajarkanLabels = append(result.diajarkanLabels, "Conversation / Nasihat")
	}

	// Topik = first parsed library item label, or first short non-note line.
	switch {
	case result.isAlfa:
		result.topik = "Alfa"
	case result.isConversation:
		result.topik = "Conversation / Nasihat"
	case len(result.libraryItems) > 0:
		result.topik = result.libraryItems[0].label
	case len(topikCandidates) > 0:
		result.topik = topikCandidates[0]
	case len(noteLines) > 0:
		result.topik = truncate(noteLines[0], 80)
	}
	result.catatan = strings.Join(noteLines, "\n")
	return result
}

func (p *parser) matchSurah(raw string) int {
	key := normSurahKey(raw)
	if key == "" {
		return 0
	}
	if id, ok := p.surahMap[key]; ok {
		return id
	}
	// Try short-prefix match — drop "al-" prefix
	if strings.HasPrefix(key, "al") {
		short := strings.TrimPrefix(strings.TrimPrefix(key, "al"), "-")
		short = strings.TrimSpace(short)
		if id, ok := p.surahMap[short]; ok {
			return id
		}
	}
	return 0
}

func (p *parser) matchKitab(raw string) string {
	low := strings.ToLower(strings.TrimSpace(raw))
	low = strings.ReplaceAll(low, "wannar", "wan naar")
	low = strings.ReplaceAll(low, "wannaar", "wan naar")
	low = strings.ReplaceAll(low, "sholatinnawafil", "sholat nawafil")
	for _, k := range p.kitabs {
		kn := strings.ToLower(k.nama)
		if strings.Contains(low, kn) {
			return k.slug
		}
		// Strip whitespace + diacritics-ish for "kitab x" abbreviation
		kn2 := strings.ReplaceAll(kn, "kitab ", "")
		if kn2 != "" && strings.Contains(low, kn2) {
			return k.slug
		}
	}
	// Targeted aliases
	switch {
	case strings.Contains(low, "jannah") && (strings.Contains(low, "wan") || strings.Contains(low, "naar") || strings.Contains(low, "annar")):
		return "k-jannat-wannar"
	case strings.Contains(low, "jannat"):
		return "k-jannat-wannar"
	case strings.Contains(low, "sholah") || strings.Contains(low, "shollah") || strings.Contains(low, "sholat"):
		return "kitabussholah"
	}
	return ""
}

// ----- Helpers -----------------------------------------------------------

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func intOrNil(v sql.NullInt64) *int {
	if !v.Valid {
		return nil
	}
	x := int(v.Int64)
	return &x
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func normalizeText(s string) string {
	// Map mathematical italic/bold letters back to ASCII.
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 0x1d400 && r <= 0x1d6a3:
			idx := (int(r) - 0x1d400) % 52
			if idx < 26 {
				b.WriteRune(rune('A' + idx))
			} else {
				b.WriteRune(rune('a' + idx - 26))
			}
		case r >= 0x1d7ce && r <= 0x1d7ff:
			idx := (int(r) - 0x1d7ce) % 10
			b.WriteRune(rune('0' + idx))
		case r == '’' || r == '‘':
			b.WriteRune('\'')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func splitLines(s string) []string {
	rep := strings.NewReplacer("\r", "", "•", "\n", "•", "\n", "📚", "\n", "🏡", "\n", "📖", "\n")
	s = rep.Replace(s)
	parts := []string{}
	for _, l := range strings.Split(s, "\n") {
		// Also split on pipe (export sentinel) and numbered list markers.
		for _, p := range strings.Split(l, "|") {
			parts = append(parts, p)
		}
	}
	return parts
}

func normSurahKey(s string) string {
	s = strings.ToLower(s)
	repl := strings.NewReplacer(
		"’", "", "‘", "", "'", "",
		"-", " ", "_", " ",
	)
	s = repl.Replace(s)
	s = strings.TrimSpace(s)
	return s
}

func buildSurahMap() map[string]int {
	m := map[string]int{}
	add := func(id int, aliases ...string) {
		for _, a := range aliases {
			m[normSurahKey(a)] = id
		}
	}
	add(1, "al fatihah", "alfatihah", "fatihah")
	add(2, "al baqarah", "albaqarah", "baqarah", "al baqoroh", "baqoroh", "al baqaroh", "baqaroh")
	add(3, "ali imran", "ali imron", "al imran", "al imron", "imran", "imron")
	add(4, "an nisa", "annisa", "nisa", "al nisa")
	add(5, "al maidah", "almaidah", "maidah")
	add(6, "al anam", "al an am", "alanam", "anam", "al-an'am")
	add(7, "al araf", "al a raf", "al arof", "araf", "arof", "al-a'rof", "al-a'raf")
	add(8, "al anfal", "anfal", "alanfal")
	add(9, "at taubah", "attaubah", "taubah")
	add(10, "yunus")
	add(11, "hud", "huud")
	add(12, "yusuf")
	add(13, "ar rad", "ar ra d", "rad", "arrad")
	add(14, "ibrahim", "ibrohim")
	add(15, "al hijr", "alhijr", "hijr")
	add(16, "an nahl", "annahl", "nahl")
	add(17, "al isra", "alisra", "isra", "bani israil")
	add(18, "al kahfi", "al kahf", "kahf", "kahfi", "alkahf", "alkahfi")
	add(19, "maryam")
	add(20, "thaha", "taha", "tha ha")
	add(21, "al anbiya", "anbiya", "alanbiya")
	add(22, "al hajj", "alhajj", "hajj", "haj", "alhaj")
	add(23, "al muminun", "almuminun", "muminun", "al mu minun", "mu minun")
	add(24, "an nur", "annur", "nur")
	add(25, "al furqan", "alfurqan", "furqan", "furqon")
	add(26, "asy syuara", "asy syu ara", "syuara")
	add(27, "an naml", "annaml", "naml")
	add(28, "al qasas", "al qosos", "qosos", "qasas", "alqasas")
	add(29, "al ankabut", "ankabut", "alankabut")
	add(30, "ar rum", "arrum", "rum")
	add(31, "luqman", "luqmaan")
	add(32, "as sajdah", "as sajda", "sajdah", "assajdah")
	add(33, "al ahzab", "alahzab", "ahzab")
	add(34, "saba", "saba'")
	add(35, "fatir", "fathir")
	add(36, "yasin", "ya sin", "yaa sin", "yaa siin", "yaasin", "yaa siin", "yaasiin")
	add(37, "as saffat", "assaffat", "saffat", "ash shoffat", "ashshoffat", "shoffat")
	add(38, "shad", "sad")
	add(39, "az zumar", "azzumar", "zumar")
	add(40, "ghafir", "ghofir", "al mu min", "almumin")
	add(41, "fussilat", "fushshilat", "fushilat")
	add(42, "asy syura", "asysyura", "syuro", "syura")
	add(43, "az zukhruf", "azzukhruf", "zukhruf")
	add(44, "ad dukhan", "addukhan", "dukhan")
	add(45, "al jasiyah", "aljasiyah", "jasiyah", "al jathiya")
	add(46, "al ahqaf", "alahqaf", "ahqaf")
	add(47, "muhammad")
	add(48, "al fath", "alfath", "fath")
	add(49, "al hujurat", "alhujurat", "hujurat", "hujurot")
	add(50, "qaf", "qof")
	add(51, "adz dzariyat", "adzdzariyat", "dzariyat", "adzariyat")
	add(52, "at tur", "attur", "tur")
	add(53, "an najm", "annajm", "najm")
	add(54, "al qamar", "alqamar", "qamar", "qomar", "alqomar")
	add(55, "ar rahman", "ar rohman", "rahman", "rohman")
	add(56, "al waqiah", "alwaqiah", "waqiah", "waqi'ah", "waqia")
	add(57, "al hadid", "alhadid", "hadid")
	add(58, "al mujadilah", "almujadilah", "mujadilah")
	add(59, "al hashr", "alhashr", "hasyr", "hashr")
	add(60, "al mumtahanah", "almumtahanah", "mumtahanah")
	add(61, "as saff", "as shoff", "shaff", "shaf")
	add(62, "al jumuah", "aljumuah", "jumuah", "jumu'ah")
	add(63, "al munafiqun", "almunafiqun", "munafiqun")
	add(64, "at taghabun", "attaghabun", "taghabun")
	add(65, "at talaq", "attalaq", "talaq", "tholak")
	add(66, "at tahrim", "attahrim", "tahrim")
	add(67, "al mulk", "almulk", "mulk")
	add(68, "al qalam", "alqalam", "qalam", "qolam")
	add(69, "al haqqah", "alhaqqah", "haqqah", "haqqoh")
	add(70, "al maarij", "almaarij", "maarij", "ma'arij")
	add(71, "nuh")
	add(72, "al jinn", "aljinn", "jinn", "jin")
	add(73, "al muzzammil", "muzzammil", "muzammil")
	add(74, "al muddatsir", "muddatsir", "muddathir")
	add(75, "al qiyamah", "alqiyamah", "qiyamah", "kiamah")
	add(76, "al insan", "alinsan", "insan", "ad dahr")
	add(77, "al mursalat", "almursalat", "mursalat")
	add(78, "an naba", "annaba", "naba'", "naba")
	add(79, "an naziat", "annaziat", "naziat", "nazi at")
	add(80, "abasa", "'abasa")
	add(81, "at takwir", "attakwir", "takwir")
	add(82, "al infitar", "alinfitar", "infitar")
	add(83, "al mutaffifin", "mutaffifin")
	add(84, "al insyiqaq", "insyiqaq")
	add(85, "al buruj", "alburuj", "buruj")
	add(86, "at tariq", "attariq", "tariq", "thoriq")
	add(87, "al ala", "al a la", "ala", "a'la")
	add(88, "al ghashiyah", "ghasyiyah", "ghashiyah")
	add(89, "al fajr", "alfajr", "fajr")
	add(90, "al balad", "albalad", "balad")
	add(91, "asy syams", "syams", "asysyams")
	add(92, "al lail", "allail", "lail")
	add(93, "adh dhuha", "adhdhuha", "dhuha", "adhuha")
	add(94, "al insyirah", "alam nasyrah", "asy syarh", "insyirah")
	add(95, "at tin", "attin", "tin")
	add(96, "al alaq", "alaq", "iqra")
	add(97, "al qadr", "alqadr", "qadr", "qodar", "qadar")
	add(98, "al bayyinah", "bayyinah")
	add(99, "az zalzalah", "zalzalah", "azzalzalah")
	add(100, "al adiyat", "adiyat", "'adiyat")
	add(101, "al qariah", "qoriah", "qariah", "qari'ah")
	add(102, "at takatsur", "takatsur", "takatur")
	add(103, "al asr", "alasr", "asr")
	add(104, "al humazah", "humazah")
	add(105, "al fil", "alfil", "fil")
	add(106, "quraish", "quraisy")
	add(107, "al maun", "almaun", "maun", "ma'un")
	add(108, "al kautsar", "kautsar", "kawtsar", "al kawthar")
	add(109, "al kafirun", "kafirun")
	add(110, "an nasr", "annasr", "nasr")
	add(111, "al masad", "almasad", "masad", "lahab")
	add(112, "al ikhlas", "ikhlas", "alikhlas")
	add(113, "al falaq", "falaq", "alfalaq")
	add(114, "an nas", "annas", "nas")
	return m
}
