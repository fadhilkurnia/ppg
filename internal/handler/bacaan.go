package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Bacaan struct {
	s         *store.Bacaan
	users     *store.Users
	validator *validator.Validate
}

func NewBacaan(s *store.Bacaan, users *store.Users) *Bacaan {
	return &Bacaan{s: s, users: users, validator: validator.New()}
}

type bacaanCreateBody struct {
	UserID   string  `json:"userId"   validate:"required"`
	Source   string  `json:"source"   validate:"omitempty,oneof=pengajian mandiri"`
	Tanggal  string  `json:"tanggal"  validate:"required,len=10"`
	Surah    int     `json:"surah"    validate:"required,gte=1,lte=114"`
	AyatFrom int     `json:"ayatFrom" validate:"required,gte=1,lte=300"`
	AyatTo   int     `json:"ayatTo"   validate:"required,gte=1,lte=300"`
	Catatan  *string `json:"catatan,omitempty"`
	SesiID   *string `json:"sesiId,omitempty"`
}

// scope resolves the user-id set the caller may interact with.
func (h *Bacaan) scope(r *http.Request) ([]string, string, string, error) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		return nil, "", "", errors.New("no claims")
	}
	u, err := h.users.FindByID(r.Context(), c.UserID)
	if err != nil {
		return nil, "", "", err
	}
	ids, err := h.s.VisibleUserIDs(r.Context(), u.ID, string(u.Role), u.Email)
	if err != nil {
		return nil, "", "", err
	}
	return ids, c.UserID, string(u.Role), nil
}

func inSet(set []string, v string) bool {
	for _, x := range set {
		if x == v {
			return true
		}
	}
	return false
}

func (h *Bacaan) List(w http.ResponseWriter, r *http.Request) {
	visible, _, _, err := h.scope(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "sesi habis")
		return
	}
	q := r.URL.Query()
	params := store.BacaanListParams{
		UserIDs: visible,
		UserID:  strings.TrimSpace(q.Get("userId")),
		From:    strings.TrimSpace(q.Get("from")),
		To:      strings.TrimSpace(q.Get("to")),
		Source:  strings.TrimSpace(q.Get("source")),
	}
	if params.UserID != "" && !inSet(visible, params.UserID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "tidak boleh melihat user ini")
		return
	}
	if n, err := strconv.Atoi(q.Get("limit")); err == nil {
		params.Limit = n
	}
	rows, err := h.s.List(r.Context(), params)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat log")
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

// PerSurah returns the per-surah breakdown for one user. Used by the
// Kontrol Bacaan page to render a pie chart per surah the user has read.
func (h *Bacaan) PerSurah(w http.ResponseWriter, r *http.Request) {
	visible, _, _, err := h.scope(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "sesi habis")
		return
	}
	userID := strings.TrimSpace(r.URL.Query().Get("userId"))
	if userID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "userId wajib")
		return
	}
	if !inSet(visible, userID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "tidak boleh melihat user ini")
		return
	}
	rows, err := h.s.PerSurah(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat per-surah")
		return
	}
	httpx.JSON(w, http.StatusOK, rows)
}

func (h *Bacaan) Summary(w http.ResponseWriter, r *http.Request) {
	visible, _, _, err := h.scope(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "sesi habis")
		return
	}
	sum, err := h.s.Summary(r.Context(), visible)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal menghitung ringkasan")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"totalQuranAyat": store.QuranTotalAyat,
		"items":          sum,
	})
}

func (h *Bacaan) Create(w http.ResponseWriter, r *http.Request) {
	visible, callerID, _, err := h.scope(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "sesi habis")
		return
	}
	var b bacaanCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if b.AyatTo < b.AyatFrom {
		b.AyatTo = b.AyatFrom
	}
	// Caller may only log for users they can see.
	if !inSet(visible, b.UserID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "tidak boleh menambah log untuk user ini")
		return
	}
	row, err := h.s.Create(r.Context(), store.BacaanInput{
		UserID:   b.UserID,
		Source:   b.Source,
		Tanggal:  b.Tanggal,
		Surah:    b.Surah,
		AyatFrom: b.AyatFrom,
		AyatTo:   b.AyatTo,
		Catatan:  b.Catatan,
		SesiID:   b.SesiID,
	}, callerID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal menyimpan log")
		return
	}
	httpx.JSON(w, http.StatusCreated, row)
}

func (h *Bacaan) Delete(w http.ResponseWriter, r *http.Request) {
	visible, callerID, role, err := h.scope(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "sesi habis")
		return
	}
	id := chi.URLParam(r, "id")
	// Check ownership for non-admin/pengurus/guru roles.
	target, err := h.s.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "log tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal memuat log")
		return
	}
	if !inSet(visible, target.UserID) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "akses ditolak")
		return
	}
	// Murid/ortu can only delete logs they created themselves.
	if role == "murid" || role == "ortu" {
		if target.RecordedBy == nil || *target.RecordedBy != callerID {
			httpx.Error(w, http.StatusForbidden, "forbidden", "hanya pencatat yang boleh hapus")
			return
		}
	}
	if err := h.s.Delete(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "gagal menghapus log")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
