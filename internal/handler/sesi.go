package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Sesi struct {
	s           *store.SesiStore
	kelas       *store.KelasStore
	bacaan      *store.Bacaan
	attendances *store.Attendances
	pencapaian  *store.PencapaianStore
	diajarkan   *store.DiajarkanStore
	validator   *validator.Validate
}

// NewSesi wires the sesi handler. The kelas + bacaan stores are optional
// dependencies: when both are present, ending a sesi whose libraryKind is
// 'quran' auto-creates bacaan_log rows for each kelas anggota so their
// Kontrol Bacaan progress reflects the pengajian session. The attendances
// store, also optional, receives one row per anggota with status=hadir so
// the Kehadiran "Daftar Absen" tab lists newly finished sessions alongside
// the imported historical data. The pencapaian + diajarkan stores let the
// end-sesi flow auto-upsert pencapaian rows: every kurikulum materi and
// library ref attached to the sesi becomes a "proses" pencapaian per
// anggota (or "tuntas" when the diajarkan row was marked completed).
func NewSesi(
	s *store.SesiStore,
	kelas *store.KelasStore,
	bacaan *store.Bacaan,
	attendances *store.Attendances,
	pencapaian *store.PencapaianStore,
	diajarkan *store.DiajarkanStore,
) *Sesi {
	return &Sesi{
		s:           s,
		kelas:       kelas,
		bacaan:      bacaan,
		attendances: attendances,
		pencapaian:  pencapaian,
		diajarkan:   diajarkan,
		validator:   validator.New(),
	}
}

type sesiBody struct {
	Tanggal       string            `json:"tanggal"      validate:"required,len=10"`
	Mulai         *string           `json:"mulai,omitempty"        validate:"omitempty,len=5"`
	Selesai       *string           `json:"selesai,omitempty"      validate:"omitempty,len=5"`
	Topik         string            `json:"topik"        validate:"required,max=500"`
	Catatan       *string           `json:"catatan,omitempty"`
	Tingkat       *string           `json:"tingkat,omitempty"      validate:"omitempty,max=100"`
	MateriAjarID  *string           `json:"materiAjarId,omitempty"`
	MateriAjarIDs []string          `json:"materiAjarIds,omitempty"`
	GuruID        *string           `json:"guruId,omitempty"`
	KelasID       *string           `json:"kelasId,omitempty"`
	LibraryKind   *string           `json:"libraryKind,omitempty"  validate:"omitempty,oneof=kurikulum quran hadits tilawati doa"`
	LibraryAspect *string           `json:"libraryAspect,omitempty" validate:"omitempty,oneof=reciting memorizing review manqul"`
	LibraryRef    *string           `json:"libraryRef,omitempty"   validate:"omitempty,max=500"`
	LibraryItems  []sesiLibraryItem `json:"libraryItems,omitempty" validate:"omitempty,dive"`
}

type sesiLibraryItem struct {
	LibraryKind   string  `json:"libraryKind"            validate:"required,oneof=quran hadits tilawati doa"`
	LibraryAspect *string `json:"libraryAspect,omitempty" validate:"omitempty,oneof=reciting memorizing review manqul"`
	LibraryRef    string  `json:"libraryRef"             validate:"required,max=500"`
}

func (h *Sesi) parse(r *http.Request) (store.SesiInput, error) {
	var b sesiBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.SesiInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.SesiInput{}, err
	}
	items := make([]store.SesiLibraryItem, 0, len(b.LibraryItems))
	for _, it := range b.LibraryItems {
		kind := strings.TrimSpace(it.LibraryKind)
		ref := strings.TrimSpace(it.LibraryRef)
		if kind == "" || ref == "" {
			continue
		}
		var aspect *string
		if it.LibraryAspect != nil {
			a := strings.TrimSpace(*it.LibraryAspect)
			if a != "" {
				aspect = &a
			}
		}
		items = append(items, store.SesiLibraryItem{
			Kind:          kind,
			LibraryAspect: aspect,
			LibraryRef:    ref,
		})
	}
	return store.SesiInput{
		Tanggal:       strings.TrimSpace(b.Tanggal),
		Mulai:         trimPtr(b.Mulai),
		Selesai:       trimPtr(b.Selesai),
		Topik:         strings.TrimSpace(b.Topik),
		Catatan:       trimPtr(b.Catatan),
		Tingkat:       trimPtr(b.Tingkat),
		MateriAjarID:  trimPtr(b.MateriAjarID),
		MateriAjarIDs: b.MateriAjarIDs,
		GuruID:        trimPtr(b.GuruID),
		KelasID:       trimPtr(b.KelasID),
		LibraryKind:   trimPtr(b.LibraryKind),
		LibraryAspect: trimPtr(b.LibraryAspect),
		LibraryRef:    trimPtr(b.LibraryRef),
		LibraryItems:  items,
	}, nil
}

func (h *Sesi) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	list, err := h.s.List(r.Context(), store.SesiListParams{
		From:    strings.TrimSpace(q.Get("from")),
		To:      strings.TrimSpace(q.Get("to")),
		Tingkat: strings.TrimSpace(q.Get("tingkat")),
		GuruID:  strings.TrimSpace(q.Get("guruId")),
		KelasID: strings.TrimSpace(q.Get("kelasId")),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Sesi) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	v, err := h.s.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Sesi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, v)
}

