package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Teachers struct {
	teachers  *store.Teachers
	validator *validator.Validate
}

func NewTeachers(teachers *store.Teachers) *Teachers {
	return &Teachers{teachers: teachers, validator: validator.New()}
}

// teacherBody — JSON shape on the wire. `joinedAt` and `retiredAt` are
// still accepted (and validated) but ignored after migration 041 dropped
// the underlying columns from `users`. Keeping them in the schema avoids
// breaking external clients that may still POST these fields.
type teacherBody struct {
	Name      string  `json:"name"      validate:"required,max=200"`
	Nickname  *string `json:"nickname,omitempty"     validate:"omitempty,max=200"`
	Gender    *string `json:"gender,omitempty"       validate:"omitempty,oneof=male female"`
	Kelompok  string  `json:"kelompok"  validate:"required,max=200"`
	Desa      string  `json:"desa"      validate:"required,max=200"`
	Daerah    string  `json:"daerah"    validate:"required,max=200"`
	JoinedAt  *string `json:"joinedAt,omitempty"     validate:"omitempty,datetime=2006-01-02"`
	RetiredAt *string `json:"retiredAt,omitempty"    validate:"omitempty,datetime=2006-01-02"`
	Status    string  `json:"status"    validate:"required,oneof=active retired"`
	Notes     *string `json:"notes,omitempty"        validate:"omitempty,max=2000"`
	// Shared profile + biodata fields (same set as studentBody per the
	// unified-user mechanism).
	DateOfBirth       *string `json:"dateOfBirth,omitempty"       validate:"omitempty,datetime=2006-01-02"`
	NoHP              *string `json:"noHp,omitempty"              validate:"omitempty,max=64"`
	Alamat            *string `json:"alamat,omitempty"            validate:"omitempty,max=500"`
	Level             *string `json:"level,omitempty"             validate:"omitempty,oneof=Caberawit 'Pra Remaja' Remaja 'Pra Nikah'"`
	ParentName        *string `json:"parentName,omitempty"        validate:"omitempty,max=200"`
	ParentTitle       *string `json:"parentTitle,omitempty"       validate:"omitempty,max=80"`
	ParentPhone       *string `json:"parentPhone,omitempty"       validate:"omitempty,max=64"`
	ParentPhoneRegion *string `json:"parentPhoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	ParentEmail       *string `json:"parentEmail,omitempty"       validate:"omitempty,email"`
	UserCode          *string `json:"userCode,omitempty"          validate:"omitempty,max=40"`
	TempatLahir       *string `json:"tempatLahir,omitempty"       validate:"omitempty,max=120"`
	Pendidikan        *string `json:"pendidikan,omitempty"        validate:"omitempty,max=80"`
	Pekerjaan         *string `json:"pekerjaan,omitempty"         validate:"omitempty,max=80"`
	Urutan            *int    `json:"urutan,omitempty"            validate:"omitempty,gte=0,lte=100000"`
	HideDob           *bool   `json:"hideDob,omitempty"`
	TglDaftar         *string `json:"tglDaftar,omitempty"         validate:"omitempty,datetime=2006-01-02"`
}

func (h *Teachers) parse(r *http.Request) (store.TeacherInput, error) {
	var b teacherBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.TeacherInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.TeacherInput{}, err
	}

	in := store.TeacherInput{
		Name:              strings.TrimSpace(b.Name),
		Nickname:          trimPtr(b.Nickname),
		Gender:            trimPtr(b.Gender),
		Kelompok:          strings.TrimSpace(b.Kelompok),
		Desa:              strings.TrimSpace(b.Desa),
		Daerah:            strings.TrimSpace(b.Daerah),
		Status:            model.TeacherStatus(b.Status),
		Notes:             trimPtr(b.Notes),
		NoHP:              trimPtr(b.NoHP),
		Alamat:            trimPtr(b.Alamat),
		ParentName:        trimPtr(b.ParentName),
		ParentTitle:       trimPtr(b.ParentTitle),
		ParentPhone:       trimPtr(b.ParentPhone),
		ParentPhoneRegion: trimPtr(b.ParentPhoneRegion),
		ParentEmail:       trimPtr(b.ParentEmail),
		UserCode:          trimPtr(b.UserCode),
		TempatLahir:       trimPtr(b.TempatLahir),
		Pendidikan:        trimPtr(b.Pendidikan),
		Pekerjaan:         trimPtr(b.Pekerjaan),
	}
	if b.Level != nil && *b.Level != "" {
		l := model.StudentLevel(*b.Level)
		in.Level = &l
	}
	if t, err := parseOptionalDate(b.DateOfBirth); err != nil {
		return store.TeacherInput{}, err
	} else {
		in.DateOfBirth = t
	}
	if b.Urutan != nil {
		in.Urutan = *b.Urutan
	}
	if b.HideDob != nil {
		in.HideDob = *b.HideDob
	}
	if t, err := parseOptionalDate(b.TglDaftar); err != nil {
		return store.TeacherInput{}, err
	} else {
		in.TglDaftar = t
	}
	// JoinedAt / RetiredAt are intentionally dropped — the store no longer
	// persists them after migration 041. Log at debug so the next "my
	// retiredAt didn't save" bug surfaces when the caller bumps the level.
	if b.JoinedAt != nil || b.RetiredAt != nil {
		slog.Debug("teacher wire fields ignored after mig 041",
			"joinedAt", b.JoinedAt, "retiredAt", b.RetiredAt)
	}
	return in, nil
}

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

func (h *Teachers) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	res, err := h.teachers.List(r.Context(), store.TeacherListParams{
		Query:  q.Get("q"),
		Status: q.Get("status"),
		Daerah: q.Get("daerah"),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Teachers) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tt, err := h.teachers.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, tt)
}

func (h *Teachers) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	tt, err := h.teachers.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan Pengajar")
		return
	}
	httpx.JSON(w, http.StatusCreated, tt)
}

func (h *Teachers) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	tt, err := h.teachers.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, tt)
}

func (h *Teachers) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.teachers.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Pengajar tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus Pengajar")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
