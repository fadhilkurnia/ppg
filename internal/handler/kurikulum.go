package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Kurikulum struct {
	k         *store.Kurikulum
	validator *validator.Validate
}

func NewKurikulum(k *store.Kurikulum) *Kurikulum {
	return &Kurikulum{k: k, validator: validator.New()}
}

func (h *Kurikulum) ListTingkat(w http.ResponseWriter, r *http.Request) {
	list, err := h.k.ListTingkat(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar tingkat")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Kurikulum) ListMateriAjar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	semester, _ := strconv.Atoi(q.Get("semester"))
	list, err := h.k.ListMateriAjar(r.Context(), store.MateriAjarListParams{
		Tingkat:  q.Get("tingkat"),
		Tema:     q.Get("tema"),
		Semester: semester,
		Query:    q.Get("q"),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar materi ajar")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

type tingkatBody struct {
	Nama   string `json:"nama"   validate:"required,max=100"`
	Urutan int    `json:"urutan" validate:"gte=0,lte=10000"`
	Umur   *int   `json:"umur"   validate:"omitempty,gte=0,lte=120"`
}

func (h *Kurikulum) parseTingkat(r *http.Request) (store.TingkatInput, error) {
	var b tingkatBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.TingkatInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.TingkatInput{}, err
	}
	return store.TingkatInput{
		Nama:   strings.TrimSpace(b.Nama),
		Urutan: b.Urutan,
		Umur:   b.Umur,
	}, nil
}

func (h *Kurikulum) GetTingkat(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	t, err := h.k.GetTingkat(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Tingkat tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data tingkat")
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *Kurikulum) CreateTingkat(w http.ResponseWriter, r *http.Request) {
	in, err := h.parseTingkat(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	t, err := h.k.CreateTingkat(r.Context(), in)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama tingkat sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan tingkat")
		return
	}
	httpx.JSON(w, http.StatusCreated, t)
}

func (h *Kurikulum) UpdateTingkat(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parseTingkat(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	t, err := h.k.UpdateTingkat(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Tingkat tidak ditemukan")
			return
		}
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Nama tingkat sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui tingkat")
		return
	}
	httpx.JSON(w, http.StatusOK, t)
}

func (h *Kurikulum) DeleteTingkat(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.k.DeleteTingkat(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Tingkat tidak ditemukan")
			return
		}
		if errors.Is(err, store.ErrTingkatInUse) {
			httpx.Error(w, http.StatusConflict, "in_use", "Tingkat masih dipakai materi ajar, tidak bisa dihapus")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus tingkat")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

type materiAjarBody struct {
	KodeMateri       string  `json:"kodeMateri"        validate:"required,max=100"`
	RefRaportID      *string `json:"refRaportId,omitempty"`
	Tingkat          string  `json:"tingkat"           validate:"required,max=100"`
	Tema             string  `json:"tema"              validate:"required,max=200"`
	SubTema          string  `json:"subTema"           validate:"required,max=500"`
	KelompokMateri   *string `json:"kelompokMateri,omitempty"`
	DetailMateri     string  `json:"detailMateri"      validate:"required"`
	Semester         int     `json:"semester"          validate:"required,oneof=1 2"`
	Kategori         string  `json:"kategori"          validate:"required,oneof=baru lanjutan mengulang"`
	RefSourceTingkat *string `json:"refSourceTingkat,omitempty"`
	RefSourceKode    *string `json:"refSourceKode,omitempty"`
	PerluReviewOrtu  bool    `json:"perluReviewOrtu"`
	Progresif        bool    `json:"progresif"`
	LibraryRelation  *string `json:"libraryRelation,omitempty"`
}

func (h *Kurikulum) parseMateriAjar(r *http.Request) (store.MateriAjarInput, error) {
	var b materiAjarBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.MateriAjarInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.MateriAjarInput{}, err
	}
	return store.MateriAjarInput{
		KodeMateri:       strings.TrimSpace(b.KodeMateri),
		RefRaportID:      trimPtr(b.RefRaportID),
		Tingkat:          strings.TrimSpace(b.Tingkat),
		Tema:             strings.TrimSpace(b.Tema),
		SubTema:          strings.TrimSpace(b.SubTema),
		KelompokMateri:   trimPtr(b.KelompokMateri),
		DetailMateri:     strings.TrimSpace(b.DetailMateri),
		Semester:         b.Semester,
		Kategori:         b.Kategori,
		RefSourceTingkat: trimPtr(b.RefSourceTingkat),
		RefSourceKode:    trimPtr(b.RefSourceKode),
		PerluReviewOrtu:  b.PerluReviewOrtu,
		Progresif:        b.Progresif,
		LibraryRelation:  trimPtr(b.LibraryRelation),
	}, nil
}

func (h *Kurikulum) GetMateriAjar(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	m, err := h.k.GetMateriAjar(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Materi ajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil materi ajar")
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

func (h *Kurikulum) CreateMateriAjar(w http.ResponseWriter, r *http.Request) {
	in, err := h.parseMateriAjar(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	m, err := h.k.CreateMateriAjar(r.Context(), in)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Kode materi sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan materi ajar")
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

func (h *Kurikulum) UpdateMateriAjar(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parseMateriAjar(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	m, err := h.k.UpdateMateriAjar(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Materi ajar tidak ditemukan")
			return
		}
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Kode materi sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui materi ajar")
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

// DeleteTema cascades a delete to every materi_ajar row with the given tema.
// Used by the kurikulum settings UI when admin removes an entire tema group.
func (h *Kurikulum) DeleteTema(w http.ResponseWriter, r *http.Request) {
	tema := chi.URLParam(r, "tema")
	if strings.TrimSpace(tema) == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Tema wajib")
		return
	}
	n, err := h.k.DeleteByTema(r.Context(), tema)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus tema")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"deleted": n})
}

// DeleteSubTema cascades a delete to every materi_ajar row matching
// (tema, subTema).
func (h *Kurikulum) DeleteSubTema(w http.ResponseWriter, r *http.Request) {
	tema := chi.URLParam(r, "tema")
	subTema := chi.URLParam(r, "subTema")
	if strings.TrimSpace(tema) == "" || strings.TrimSpace(subTema) == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Tema dan sub-tema wajib")
		return
	}
	n, err := h.k.DeleteBySubTema(r.Context(), tema, subTema)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus sub-tema")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"deleted": n})
}

func (h *Kurikulum) DeleteMateriAjar(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.k.DeleteMateriAjar(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Materi ajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus materi ajar")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// isUniqueViolation does a best-effort detection of SQLite UNIQUE constraint
// errors. mattn/go-sqlite3 returns errors whose Error() contains
// "UNIQUE constraint failed".
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// ---------------------------------------------------- Library refs / relations

func (h *Kurikulum) ListLibraryRefs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	list, err := h.k.ListLibraryRefs(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat library refs")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

type libraryRefBody struct {
	LibraryKind   string  `json:"libraryKind"   validate:"required,oneof=quran hadits tilawati doa"`
	LibraryAspect *string `json:"libraryAspect,omitempty" validate:"omitempty,oneof=reciting memorizing review manqul"`
	LibraryRef    string  `json:"libraryRef"    validate:"required,max=500"`
}

func (h *Kurikulum) AddLibraryRef(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b libraryRefBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	row, err := h.k.AddLibraryRef(r.Context(), id, b.LibraryKind, strings.TrimSpace(b.LibraryRef), b.LibraryAspect)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal menambah library ref")
		return
	}
	httpx.JSON(w, http.StatusCreated, row)
}

func (h *Kurikulum) DeleteLibraryRef(w http.ResponseWriter, r *http.Request) {
	refID := chi.URLParam(r, "refId")
	if err := h.k.DeleteLibraryRef(r.Context(), refID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "ref tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal hapus")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Kurikulum) ListRelations(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ids, err := h.k.ListRelations(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat relasi")
		return
	}
	httpx.JSON(w, http.StatusOK, ids)
}

type relationBody struct {
	OtherMateriID string `json:"otherMateriId" validate:"required"`
}

func (h *Kurikulum) AddRelation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b relationBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.k.AddRelation(r.Context(), id, b.OtherMateriID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Kurikulum) DeleteRelation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	other := chi.URLParam(r, "otherId")
	if err := h.k.DeleteRelation(r.Context(), id, other); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "relasi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal hapus")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
