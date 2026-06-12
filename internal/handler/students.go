package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Students struct {
	students  *store.Students
	validator *validator.Validate
}

func NewStudents(students *store.Students) *Students {
	return &Students{students: students, validator: validator.New()}
}

var errBadJSON = errors.New("invalid JSON body")

type studentBody struct {
	Name              string  `json:"name"        validate:"required,max=200"`
	Nickname          *string `json:"nickname,omitempty"     validate:"omitempty,max=200"`
	DateOfBirth       *string `json:"dateOfBirth,omitempty"  validate:"omitempty,datetime=2006-01-02"`
	Gender            string  `json:"gender"      validate:"required,oneof=male female"`
	Level             *string `json:"level,omitempty"        validate:"omitempty,oneof=Caberawit 'Pra Remaja' Remaja 'Pra Nikah'"`
	Kelompok          *string `json:"kelompok,omitempty"     validate:"omitempty,oneof=California Chicago 'New Hampshire' Canada"`
	JoinedAt          *string `json:"joinedAt,omitempty"     validate:"omitempty,datetime=2006-01-02"`
	LeftAt            *string `json:"leftAt,omitempty"       validate:"omitempty,datetime=2006-01-02"`
	LeaveReason       *string `json:"leaveReason,omitempty"  validate:"omitempty,max=500"`
	Status            string  `json:"status"      validate:"required,oneof=active left"`
	ParentName        *string `json:"parentName,omitempty"        validate:"omitempty,max=200"`
	ParentTitle       *string `json:"parentTitle,omitempty"       validate:"omitempty,max=80"`
	ParentPhone       *string `json:"parentPhone,omitempty"       validate:"omitempty,max=64"`
	ParentPhoneRegion *string `json:"parentPhoneRegion,omitempty" validate:"omitempty,oneof=ID SG US CA"`
	ParentEmail       *string `json:"parentEmail,omitempty"       validate:"omitempty,email"`
	// Shared profile + biodata fields (same set as teacherBody per the
	// unified-user mechanism).
	NoHP        *string `json:"noHp,omitempty"        validate:"omitempty,max=64"`
	Alamat      *string `json:"alamat,omitempty"      validate:"omitempty,max=500"`
	Desa        *string `json:"desa,omitempty"        validate:"omitempty,max=200"`
	Daerah      *string `json:"daerah,omitempty"      validate:"omitempty,max=200"`
	Notes       *string `json:"notes,omitempty"       validate:"omitempty,max=2000"`
	UserCode    *string `json:"userCode,omitempty"    validate:"omitempty,max=40"`
	TempatLahir *string `json:"tempatLahir,omitempty" validate:"omitempty,max=120"`
	Pendidikan  *string `json:"pendidikan,omitempty"  validate:"omitempty,max=80"`
	Pekerjaan   *string `json:"pekerjaan,omitempty"   validate:"omitempty,max=80"`
	Urutan      *int    `json:"urutan,omitempty"      validate:"omitempty,gte=0,lte=100000"`
	HideDob     *bool   `json:"hideDob,omitempty"`
	TglDaftar   *string `json:"tglDaftar,omitempty"   validate:"omitempty,datetime=2006-01-02"`
}

func (h *Students) parse(r *http.Request) (store.StudentInput, error) {
	var b studentBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.StudentInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.StudentInput{}, err
	}

	in := store.StudentInput{
		Name:              strings.TrimSpace(b.Name),
		Nickname:          trimPtr(b.Nickname),
		Gender:            b.Gender,
		Kelompok:          trimPtr(b.Kelompok),
		Status:            model.StudentStatus(b.Status),
		ParentName:        trimPtr(b.ParentName),
		ParentTitle:       trimPtr(b.ParentTitle),
		ParentPhone:       trimPtr(b.ParentPhone),
		ParentPhoneRegion: trimPtr(b.ParentPhoneRegion),
		ParentEmail:       trimPtr(b.ParentEmail),
		NoHP:              trimPtr(b.NoHP),
		Alamat:            trimPtr(b.Alamat),
		Desa:              trimPtr(b.Desa),
		Daerah:            trimPtr(b.Daerah),
		Notes:             trimPtr(b.Notes),
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
		return store.StudentInput{}, err
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
		return store.StudentInput{}, err
	} else {
		in.TglDaftar = t
	}
	// JoinedAt / LeftAt / LeaveReason still validated on the wire for
	// back-compat with external clients, but no longer persisted — the
	// underlying columns were dropped in migration 041. Log at debug so
	// the next "my leftAt didn't save" bug surfaces immediately when the
	// caller bumps the log level.
	if _, err := parseOptionalDate(b.JoinedAt); err != nil {
		return store.StudentInput{}, err
	}
	if _, err := parseOptionalDate(b.LeftAt); err != nil {
		return store.StudentInput{}, err
	}
	if b.JoinedAt != nil || b.LeftAt != nil || b.LeaveReason != nil {
		slog.Debug("student wire fields ignored after mig 041",
			"joinedAt", b.JoinedAt, "leftAt", b.LeftAt, "leaveReason", b.LeaveReason)
	}
	return in, nil
}

func parseOptionalDate(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (h *Students) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	res, err := h.students.List(r.Context(), store.ListParams{
		Query:    q.Get("q"),
		Status:   q.Get("status"),
		Kelompok: q.Get("kelompok"),
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar Generus")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Students) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	st, err := h.students.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Generus tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil data Generus")
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

func (h *Students) Create(w http.ResponseWriter, r *http.Request) {
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	st, err := h.students.Create(r.Context(), in)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan Generus")
		return
	}
	httpx.JSON(w, http.StatusCreated, st)
}

func (h *Students) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	in, err := h.parse(r)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	st, err := h.students.Update(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Generus tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal memperbarui Generus")
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

func (h *Students) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.students.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Generus tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menghapus Generus")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
