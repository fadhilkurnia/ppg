package handler

import (
	"net/http"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type Stats struct {
	students    *store.Students
	teachers    *store.Teachers
	attendances *store.Attendances
}

func NewStats(s *store.Students, t *store.Teachers, a *store.Attendances) *Stats {
	return &Stats{students: s, teachers: t, attendances: a}
}

type dashboardResponse struct {
	Students *store.StudentStats `json:"students"`
	Teachers *store.TeacherStats `json:"teachers"`
}

func (h *Stats) Dashboard(w http.ResponseWriter, r *http.Request) {
	ss, err := h.students.Stats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil ringkasan Generus")
		return
	}
	ts, err := h.teachers.Stats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil ringkasan Pengajar")
		return
	}
	httpx.JSON(w, http.StatusOK, dashboardResponse{Students: ss, Teachers: ts})
}

func (h *Stats) Attendance(w http.ResponseWriter, r *http.Request) {
	stats, err := h.attendances.Stats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil ringkasan kehadiran")
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}