func (h *Sesi) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	var by string
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		by = c.UserID
	}
	v, err := h.s.Create(r.Context(), in, by)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan sesi")
		return
	}
	httpx.JSON(w, http.StatusCreated, v)
}

func (h *Sesi) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	v, err := h.s.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Sesi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, v)
}

func (h *Sesi) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Sesi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus sesi")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Sesi) Start(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	v, err := h.s.SetStarted(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Sesi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memulai sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, v)
}

func (h *Sesi) End(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	v, err := h.s.SetEnded(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Sesi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengakhiri sesi")
		return
	}
	// Best-effort: when the ending sesi is a Qur'an pengajian bound to a
	// kelas, drop a bacaan_log entry for each anggota so Kontrol Bacaan
	// reflects what was just covered. Failures are logged-only — we don't
	// fail the end-sesi response.
	h.maybeLogQuranBacaan(r.Context(), v)
	// Same idea for attendance: one row per kelas anggota with status=hadir
	// so the Kehadiran "Daftar Absen" tab includes this sesi alongside the
	// imported historical data.
	h.maybeLogAttendance(r.Context(), v)
	// Pencapaian: every taught materi (kurikulum or library) becomes a
	// per-anggota mastery row. Status follows the diajarkan row's
	// `completed` flag where available, otherwise defaults to "proses".
	h.maybeUpsertPencapaian(r.Context(), v)
	httpx.JSON(w, http.StatusOK, v)
}

// maybeUpsertPencapaian creates/updates pencapaian rows for every anggota
// based on what the sesi covered. Each kurikulum materi_ajar_id in
// sesi_materi and each entry in sesi_library becomes one pencapaian per
// murid. Status: "tuntas" when there's a completed diajarkan row for that
// item, else "proses". Failures are silently ignored.
func (h *Sesi) maybeUpsertPencapaian(ctx context.Context, s *store.Sesi) {
	if h.pencapaian == nil || h.kelas == nil || s == nil {
		return
	}
	if s.KelasID == nil || *s.KelasID == "" {
		return
	}
	anggota, err := h.kelas.ListAnggota(ctx, *s.KelasID)
	if err != nil || len(anggota) == 0 {
		return
	}
	// Pull diajarkan rows to know which items were marked completed.
	completedMateri := map[string]bool{}
	completedLib := map[string]bool{}
	if h.diajarkan != nil {
		taught, err := h.diajarkan.ListBySesi(ctx, s.ID)
		if err == nil {
			for _, d := range taught {
				if !d.Completed {
					continue
				}
				if d.Kind == "kurikulum" && d.MateriAjarID != nil {
					completedMateri[*d.MateriAjarID] = true
				} else if d.Ref != nil && *d.Ref != "" {
					completedLib[d.Kind+"|"+*d.Ref] = true
				}
			}
		}
	}
	tanggal := s.Tanggal
	if len(tanggal) > 10 {
		tanggal = tanggal[:10]
	}
	createdBy := ""
	if s.CreatedBy != nil {
		createdBy = *s.CreatedBy
	}
	for _, a := range anggota {
		muridID := a.MuridID
		// Kurikulum materi from sesi_materi.
		for _, mid := range s.MateriAjarIDs {
			if mid == "" {
				continue
			}
			status := "proses"
			if completedMateri[mid] {
				status = "tuntas"
			}
			mp := mid
			tt := tanggal
			_, _ = h.pencapaian.Upsert(ctx, store.PencapaianUpsertInput{
				MuridUserID:  muridID,
				MateriAjarID: &mp,
				Status:       status,
				Tanggal:      &tt,
			}, createdBy)
		}
		// Library refs from sesi_library.
		for _, lib := range s.LibraryItems {
			if lib.LibraryRef == "" || lib.Kind == "" {
				continue
			}
			status := "proses"
			if completedLib[lib.Kind+"|"+lib.LibraryRef] {
				status = "tuntas"
			}
			kind := lib.Kind
			ref := lib.LibraryRef
			aspect := lib.LibraryAspect
			tt := tanggal
			_, _ = h.pencapaian.Upsert(ctx, store.PencapaianUpsertInput{
				MuridUserID:   muridID,
				LibraryKind:   &kind,
				LibraryAspect: aspect,
				LibraryRef:    &ref,
				Status:        status,
				Tanggal:       &tt,
			}, createdBy)
		}
	}
}

