package handler

import (
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

type Users struct {
	users     *store.Users
	validator *validator.Validate
}

func NewUsers(users *store.Users) *Users {
	return &Users{users: users, validator: validator.New()}
}

type userCreateBody struct {
	// Auth
	Email    string  `json:"email"    validate:"required,email,max=200"`
	Username *string `json:"username,omitempty" validate:"omitempty,min=3,max=64"`
	Name     string  `json:"name"     validate:"required,max=200"`
	Password string  `json:"password" validate:"required,min=6,max=200"`
	Role     string  `json:"role"     validate:"required,oneof=admin staff pengurus guru ortu murid"`

	// Shared profile
	Nickname    *string `json:"nickname,omitempty"     validate:"omitempty,max=200"`
	DateOfBirth *string `json:"dateOfBirth,omitempty"  validate:"omitempty,datetime=2006-01-02"`
	Gender      *string `json:"gender,omitempty"       validate:"omitempty,oneof=male female"`
	NoHP        *string `json:"noHp,omitempty"         validate:"omitempty,max=64"`
	Alamat      *string `json:"alamat,omitempty"       validate:"omitempty,max=500"`
	Kelompok    *string `json:"kelompok,omitempty"     validate:"omitempty,max=200"`

	// Murid
	Level             *string `json:"level,omitempty"             validate:"omitempty,oneof=Caberawit 'Pra Remaja' Remaja 'Pra Nikah'"`
	ParentName        *string `json:"parentName,omitempty"        validate:"omitempty,max=200"`
	ParentTitle       *string `json:"parentTitle,omitempty"       validate:"omitempty,max=80"`
	ParentPhone       *string `json:"parentPhone,omitempty"       validate:"omitempty,max=64"`
	ParentPhoneRegion *string `json:"parentPhoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	ParentEmail       *string `json:"parentEmail,omitempty"       validate:"omitempty,email"`

	// Locality + free-form notes (kept available to all roles).
	Desa   *string `json:"desa,omitempty"   validate:"omitempty,max=200"`
	Daerah *string `json:"daerah,omitempty" validate:"omitempty,max=200"`
	Notes  *string `json:"notes,omitempty"  validate:"omitempty,max=2000"`

	// Taaruf-style biodata extensions.
	UserCode    *string `json:"userCode,omitempty"    validate:"omitempty,max=40"`
	TempatLahir *string `json:"tempatLahir,omitempty" validate:"omitempty,max=120"`
	Pendidikan  *string `json:"pendidikan,omitempty"  validate:"omitempty,max=80"`
	Pekerjaan   *string `json:"pekerjaan,omitempty"   validate:"omitempty,max=80"`
	Urutan      *int    `json:"urutan,omitempty"      validate:"omitempty,gte=0,lte=100000"`
	HideDob     *bool   `json:"hideDob,omitempty"`
	TglDaftar   *string `json:"tglDaftar,omitempty"   validate:"omitempty,datetime=2006-01-02"`
}

type userUpdateBody struct {
	Email    *string `json:"email,omitempty"    validate:"omitempty,email,max=200"`
	Username *string `json:"username,omitempty" validate:"omitempty,min=3,max=64"`
	Name     *string `json:"name,omitempty"     validate:"omitempty,max=200"`
	Role     *string `json:"role,omitempty"     validate:"omitempty,oneof=admin staff pengurus guru ortu murid"`
	Active   *bool   `json:"active,omitempty"`

	Nickname    *string `json:"nickname,omitempty"     validate:"omitempty,max=200"`
	DateOfBirth *string `json:"dateOfBirth,omitempty"  validate:"omitempty"`
	Gender      *string `json:"gender,omitempty"       validate:"omitempty"`
	NoHP        *string `json:"noHp,omitempty"         validate:"omitempty,max=64"`
	Alamat      *string `json:"alamat,omitempty"       validate:"omitempty,max=500"`
	Kelompok    *string `json:"kelompok,omitempty"     validate:"omitempty,max=200"`

	Level             *string `json:"level,omitempty"             validate:"omitempty"`
	ParentName        *string `json:"parentName,omitempty"        validate:"omitempty,max=200"`
	ParentTitle       *string `json:"parentTitle,omitempty"       validate:"omitempty,max=80"`
	ParentPhone       *string `json:"parentPhone,omitempty"       validate:"omitempty,max=64"`
	ParentPhoneRegion *string `json:"parentPhoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	ParentEmail       *string `json:"parentEmail,omitempty"       validate:"omitempty"`

	Desa   *string `json:"desa,omitempty"   validate:"omitempty,max=200"`
	Daerah *string `json:"daerah,omitempty" validate:"omitempty,max=200"`
	Notes  *string `json:"notes,omitempty"  validate:"omitempty,max=2000"`

	// Taaruf-style biodata extensions.
	UserCode    *string `json:"userCode,omitempty"    validate:"omitempty,max=40"`
	TempatLahir *string `json:"tempatLahir,omitempty" validate:"omitempty,max=120"`
	Pendidikan  *string `json:"pendidikan,omitempty"  validate:"omitempty,max=80"`
	Pekerjaan   *string `json:"pekerjaan,omitempty"   validate:"omitempty,max=80"`
	Urutan      *int    `json:"urutan,omitempty"      validate:"omitempty,gte=0,lte=100000"`
	HideDob     *bool   `json:"hideDob,omitempty"`
	TglDaftar   *string `json:"tglDaftar,omitempty"   validate:"omitempty"`
}

type passwordBody struct {
	Password string `json:"password" validate:"required,min=6,max=200"`
}

func (h *Users) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	params := store.UserListParams{
		Query:  q.Get("q"),
		Role:   q.Get("role"),
		Limit:  limit,
		Offset: offset,
	}
	if v := q.Get("active"); v != "" {
		b := v == "true" || v == "1"
		params.Active = &b
	}

	res, err := h.users.List(r.Context(), params)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar pengguna")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Users) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	u, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}

func (h *Users) Create(w http.ResponseWriter, r *http.Request) {
	var b userCreateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	b.Email = strings.ToLower(strings.TrimSpace(b.Email))
	b.Name = strings.TrimSpace(b.Name)
	if b.Username != nil {
		v := strings.TrimSpace(*b.Username)
		if v == "" {
			b.Username = nil
		} else {
			b.Username = &v
		}
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	in := store.UserCreateInput{
		Email:       b.Email,
		Username:    b.Username,
		Password:    b.Password,
		Name:        b.Name,
		Role:        model.Role(b.Role),
		Nickname:    trimOptional(b.Nickname),
		Gender:      b.Gender,
		NoHP:        trimOptional(b.NoHP),
		Alamat:      trimOptional(b.Alamat),
		Kelompok:    trimOptional(b.Kelompok),
		ParentName:        trimOptional(b.ParentName),
		ParentTitle:       trimOptional(b.ParentTitle),
		ParentPhone:       trimOptional(b.ParentPhone),
		ParentPhoneRegion: trimOptional(b.ParentPhoneRegion),
		ParentEmail:       trimOptional(b.ParentEmail),
		Desa:   trimOptional(b.Desa),
		Daerah: trimOptional(b.Daerah),
		Notes:  trimOptional(b.Notes),
	}
	if b.Level != nil && *b.Level != "" {
		lvl := model.StudentLevel(*b.Level)
		in.Level = &lvl
	}
	if dob, ok := parseOptDate(b.DateOfBirth); ok {
		in.DateOfBirth = dob
	}
	// Taaruf-style biodata.
	in.UserCode = trimOptional(b.UserCode)
	in.TempatLahir = trimOptional(b.TempatLahir)
	in.Pendidikan = trimOptional(b.Pendidikan)
	in.Pekerjaan = trimOptional(b.Pekerjaan)
	if b.Urutan != nil {
		in.Urutan = *b.Urutan
	}
	if b.HideDob != nil {
		in.HideDob = *b.HideDob
	}
	if td, ok := parseOptDate(b.TglDaftar); ok {
		in.TglDaftar = td
	}

	u, err := h.users.Create(r.Context(), in)
	if err != nil {
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Email atau nama pengguna sudah terpakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan pengguna")
		return
	}
	httpx.JSON(w, http.StatusCreated, u)
}

func (h *Users) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b userUpdateBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if b.Email != nil {
		v := strings.ToLower(strings.TrimSpace(*b.Email))
		b.Email = &v
	}
	if b.Name != nil {
		v := strings.TrimSpace(*b.Name)
		b.Name = &v
	}
	// Username: trim; an empty string is a clear-to-NULL request (handled
	// by the store's addStr()). Skip the min=3 rule in that case so the
	// documented clear path still works.
	if b.Username != nil {
		v := strings.TrimSpace(*b.Username)
		b.Username = &v
	}
	skipUsername := b.Username != nil && *b.Username == ""
	if skipUsername {
		saved := b.Username
		b.Username = nil
		err := h.validator.Struct(b)
		b.Username = saved
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
	} else if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	// Admin-only role change (unified-user mechanism). The router already
	// gates create/delete to admin, but Update can be reached by other
	// roles for self-edits — block role changes from non-admin callers.
	claims, _ := auth.ClaimsFrom(r.Context())
	if b.Role != nil && (claims == nil || claims.Role != model.RoleAdmin) {
		httpx.Error(w, http.StatusForbidden, "forbidden",
			"Hanya admin yang boleh mengubah role pengguna")
		return
	}

	// Self-protection: prevent last-admin lockout.
	if claims != nil && claims.UserID == id {
		willDemote := b.Role != nil && *b.Role != string(model.RoleAdmin)
		willDeactivate := b.Active != nil && !*b.Active
		if willDemote || willDeactivate {
			n, err := h.users.CountAdmins(r.Context())
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memeriksa jumlah admin")
				return
			}
			if n <= 1 {
				httpx.Error(w, http.StatusBadRequest, "last_admin",
					"Tidak bisa menonaktifkan atau menurunkan role admin terakhir")
				return
			}
		}
	}

	in := store.UserUpdateInput{
		Email:       b.Email,
		Username:    b.Username,
		Name:        b.Name,
		Active:      b.Active,
		Nickname:    b.Nickname,
		NoHP:        b.NoHP,
		Alamat:      b.Alamat,
		Kelompok:    b.Kelompok,
		ParentName:        b.ParentName,
		ParentTitle:       b.ParentTitle,
		ParentPhone:       b.ParentPhone,
		ParentPhoneRegion: b.ParentPhoneRegion,
		ParentEmail:       b.ParentEmail,
		Desa:   b.Desa,
		Daerah: b.Daerah,
		Notes:  b.Notes,
	}
	if b.Role != nil {
		rr := model.Role(*b.Role)
		in.Role = &rr
	}
	if b.Gender != nil {
		in.Gender = b.Gender
	}
	if b.Level != nil {
		if *b.Level == "" {
			in.ClearLevel = true
		} else if isValidLevel(*b.Level) {
			lvl := model.StudentLevel(*b.Level)
			in.Level = &lvl
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Level tidak valid")
			return
		}
	}
	if b.DateOfBirth != nil {
		if *b.DateOfBirth == "" {
			in.ClearDateOfBirth = true
		} else if d, ok := parseOptDate(b.DateOfBirth); ok && d != nil {
			in.DateOfBirth = d
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Format tanggal lahir tidak valid (YYYY-MM-DD)")
			return
		}
	}
	// Taaruf-style biodata.
	in.UserCode = b.UserCode
	in.TempatLahir = b.TempatLahir
	in.Pendidikan = b.Pendidikan
	in.Pekerjaan = b.Pekerjaan
	in.Urutan = b.Urutan
	in.HideDob = b.HideDob
	if b.TglDaftar != nil {
		if *b.TglDaftar == "" {
			in.ClearTglDaftar = true
		} else if d, ok := parseOptDate(b.TglDaftar); ok && d != nil {
			in.TglDaftar = d
		} else {
			httpx.Error(w, http.StatusBadRequest, "bad_request", "Format tanggal daftar tidak valid (YYYY-MM-DD)")
			return
		}
	}

	u, err := h.users.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		if isUniqueConflict(err) {
			httpx.Error(w, http.StatusConflict, "conflict", "Email atau nama pengguna sudah terpakai")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui pengguna")
		return
	}
	httpx.JSON(w, http.StatusOK, u)
}

