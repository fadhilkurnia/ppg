package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type StudentTeachers struct {
	st *store.StudentTeachers
}

func NewStudentTeachers(st *store.StudentTeachers) *StudentTeachers {
	return &StudentTeachers{st: st}
}

// List handles GET /api/student-teachers?studentId=...&teacherId=...
func (h *StudentTeachers) List(w http.ResponseWriter, r *http.Request) {
	studentID := r.URL.Query().Get("studentId")
	teacherID := r.URL.Query().Get("teacherId")

	items, err := h.st.List(r.Context(), studentID, teacherID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if items == nil {
		items = []model.StudentTeacherDetail{}
	}
	httpx.JSON(w, http.StatusOK, items)
}

type assignBody struct {
	StudentID string  `json:"studentId"`
	TeacherID string  `json:"teacherId"`
	Notes     *string `json:"notes,omitempty"`
}

// Assign handles POST /api/student-teachers
func (h *StudentTeachers) Assign(w http.ResponseWriter, r *http.Request) {
	var b assignBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_json", "Payload JSON tidak valid")
		return
	}
	if strings.TrimSpace(b.StudentID) == "" || strings.TrimSpace(b.TeacherID) == "" {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "studentId dan teacherId wajib diisi")
		return
	}

	res, err := h.st.Assign(r.Context(), b.StudentID, b.TeacherID, b.Notes)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, res)
}

// Unassign handles DELETE /api/student-teachers?studentId=...&teacherId=... OR DELETE /api/student-teachers/{id}
func (h *StudentTeachers) Unassign(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id != "" {
		if err := h.st.DeleteByID(r.Context(), id); err != nil {
			if errors.Is(err, store.ErrNotFound) {
				httpx.Error(w, http.StatusNotFound, "not_found", "Relasi tidak ditemukan")
				return
			}
			httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}

	studentID := r.URL.Query().Get("studentId")
	teacherID := r.URL.Query().Get("teacherId")
	if studentID == "" || teacherID == "" {
		httpx.Error(w, http.StatusBadRequest, "validation_error", "studentId dan teacherId wajib diisi")
		return
	}

	if err := h.st.Unassign(r.Context(), studentID, teacherID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Relasi tidak ditemukan")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// GetTeachersForStudent handles GET /api/students/{id}/teachers
func (h *StudentTeachers) GetTeachersForStudent(w http.ResponseWriter, r *http.Request) {
	studentID := chi.URLParam(r, "id")
	if studentID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_id", "ID murid wajib diisi")
		return
	}

	teachers, err := h.st.GetTeachersByStudentID(r.Context(), studentID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if teachers == nil {
		teachers = []model.Teacher{}
	}
	httpx.JSON(w, http.StatusOK, teachers)
}

type setTeachersBody struct {
	TeacherIDs []string `json:"teacherIds"`
}

// SetTeachersForStudent handles PUT /api/students/{id}/teachers
func (h *StudentTeachers) SetTeachersForStudent(w http.ResponseWriter, r *http.Request) {
	studentID := chi.URLParam(r, "id")
	if studentID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_id", "ID murid wajib diisi")
		return
	}

	var b setTeachersBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_json", "Payload JSON tidak valid")
		return
	}

	if err := h.st.SetTeachersForStudent(r.Context(), studentID, b.TeacherIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	teachers, err := h.st.GetTeachersByStudentID(r.Context(), studentID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if teachers == nil {
		teachers = []model.Teacher{}
	}
	httpx.JSON(w, http.StatusOK, teachers)
}

// GetStudentsForTeacher handles GET /api/teachers/{id}/students
func (h *StudentTeachers) GetStudentsForTeacher(w http.ResponseWriter, r *http.Request) {
	teacherID := chi.URLParam(r, "id")
	if teacherID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_id", "ID guru wajib diisi")
		return
	}

	students, err := h.st.GetStudentsByTeacherID(r.Context(), teacherID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if students == nil {
		students = []model.Student{}
	}
	httpx.JSON(w, http.StatusOK, students)
}

type setStudentsBody struct {
	StudentIDs []string `json:"studentIds"`
}

// SetStudentsForTeacher handles PUT /api/teachers/{id}/students
func (h *StudentTeachers) SetStudentsForTeacher(w http.ResponseWriter, r *http.Request) {
	teacherID := chi.URLParam(r, "id")
	if teacherID == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_id", "ID guru wajib diisi")
		return
	}

	var b setStudentsBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_json", "Payload JSON tidak valid")
		return
	}

	if err := h.st.SetStudentsForTeacher(r.Context(), teacherID, b.StudentIDs); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	students, err := h.st.GetStudentsByTeacherID(r.Context(), teacherID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if students == nil {
		students = []model.Student{}
	}
	httpx.JSON(w, http.StatusOK, students)
}