// maybeLogAttendance creates attendance rows for each kelas anggota when a
// sesi ends. Skips when there is no kelas binding, no anggota, or no primary
// guru. Best-effort: failures are silently ignored to avoid breaking the
// end-sesi response. Duration defaults to (ended_at - started_at) in
// minutes, capped at 240 min (4 hours) to guard against runaway clocks.
func (h *Sesi) maybeLogAttendance(ctx context.Context, s *store.Sesi) {
	if h.kelas == nil || h.attendances == nil {
		return
	}
	if s == nil || s.KelasID == nil || *s.KelasID == "" {
		return
	}
	// Need a guru for teacher_id. Fall back to GuruID column then to the
	// first row in the kelas_guru join table.
	teacherID := ""
	if s.GuruID != nil && *s.GuruID != "" {
		teacherID = *s.GuruID
	} else {
		gurus, err := h.kelas.ListGuruAnggota(ctx, *s.KelasID)
		if err == nil {
			for _, g := range gurus {
				if g.IsPrimary {
					teacherID = g.GuruID
					break
				}
			}
			if teacherID == "" && len(gurus) > 0 {
				teacherID = gurus[0].GuruID
			}
		}
	}
	if teacherID == "" {
		return
	}
	anggota, err := h.kelas.ListAnggota(ctx, *s.KelasID)
	if err != nil || len(anggota) == 0 {
		return
	}

	date, err := time.Parse("2006-01-02", s.Tanggal[:min(len(s.Tanggal), 10)])
	if err != nil {
		return
	}
	var durationMin *int
	if s.StartedAt != nil && s.EndedAt != nil {
		st, errS := time.Parse(time.RFC3339Nano, *s.StartedAt)
		et, errE := time.Parse(time.RFC3339Nano, *s.EndedAt)
		if errS == nil && errE == nil && et.After(st) {
			mins := int(et.Sub(st).Minutes())
			if mins > 240 {
				mins = 240
			}
			if mins > 0 {
				durationMin = &mins
			}
		}
	}
	var materi *string
	if s.Topik != "" {
		t := s.Topik
		materi = &t
	}
	for _, a := range anggota {
		_, _ = h.attendances.Create(ctx, store.AttendanceInput{
			Date:        date,
			DurationMin: durationMin,
			TeacherID:   teacherID,
			StudentID:   a.MuridID,
			Status:      model.AttendanceStatus("hadir"),
			Materi:      materi,
		})
	}
}


// maybeLogQuranBacaan creates bacaan_log rows for kelas anggota when the
// sesi is a Qur'an session. The library_ref format is
//   "<surah>" | "<surah>:<ayat>" | "<surah>:<from>-<to>"
// matching MateriSourcePicker's buildQuranRef.
func (h *Sesi) maybeLogQuranBacaan(ctx context.Context, s *store.Sesi) {
	if h.kelas == nil || h.bacaan == nil {
		return
	}
	if s == nil || s.LibraryKind == nil || *s.LibraryKind != "quran" {
		return
	}
	if s.KelasID == nil || *s.KelasID == "" || s.LibraryRef == nil || *s.LibraryRef == "" {
		return
	}
	surah, from, to, ok := parseQuranRef(*s.LibraryRef)
	if !ok {
		return
	}
	anggota, err := h.kelas.ListAnggota(ctx, *s.KelasID)
	if err != nil || len(anggota) == 0 {
		return
	}
	createdBy := ""
	if s.CreatedBy != nil {
		createdBy = *s.CreatedBy
	}
	for _, a := range anggota {
		_, _ = h.bacaan.Create(ctx, store.BacaanInput{
			UserID:   a.MuridID,
			Source:   "pengajian",
			Tanggal:  s.Tanggal,
			Surah:    surah,
			AyatFrom: from,
			AyatTo:   to,
			SesiID:   &s.ID,
		}, createdBy)
	}
}

// SetLive accepts a sparse PATCH-style body to update the live-stage
// projection state (current materi + display mode) while a sesi is running.
type sesiLiveBody struct {
	LiveMateriID    *string `json:"liveMateriId,omitempty"`
	LiveDisplayMode *string `json:"liveDisplayMode,omitempty" validate:"omitempty,oneof=full title hidden"`
}

func (h *Sesi) SetLive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b sesiLiveBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", errBadJSON.Error())
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	v, err := h.s.SetLive(r.Context(), id, b.LiveMateriID, b.LiveDisplayMode)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Sesi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui live sesi")
		return
	}
	httpx.JSON(w, http.StatusOK, v)
}

func parseQuranRef(ref string) (surah, from, to int, ok bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return 0, 0, 0, false
	}
	parts := strings.SplitN(ref, ":", 2)
	s, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || s < 1 || s > 114 {
		return 0, 0, 0, false
	}
	if len(parts) == 1 {
		// Whole surah — we don't know the upper bound here; treat as 1..1
		// so progress at least nudges. The frontend usually fills the range.
		return s, 1, 1, true
	}
	right := strings.TrimSpace(parts[1])
	if right == "" {
		return s, 1, 1, true
	}
	if i := strings.IndexByte(right, '-'); i >= 0 {
		a, errA := strconv.Atoi(strings.TrimSpace(right[:i]))
		b, errB := strconv.Atoi(strings.TrimSpace(right[i+1:]))
		if errA != nil || errB != nil || a < 1 || b < a {
			return 0, 0, 0, false
		}
		return s, a, b, true
	}
	a, err := strconv.Atoi(right)
	if err != nil || a < 1 {
		return 0, 0, 0, false
	}
	return s, a, a, true
}
