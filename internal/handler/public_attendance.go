package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/messaging"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

// PublicAttendance owns the unauthenticated `/api/public/*` endpoints
// powering the `/absen` form. It exposes minimal teacher/student rosters
// for the dropdowns and accepts submissions that go straight into the
// shared attendances table.
type PublicAttendance struct {
	attendances *store.Attendances
	students    *store.Students
	teachers    *store.Teachers
	validator   *validator.Validate
	sender      messaging.Sender
	adminTo     string // E.164 / "62…" form, may be ""
	sendCopy    bool
}

func NewPublicAttendance(
	a *store.Attendances,
	s *store.Students,
	t *store.Teachers,
	sender messaging.Sender,
	adminNumber string,
	sendToSubmitter bool,
) *PublicAttendance {
	if sender == nil {
		sender = messaging.Noop{}
	}
	return &PublicAttendance{
		attendances: a,
		students:    s,
		teachers:    t,
		validator:   validator.New(),
		sender:      sender,
		adminTo:     messaging.Normalize(adminNumber),
		sendCopy:    sendToSubmitter,
	}
}

type publicOption struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Nickname *string `json:"nickname,omitempty"`
}

type publicOptionList struct {
	Items []publicOption `json:"items"`
}

// ListTeachers returns active teachers as minimal {id,name,nickname}
// records suitable for the public dropdown. No PII beyond name.
func (h *PublicAttendance) ListTeachers(w http.ResponseWriter, r *http.Request) {
	res, err := h.teachers.List(r.Context(), store.TeacherListParams{
		Status: "active",
		Limit:  200,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar pengajar")
		return
	}
	out := make([]publicOption, 0, len(res.Items))
	for _, t := range res.Items {
		out = append(out, publicOption{ID: t.ID, Name: t.Name, Nickname: t.Nickname})
	}
	httpx.JSON(w, http.StatusOK, publicOptionList{Items: out})
}

// ListStudents returns active students for the public dropdown.
func (h *PublicAttendance) ListStudents(w http.ResponseWriter, r *http.Request) {
	res, err := h.students.List(r.Context(), store.ListParams{
		Status: "active",
		Limit:  200,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal mengambil daftar generus")
		return
	}
	out := make([]publicOption, 0, len(res.Items))
	for _, s := range res.Items {
		out = append(out, publicOption{ID: s.ID, Name: s.Name, Nickname: s.Nickname})
	}
	httpx.JSON(w, http.StatusOK, publicOptionList{Items: out})
}

// phoneRe accepts Indonesian inputs in "08…", "+62…", or "62…" form
// with at least 8 trailing digits — keeps obvious typos out without
// pretending to be a full E.164 validator (messaging.Normalize handles
// the canonicalisation).
var phoneRe = regexp.MustCompile(`^(\+?62|0)\d{7,14}$`)

type publicAttendanceBody struct {
	Date           string  `json:"date"           validate:"required,datetime=2006-01-02"`
	DurationMin    *int    `json:"durationMin,omitempty"   validate:"omitempty,min=0,max=1440"`
	TeacherID      string  `json:"teacherId"      validate:"required,min=1"`
	StudentID      string  `json:"studentId"      validate:"required,min=1"`
	Status         string  `json:"status"         validate:"required,oneof=hadir izin_murid izin_guru by_vn"`
	Materi         *string `json:"materi,omitempty"        validate:"omitempty,max=20000"`
	SubmittedPhone string  `json:"submittedPhone" validate:"required"`
}

// Create handles `POST /api/public/attendances`. It persists the row
// and fires WhatsApp sends asynchronously so a slow/failing gateway
// can't keep the form spinning. Sends are best-effort: errors are
// logged but the API still returns 201.
func (h *PublicAttendance) Create(w http.ResponseWriter, r *http.Request) {
	var b publicAttendanceBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Format permintaan tidak valid")
		return
	}
	b.SubmittedPhone = strings.TrimSpace(b.SubmittedPhone)
	if err := h.validator.Struct(b); err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if !phoneRe.MatchString(b.SubmittedPhone) {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Nomor WhatsApp tidak valid")
		return
	}
	date, err := time.Parse("2006-01-02", b.Date)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Tanggal tidak valid")
		return
	}

	normalizedPhone := messaging.Normalize(b.SubmittedPhone)
	phonePtr := &normalizedPhone

	att, err := h.attendances.Create(r.Context(), store.AttendanceInput{
		Date:           date,
		DurationMin:    b.DurationMin,
		TeacherID:      b.TeacherID,
		StudentID:      b.StudentID,
		Status:         model.AttendanceStatus(b.Status),
		Materi:         trimPtr(b.Materi),
		SubmittedPhone: phonePtr,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "Gagal menyimpan kehadiran")
		return
	}

	// Fire-and-forget WhatsApp notification. Detach from the request
	// context so cancelling the HTTP response (e.g. client closes the
	// tab right after submit) doesn't abort the outbound call.
	body := formatAttendanceMessage(att)
	go h.dispatch(att, body, normalizedPhone)

	httpx.JSON(w, http.StatusCreated, att)
}

func (h *PublicAttendance) dispatch(att *model.Attendance, body, submitterPhone string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if h.adminTo != "" {
		if err := h.sender.Send(ctx, h.adminTo, body); err != nil {
			slog.Warn("whatsapp send to admin failed",
				"attendanceId", att.ID, "error", err)
		}
	}
	if h.sendCopy && submitterPhone != "" && submitterPhone != h.adminTo {
		if err := h.sender.Send(ctx, submitterPhone, body); err != nil {
			slog.Warn("whatsapp send to submitter failed",
				"attendanceId", att.ID, "error", err)
		}
	}
}

var statusLabels = map[model.AttendanceStatus]string{
	model.AttendanceHadir:     "Hadir",
	model.AttendanceIzinMurid: "Izin (Murid)",
	model.AttendanceIzinGuru:  "Izin (Guru)",
	model.AttendanceByVN:      "Via Voice Note",
}

func formatAttendanceMessage(a *model.Attendance) string {
	var sb strings.Builder
	sb.WriteString("[Laporan Pengajian]\n")
	sb.WriteString("Tanggal  : ")
	sb.WriteString(a.Date.Format("2006-01-02"))
	sb.WriteString("\n")
	if a.DurationMin != nil {
		sb.WriteString("Durasi   : ")
		sb.WriteString(strconv.Itoa(*a.DurationMin))
		sb.WriteString(" menit\n")
	}
	sb.WriteString("Pengajar : ")
	sb.WriteString(a.TeacherName)
	sb.WriteString("\nGenerus  : ")
	sb.WriteString(a.StudentName)
	sb.WriteString("\nStatus   : ")
	if label, ok := statusLabels[a.Status]; ok {
		sb.WriteString(label)
	} else {
		sb.WriteString(string(a.Status))
	}
	sb.WriteString("\n")
	if a.Materi != nil && strings.TrimSpace(*a.Materi) != "" {
		sb.WriteString("Materi   :\n")
		sb.WriteString(*a.Materi)
		sb.WriteString("\n")
	}
	sb.WriteString("\n(Dikirim otomatis dari journal-ppg)")
	return sb.String()
}

