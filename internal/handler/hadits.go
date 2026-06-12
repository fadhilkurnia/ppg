package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Hadits struct {
	s *store.HaditsStore
}

func NewHadits(s *store.HaditsStore) *Hadits { return &Hadits{s: s} }

// kitabFormBody — the full editable shape used by Create + full Update.
// All fields except Nama and Slug are optional. Pointer-string fields keep
// the SQL NULL distinction (empty string → NULL).
type kitabFormBody struct {
	Slug          string  `json:"slug"`
	Nama          string  `json:"nama"`
	NamaArab      *string `json:"namaArab"`
	Deskripsi     *string `json:"deskripsi"`
	Perawi        *string `json:"perawi"`
	Urutan        int     `json:"urutan"`
	Scope         string  `json:"scope"`
	JumlahHalaman int     `json:"jumlahHalaman"`
}

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	out := make([]rune, 0, len(s))
	prevDash := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			out = append(out, r)
			prevDash = false
		case r == ' ' || r == '-' || r == '_':
			if !prevDash && len(out) > 0 {
				out = append(out, '-')
				prevDash = true
			}
		}
	}
	res := string(out)
	res = strings.TrimRight(res, "-")
	return res
}

func (b *kitabFormBody) validate() (store.KitabInput, string) {
	b.Nama = strings.TrimSpace(b.Nama)
	if b.Nama == "" {
		return store.KitabInput{}, "Nama kitab wajib diisi"
	}
	if b.Slug == "" {
		b.Slug = slugify(b.Nama)
	}
	if b.Slug == "" {
		return store.KitabInput{}, "Slug tidak valid"
	}
	switch b.Scope {
	case "", "hadits", "maktabah", "both":
		// ok; "" → defaulted by store.
	default:
		return store.KitabInput{}, "Scope harus salah satu: hadits, maktabah, both"
	}
	if b.JumlahHalaman < 0 || b.JumlahHalaman > 10000 {
		return store.KitabInput{}, "Jumlah halaman harus 0-10000"
	}
	clean := func(p *string) *string {
		if p == nil {
			return nil
		}
		t := strings.TrimSpace(*p)
		if t == "" {
			return nil
		}
		return &t
	}
	return store.KitabInput{
		Slug:          b.Slug,
		Nama:          b.Nama,
		NamaArab:      clean(b.NamaArab),
		Deskripsi:     clean(b.Deskripsi),
		Perawi:        clean(b.Perawi),
		Urutan:        b.Urutan,
		Scope:         b.Scope,
		JumlahHalaman: b.JumlahHalaman,
	}, ""
}

// CreateKitab — admin endpoint.
func (h *Hadits) CreateKitab(w http.ResponseWriter, r *http.Request) {
	var b kitabFormBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	in, msg := b.validate()
	if msg != "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", msg)
		return
	}
	k, err := h.s.CreateKitab(r.Context(), in)
	if err != nil {
		if errors.Is(err, store.ErrHaditsKitabConflict) {
			httpx.Error(w, http.StatusConflict, "conflict", "Slug sudah dipakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan kitab")
		return
	}
	httpx.JSON(w, http.StatusCreated, k)
}

// UpdateKitab — admin endpoint. Accepts the full kitab form. Backwards-
// compatible: if the body only contains `jumlahHalaman` (the old PATCH
// shape), apply just that field.
func (h *Hadits) UpdateKitab(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var b kitabFormBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if strings.TrimSpace(b.Nama) == "" {
		if b.JumlahHalaman < 0 || b.JumlahHalaman > 10000 {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Jumlah halaman harus 0-10000")
			return
		}
		if err := h.s.UpdateKitabJumlahHalaman(r.Context(), slug, b.JumlahHalaman); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				httpx.Error(w, http.StatusNotFound, "not_found", "Kitab tidak ditemukan")
				return
			}
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui kitab")
			return
		}
		k, _ := h.s.GetKitabBySlug(r.Context(), slug)
		httpx.JSON(w, http.StatusOK, k)
		return
	}
	in, msg := b.validate()
	if msg != "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", msg)
		return
	}
	k, err := h.s.UpdateKitab(r.Context(), slug, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kitab tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui kitab")
		return
	}
	httpx.JSON(w, http.StatusOK, k)
}

// DeleteKitab — admin endpoint.
func (h *Hadits) DeleteKitab(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if err := h.s.DeleteKitab(r.Context(), slug); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kitab tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus kitab")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Hadits) ListKitab(w http.ResponseWriter, r *http.Request) {
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	list, err := h.s.ListKitab(r.Context(), scope)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar kitab")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

func (h *Hadits) GetKitab(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	k, err := h.s.GetKitabBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kitab tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil kitab")
		return
	}
	httpx.JSON(w, http.StatusOK, k)
}

func (h *Hadits) ListBab(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	k, err := h.s.GetKitabBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kitab tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil kitab")
		return
	}
	list, err := h.s.ListBab(r.Context(), k.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar bab")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

// ListHadits paginates hadits for a kitab (URL slug). Query params: babId,
// q, limit, offset. Response: { items, total, limit, offset }.
func (h *Hadits) ListHadits(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	k, err := h.s.GetKitabBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Kitab tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil kitab")
		return
	}
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	items, total, err := h.s.ListHadits(r.Context(), store.HaditsListParams{
		KitabID: k.ID,
		BabID:   strings.TrimSpace(q.Get("babId")),
		Query:   strings.TrimSpace(q.Get("q")),
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil hadits")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}
