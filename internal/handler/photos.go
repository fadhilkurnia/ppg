package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// Photos handles user-photo uploads. Files are written under photosDir on
// the data volume; the DB stores only the filename. The Get endpoint serves
// the file with a long cache.
type Photos struct {
	users     *store.Users
	photosDir string
}

func NewPhotos(users *store.Users, photosDir string) *Photos {
	return &Photos{users: users, photosDir: photosDir}
}

// allowedPhotoExt maps a sniffed MIME type to the on-disk extension we
// canonicalize to. Anything else is rejected.
var allowedPhotoExt = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

const maxPhotoBytes = 5 * 1024 * 1024 // 5 MB

// Upload accepts a multipart/form-data request with a "file" field, writes
// the bytes to <photosDir>/<ulid><ext>, updates the user's photo_path, and
// unlinks the previous photo if any.
func (h *Photos) Upload(w http.ResponseWriter, r *http.Request) {
	h.uploadFor(w, r, chi.URLParam(r, "id"))
}

// Delete clears the user's photo_path and unlinks the file.
func (h *Photos) Delete(w http.ResponseWriter, r *http.Request) {
	h.deleteFor(w, r, chi.URLParam(r, "id"))
}

// UploadMe / DeleteMe are self-service variants that use the authenticated
// user's id from JWT claims instead of a URL param. Wired under /api/auth/me
// so non-admin users can manage their own profile photo.
func (h *Photos) UploadMe(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok || c.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	h.uploadFor(w, r, c.UserID)
}

func (h *Photos) DeleteMe(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok || c.UserID == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized", "Sesi tidak ditemukan")
		return
	}
	h.deleteFor(w, r, c.UserID)
}

// uploadFor / deleteFor are the shared bodies of Upload/Delete and UploadMe/
// DeleteMe. The two top-level handlers differ only in how they resolve the
// target user id (URL param vs JWT claims).
func (h *Photos) uploadFor(w http.ResponseWriter, r *http.Request, id string) {
	if err := r.ParseMultipartForm(maxPhotoBytes + 1024); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Gagal membaca file")
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Field 'file' wajib diisi")
		return
	}
	defer file.Close()

	if hdr.Size > maxPhotoBytes {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large", "Foto maksimal 5 MB")
		return
	}

	head := make([]byte, 512)
	n, _ := file.Read(head)
	head = head[:n]
	mime := http.DetectContentType(head)
	ext, ok := allowedPhotoExt[mime]
	if !ok {
		httpx.Error(w, http.StatusUnsupportedMediaType, "unsupported", "Format foto harus JPEG, PNG, atau WebP")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memproses file")
		return
	}

	if err := os.MkdirAll(h.photosDir, 0o755); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyiapkan folder foto")
		return
	}

	filename := ulid.Make().String() + ext
	full := filepath.Join(h.photosDir, filename)
	dst, err := os.OpenFile(full, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan file")
		return
	}
	written, err := io.Copy(dst, io.LimitReader(file, maxPhotoBytes+1))
	closeErr := dst.Close()
	if err != nil || closeErr != nil {
		_ = os.Remove(full)
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menulis file")
		return
	}
	if written > maxPhotoBytes {
		_ = os.Remove(full)
		httpx.Error(w, http.StatusRequestEntityTooLarge, "too_large", "Foto maksimal 5 MB")
		return
	}

	prev, err := h.users.SetPhotoPath(r.Context(), id, &filename)
	if err != nil {
		_ = os.Remove(full)
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui pengguna")
		return
	}
	if prev != nil && *prev != "" && *prev != filename {
		_ = os.Remove(filepath.Join(h.photosDir, *prev))
	}

	user, _ := h.users.FindByID(r.Context(), id)
	httpx.JSON(w, http.StatusOK, user)
}

func (h *Photos) deleteFor(w http.ResponseWriter, r *http.Request, id string) {
	prev, err := h.users.SetPhotoPath(r.Context(), id, nil)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui pengguna")
		return
	}
	if prev != nil && *prev != "" {
		_ = os.Remove(filepath.Join(h.photosDir, *prev))
	}
	user, _ := h.users.FindByID(r.Context(), id)
	httpx.JSON(w, http.StatusOK, user)
}

// Serve streams the file located at <photosDir>/<filename>. Filenames are
// strictly checked to be a single path component to prevent traversal.
func (h *Photos) Serve(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if filename == "" || strings.ContainsAny(filename, "/\\") || filename == "." || filename == ".." {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "nama file tidak valid")
		return
	}
	full := filepath.Join(h.photosDir, filename)
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		httpx.Error(w, http.StatusNotFound, "not_found", "foto tidak ditemukan")
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	http.ServeFile(w, r, full)
}
