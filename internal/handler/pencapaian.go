package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// tilawatiLearningStart is the first page (1-indexed) that counts as
// learning content. Every jilid opens with two intro pages (cover +
// table of contents) that must not be referenced by an achievement
// row. Keep in sync with web/app/src/lib/tilawati.ts.
const tilawatiLearningStart = 3

type Pencapaian struct {
	s         *store.PencapaianStore
	users     *store.Users
	validator *validator.Validate
}

func NewPencapaian(s *store.PencapaianStore, users *store.Users) *Pencapaian {
	return &Pencapaian{s: s, users: users, validator: validator.New()}
}

// canSeeMurid returns true when the caller is allowed to view pencapaian
// for the given murid id. Mirrors the bacaan visibility rules.
func (h *Pencapaian) canSeeMurid(r *http.Request, muridUserID string) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	caller, err := h.users.FindByID(r.Context(), c.UserID)
	if err != nil {
		return false
	}
	role := string(caller.Role)
	switch role {
	case "admin", "pengurus", "guru":
		return true
	case "ortu":
		// Match by parent_email.
		m, err := h.users.FindByID(r.Context(), muridUserID)
		if err != nil {
			return false
		}
		return m.ParentEmail != nil &&
			strings.EqualFold(strings.TrimSpace(*m.ParentEmail), strings.TrimSpace(caller.Email))
	case "murid":
		return caller.ID == muridUserID
	default:
		return false
	}
}

func (h *Pencapaian) canEdit(r *http.Request) bool {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return false
	}
	switch string(c.Role) {
	case "admin", "pengurus", "guru":
		return true
	}
	return false
}

// List returns one row per materi_ajar in the umur range, with the
// matching pencapaian (if any) joined. Requires `muridUserId`.
func (h *Pencapaian) List(w http.ResponseWriter, r *http.Request) {
	muridID := strings.TrimSpace(r.URL.Query().Get("muridUserId"))
	if muridID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "muridUserId wajib")
		return
	}
	if !h.canSeeMurid(r, muridID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "tidak boleh melihat murid ini")
		return
	}
	p := store.PencapaianListParams{MuridUserID: muridID}
	if v := r.URL.Query().Get("fromUmur"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "fromUmur tidak valid")
			return
		}
		p.FromUmur = &n
	}
	if v := r.URL.Query().Get("fromSem"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || (n != 1 && n != 2) {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "fromSem harus 1 atau 2")
			return
		}
		p.FromSem = &n
	}
	if v := r.URL.Query().Get("toUmur"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "toUmur tidak valid")
			return
		}
		p.ToUmur = &n
	}
	if v := r.URL.Query().Get("toSem"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || (n != 1 && n != 2) {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "toSem harus 1 atau 2")
			return
		}
		p.ToSem = &n
	}
	items, err := h.s.ListForMurid(r.Context(), p)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat pencapaian")
		return
	}
	// Flatten for JSON: a list of {materi, umur, pencapaian}.
	type row struct {
		Materi     store.MateriAjar  `json:"materi"`
		Umur       *int              `json:"umur,omitempty"`
		Pencapaian *store.Pencapaian `json:"pencapaian,omitempty"`
	}
	out := make([]row, 0, len(items))
	for _, it := range items {
		out = append(out, row{Materi: it.Materi, Umur: it.Umur, Pencapaian: it.Pencapaian})
	}
	httpx.JSON(w, http.StatusOK, out)
}

// ListLibrary returns every library-style pencapaian row for one murid —
// the kurikulum List handler omits these because they have no matching
// materi_ajar. Frontend uses this for the "Library" section on Achievement.
func (h *Pencapaian) ListLibrary(w http.ResponseWriter, r *http.Request) {
	muridID := strings.TrimSpace(r.URL.Query().Get("muridUserId"))
	if muridID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "muridUserId wajib")
		return
	}
	if !h.canSeeMurid(r, muridID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "tidak boleh melihat murid ini")
		return
	}
	rows, err := h.s.ListLibraryForMurid(r.Context(), muridID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat library pencapaian")
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

type pencapaianUpsertBody struct {
	MuridUserID   string  `json:"muridUserId"  validate:"required"`
	MateriAjarID  *string `json:"materiAjarId,omitempty"`
	LibraryKind   *string `json:"libraryKind,omitempty"   validate:"omitempty,oneof=quran hadits tilawati doa"`
	LibraryAspect *string `json:"libraryAspect,omitempty" validate:"omitempty,oneof=reciting memorizing review manqul"`
	LibraryRef    *string `json:"libraryRef,omitempty"    validate:"omitempty,max=500"`
	Status        string  `json:"status"       validate:"required,oneof=belum proses tuntas"`
	NilaiAngka    *int    `json:"nilaiAngka,omitempty"   validate:"omitempty,gte=0,lte=100"`
	NilaiHuruf    *string `json:"nilaiHuruf,omitempty"   validate:"omitempty,max=4"`
	Tanggal       *string `json:"tanggal,omitempty"`
	Catatan       *string `json:"catatan,omitempty"`
}

func (h *Pencapaian) Upsert(w http.ResponseWriter, r *http.Request) {
	if !h.canEdit(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "hanya admin/pengurus/guru")
		return
	}
	var b pencapaianUpsertBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if b.LibraryKind != nil && *b.LibraryKind == "tilawati" && b.LibraryRef != nil {
		if err := validateTilawatiRef(*b.LibraryRef); err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
	}
	c, _ := auth.ClaimsFrom(r.Context())
	row, err := h.s.Upsert(r.Context(), store.PencapaianUpsertInput{
		MuridUserID:   b.MuridUserID,
		MateriAjarID:  b.MateriAjarID,
		LibraryKind:   b.LibraryKind,
		LibraryAspect: b.LibraryAspect,
		LibraryRef:    b.LibraryRef,
		Status:        b.Status,
		NilaiAngka:    b.NilaiAngka,
		NilaiHuruf:    b.NilaiHuruf,
		Tanggal:       b.Tanggal,
		Catatan:       b.Catatan,
	}, c.UserID)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, row)
}

// validateTilawatiRef rejects refs that point at the intro spread of a
// jilid. Accepted forms: "<jilid>", "<jilid>:<page>", "<jilid>:<a>-<b>".
// Pages 1 and 2 of every jilid are cover/index and must not be linked
// to an achievement row.
func validateTilawatiRef(ref string) error {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil
	}
	parts := strings.SplitN(ref, ":", 2)
	if len(parts) < 2 || parts[1] == "" {
		// Whole-jilid ref — no page numbers to police.
		return nil
	}
	rangeStr := parts[1]
	checkPage := func(s string) error {
		n, err := strconv.Atoi(strings.TrimSpace(s))
		if err != nil {
			return fmt.Errorf("halaman tilawati tidak valid: %q", s)
		}
		if n < tilawatiLearningStart {
			return fmt.Errorf("halaman %d tidak dihitung — halaman pembuka jilid (1-%d) bukan materi belajar",
				n, tilawatiLearningStart-1)
		}
		return nil
	}
	if i := strings.Index(rangeStr, "-"); i >= 0 {
		if err := checkPage(rangeStr[:i]); err != nil {
			return err
		}
		return checkPage(rangeStr[i+1:])
	}
	return checkPage(rangeStr)
}

func (h *Pencapaian) Delete(w http.ResponseWriter, r *http.Request) {
	if !h.canEdit(r) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "hanya admin/pengurus/guru")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.s.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "pencapaian tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal menghapus")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
