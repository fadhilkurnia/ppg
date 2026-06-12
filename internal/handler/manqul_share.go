package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// ManqulShare handles per-ayah, per-recipient sharing of manqul notes. Every
// read is scoped to the caller: an owner only manages their own shares, and a
// viewer only reads manqul explicitly shared with them.
type ManqulShare struct {
	s     *store.ManqulShareStore
	users *store.Users
}

func NewManqulShare(s *store.ManqulShareStore, users *store.Users) *ManqulShare {
	return &ManqulShare{s: s, users: users}
}

// maxSharedAyat caps the IN-clause size on the shared-notes fetch (a mushaf
// page holds far fewer ayat than this; the cap just bounds abusive requests).
const maxSharedAyat = 300

// Available — GET /quran/manqul-shares/available?surah=S
// Owners who shared >=1 ayah in surah S with the caller. Drives the dropdown.
func (h *ManqulShare) Available(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	surah := strings.TrimSpace(r.URL.Query().Get("surah"))
	if surah == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parameter surah wajib")
		return
	}
	list, err := h.s.AvailableSources(r.Context(), c.UserID, surah)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil sumber manqul")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}

// Shared — GET /quran/manqul-shares/shared?owner=O&ayat=k1,k2,...
// Owner O's manqul notes for the listed ayat that are shared with the caller.
func (h *ManqulShare) Shared(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	q := r.URL.Query()
	owner := strings.TrimSpace(q.Get("owner"))
	if owner == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parameter owner wajib")
		return
	}
	var ayat []string
	for _, a := range strings.Split(q.Get("ayat"), ",") {
		if a = strings.TrimSpace(a); a != "" {
			ayat = append(ayat, a)
			if len(ayat) >= maxSharedAyat {
				break
			}
		}
	}
	notes, err := h.s.SharedNotes(r.Context(), c.UserID, owner, ayat)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil manqul")
		return
	}
	httpx.JSON(w, http.StatusOK, notes)
}

// Mine — GET /quran/manqul-shares/mine?ayat=K
// The recipients the caller has shared one ayah's manqul with (prefills dialog).
func (h *ManqulShare) Mine(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	ayat := strings.TrimSpace(r.URL.Query().Get("ayat"))
	if ayat == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Parameter ayat wajib")
		return
	}
	recips, err := h.s.RecipientsFor(r.Context(), c.UserID, ayat)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil penerima")
		return
	}
	httpx.JSON(w, http.StatusOK, recips)
}

type shareSetBody struct {
	KunciAyat        string   `json:"kunciAyat"`
	RecipientUserIDs []string `json:"recipientUserIds"`
}

// Set — POST /quran/manqul-shares  {kunciAyat, recipientUserIds:[]}
// Replaces the caller's recipient set for one ayah. Empty list unshares it.
// Returns the resulting recipient list (with names) so the UI can refresh.
func (h *ManqulShare) Set(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	var b shareSetBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	b.KunciAyat = strings.TrimSpace(b.KunciAyat)
	if b.KunciAyat == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Field kunciAyat wajib")
		return
	}
	if err := h.s.SetRecipients(r.Context(), c.UserID, b.KunciAyat, b.RecipientUserIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan berbagi manqul")
		return
	}
	recips, err := h.s.RecipientsFor(r.Context(), c.UserID, b.KunciAyat)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil penerima")
		return
	}
	httpx.JSON(w, http.StatusOK, recips)
}

// SearchRecipients — GET /quran/manqul-recipients?q=...
// Minimal user search (id/name/nickname/role) for the recipient picker. Needs
// >=2 chars to avoid blanket enumeration; excludes the caller.
func (h *ManqulShare) SearchRecipients(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) < 2 {
		httpx.JSON(w, http.StatusOK, []store.MiniUser{})
		return
	}
	list, err := h.users.SearchMinimal(r.Context(), q, c.UserID, 20)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mencari pengguna")
		return
	}
	httpx.JSON(w, http.StatusOK, list)
}