func (h *Users) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	claims, _ := auth.ClaimsFrom(r.Context())
	if claims != nil && claims.UserID == id {
		httpx.Error(w, http.StatusBadRequest, "self_delete", "Tidak bisa menghapus akun yang sedang login")
		return
	}

	target, err := h.users.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data pengguna")
		return
	}
	if target.Role == model.RoleAdmin && target.Active {
		n, err := h.users.CountAdmins(r.Context())
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memeriksa jumlah admin")
			return
		}
		if n <= 1 {
			httpx.Error(w, http.StatusBadRequest, "last_admin",
				"Tidak bisa menghapus admin terakhir")
			return
		}
	}

	if err := h.users.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus pengguna")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func (h *Users) SetPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var b passwordBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err := h.users.SetPassword(r.Context(), id, b.Password); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengguna tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengganti kata sandi")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

func trimOptional(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func parseOptDate(p *string) (*time.Time, bool) {
	if p == nil || *p == "" {
		return nil, true
	}
	t, err := time.Parse("2006-01-02", *p)
	if err != nil {
		return nil, false
	}
	return &t, true
}

func isValidLevel(s string) bool {
	switch model.StudentLevel(s) {
	case model.LevelCaberawit, model.LevelPraRemaja, model.LevelRemaja, model.LevelPraNikah:
		return true
	}
	return false
}

func isUniqueConflict(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "UNIQUE constraint failed") ||
		strings.Contains(s, "constraint failed: users.email") ||
		strings.Contains(s, "constraint failed: users.username")
}
