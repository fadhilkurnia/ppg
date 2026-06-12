package handler

import (
	"encoding/json"
	"net/http"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Settings struct {
	s *store.Settings
}

func NewSettings(s *store.Settings) *Settings { return &Settings{s: s} }

// List returns every setting as a flat object. This endpoint is public-ish
// (auth-required only, no admin gate) so the Layout can show the instansi
// branding to any logged-in user.
func (h *Settings) List(w http.ResponseWriter, r *http.Request) {
	m, err := h.s.GetAll(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memuat settings")
		return
	}
	httpx.JSON(w, http.StatusOK, m)
}

type settingsPatchBody struct {
	Updates map[string]string `json:"updates" validate:"required"`
}

// Update applies a batch of key/value updates. Admin only.
func (h *Settings) Update(w http.ResponseWriter, r *http.Request) {
	var b settingsPatchBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "format salah")
		return
	}
	for k, v := range b.Updates {
		if err := h.s.Set(r.Context(), k, v); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "gagal simpan: "+k)
			return
		}
	}
	m, _ := h.s.GetAll(r.Context())
	httpx.JSON(w, http.StatusOK, m)
}
