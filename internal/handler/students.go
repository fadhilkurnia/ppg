package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Students struct {
	students  *store.Students
	validator *validator.Validate
}

func NewStudents(students *store.Students) *Students {
	return &Students{students: students, validator: validator.New()}
}

type studentBody struct {
	StudentID   string  `json:"studentId"   validate:"required,max=64"`
	Name        string  `json:"name"        validate:"required,max=200"`
	DateOfBirth string  `json:"dateOfBirth" validate:"required,datetime=2006-01-02"`
	Gender      string  `json:"gender"      validate:"required,oneof=male female"`
	Address     *string `json:"address,omitempty"      validate:"omitempty,max=500"`
	ParentName  string  `json:"parentName"  validate:"required,max=200"`
	ParentPhone string  `json:"parentPhone" validate:"required,max=64"`
	ParentEmail *string `json:"parentEmail,omitempty"  validate:"omitempty,email"`
}

func (h *Students) parse(r *http.Request) (store.StudentInput, error) {
	var b studentBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		return store.StudentInput{}, errBadJSON
	}
	if err := h.validator.Struct(b); err != nil {
		return store.StudentInput{}, err
	}
	dob, err := time.Parse("2006-01-02", b.DateOfBirth)
	if err != nil {
		return store.StudentInput{}, err
	}
	return store.StudentInput{
		StudentID:   b.StudentID,
		Name:        b.Name,
		DateOfBirth: dob,
		Gender:      b.Gender,
		Address:     b.Address,
		ParentName:  b.ParentName,
		ParentPhone: b.ParentPhone,
		ParentEmail: b.ParentEmail,
	}, nil
}

var errBadJSON = errors.New("invalid JSON body")

func (h *Students) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	res, err := h.students.List(r.Context(), store.ListParams{
		Query:  q.Get("q"),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to list students")
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Students) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	st, err := h.students.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "student not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to get student")
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
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to create student")
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
			httpx.Error(w, http.StatusNotFound, "not_found", "student not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to update student")
		return
	}
	httpx.JSON(w, http.StatusOK, st)
}

func (h *Students) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.students.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "student not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "failed to delete student")
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
