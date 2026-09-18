package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

func (a *Auth) ListUserPhones(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
		return
	}

	if a.userPhones == nil {
		httpx.JSON(w, http.StatusOK, []model.UserPhone{})
		return
	}

	phones, err := a.userPhones.ListByUserID(r.Context(), claims.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memuat daftar nomor WhatsApp: "+err.Error())
		return
	}

	// If table empty but user has phone column, auto backfill this user
	if len(phones) == 0 {
		user, err := a.users.FindByID(r.Context(), claims.UserID)
		if err == nil && user != nil && user.Phone != nil && *user.Phone != "" {
			newP, err := a.userPhones.AddPhone(r.Context(), claims.UserID, *user.Phone, true)
			if err == nil && newP != nil {
				phones = []model.UserPhone{*newP}
			}
		}
	}

	if phones == nil {
		phones = []model.UserPhone{}
	}

	httpx.JSON(w, http.StatusOK, phones)
}

func (a *Auth) SetPrimaryUserPhone(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
		return
	}

	phoneID := chi.URLParam(r, "id")
	if phoneID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "ID nomor telepon wajib disertakan")
		return
	}

	if a.userPhones == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Fitur nomor telepon belum aktif")
		return
	}

	if err := a.userPhones.SetPrimary(r.Context(), claims.UserID, phoneID); err != nil {
		if err == store.ErrNotFound {
			httpx.Error(w, http.StatusNotFound, "not_found", "Nomor telepon tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengubah nomor utama: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *Auth) DeleteUserPhone(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFrom(r.Context())
	if !ok || claims.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak valid")
		return
	}

	phoneID := chi.URLParam(r, "id")
	if phoneID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "ID nomor telepon wajib disertakan")
		return
	}

	if a.userPhones == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "unavailable", "Fitur nomor telepon belum aktif")
		return
	}

	if err := a.userPhones.Delete(r.Context(), claims.UserID, phoneID); err != nil {
		if err == store.ErrNotFound {
			httpx.Error(w, http.StatusNotFound, "not_found", "Nomor telepon tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus nomor telepon: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
