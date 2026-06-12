package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Manqul struct {
	s *store.ManqulStore
}

func NewManqul(s *store.ManqulStore) *Manqul { return &Manqul{s: s} }

func (h *Manqul) List(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	surah := strings.TrimSpace(r.URL.Query().Get("surah"))
	list, err := h.s.List(r.Context(), c.UserID, surah)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil catatan")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

type manqulUpsertBody struct {
	KunciAyat string `json:"kunciAyat"`
	WordIdx   int    `json:"wordIdx"`
	Teks      string `json:"teks"`
}

func (h *Manqul) Upsert(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	var b manqulUpsertBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	b.KunciAyat = strings.TrimSpace(b.KunciAyat)
	if b.KunciAyat == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Field kunciAyat wajib")
		return
	}
	n, err := h.s.Upsert(r.Context(), c.UserID, b.KunciAyat, b.WordIdx, strings.TrimSpace(b.Teks))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan catatan")
		return
	}
	if n == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"deleted": true})
		return
	}
	httpx.JSON(w, http.StatusOK, n)
}
