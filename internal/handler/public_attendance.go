package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
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
//
// Submissions are not auto-pushed to a WhatsApp gateway. Instead the
// Create response carries a pre-formatted wa.me click-to-chat URL that
// the SPA opens on the submitter's device, so the user sends the report
// to the admin from their own WhatsApp account.
type PublicAttendance struct {
	attendances *store.Attendances
	students    *store.Students
	teachers    *store.Teachers
	validator   *validator.Validate
	adminTo     string // "62…" form, may be "" if not configured
}

func NewPublicAttendance(
	a *store.Attendances,
	s *store.Students,
	t *store.Teachers,
	adminNumber string,
) *PublicAttendance {
	return &PublicAttendance{
		attendances: a,
		students:    s,
		teachers:    t,
		validator:   validator.New(),
		adminTo:     messaging.Normalize(adminNumber),
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

// publicAttendanceResponse is the 201 payload returned to the SPA. The
// embedded *Attendance flattens its fields to the top level via JSON
// promotion; WaMeURL is the pre-built click-to-chat URL the form opens
// after a successful submit. Empty when no admin number is configured.
type publicAttendanceResponse struct {
	*model.Attendance
	WaMeURL string `json:"waMeUrl"`
}

// Create handles `POST /api/public/attendances`. It persists the row,
// formats the WhatsApp report body, and returns a wa.me URL the SPA
// opens so the submitter can forward the report from their own
// WhatsApp account.
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

	// Look up nicknames so the WA report can render "Name-Nickname".
	// Missing nicknames degrade to just the name — never block the response.
	var studentNick, teacherNick *string
	if s, err := h.students.Get(r.Context(), b.StudentID); err == nil {
		studentNick = s.Nickname
	}
	if t, err := h.teachers.Get(r.Context(), b.TeacherID); err == nil {
		teacherNick = t.Nickname
	}

	body := formatAttendanceMessage(att, studentNick, teacherNick)
	httpx.JSON(w, http.StatusCreated, publicAttendanceResponse{
		Attendance: att,
		WaMeURL:    buildWaMeURL(h.adminTo, body),
	})
}

// buildWaMeURL returns a click-to-chat URL per
// https://faq.whatsapp.com/5913398998672934. Phone must be digits-only
// in international form (no "+", no spaces, no dashes); the message is
// passed verbatim via the `text` query parameter and percent-encoded by
// url.Values. Returns "" if no phone is configured so the SPA can hide
// the send button.
func buildWaMeURL(phone, body string) string {
	if phone == "" {
		return ""
	}
	q := url.Values{}
	q.Set("text", body)
	return "https://wa.me/" + phone + "?" + q.Encode()
}

var statusLabelsUpper = map[model.AttendanceStatus]string{
	model.AttendanceHadir:     "HADIR",
	model.AttendanceIzinMurid: "IZIN (MURID)",
	model.AttendanceIzinGuru:  "IZIN (GURU)",
	model.AttendanceByVN:      "BY VN",
}

// formatAttendanceMessage renders the per-session WhatsApp report. The
// shape (bullets, *bold* labels, "=" separators, Arabic closing) is
// fixed by the admin team — keep the layout aligned with the PR
// description if you must tweak it.
func formatAttendanceMessage(a *model.Attendance, studentNick, teacherNick *string) string {
	const sep = "====================="
	murid := joinNickname(a.StudentName, studentNick)
	guru := joinNickname(a.TeacherName, teacherNick)
	status := statusLabelsUpper[a.Status]
	if status == "" {
		status = strings.ToUpper(string(a.Status))
	}

	var sb strings.Builder
	sb.WriteString(sep)
	sb.WriteString("\n*LAPORAN PENGAJIAN PPG*\n")
	sb.WriteString(sep)
	sb.WriteString("\n\n")

	sb.WriteString("● *Murid*      : ")
	sb.WriteString(murid)
	sb.WriteString("\n● *Tanggal*   : ")
	sb.WriteString(a.Date.Format("2006-01-02"))
	sb.WriteString("\n● *Guru*        : ")
	sb.WriteString(guru)
	sb.WriteString("\n● *Durasi*     : ")
	sb.WriteString(formatDuration(a.DurationMin))
	sb.WriteString("\n● *Kehadiran*     : ")
	sb.WriteString(status)
	sb.WriteString("\n")

	if a.Materi != nil && strings.TrimSpace(*a.Materi) != "" {
		sb.WriteString("\n● *Materi:*\n")
		sb.WriteString(strings.TrimRight(*a.Materi, "\n"))
		sb.WriteString("\n")
	}

	sb.WriteString("\n\nالحمدلله جزاكم الله خيرا")
	return sb.String()
}

func joinNickname(name string, nick *string) string {
	if nick != nil {
		n := strings.TrimSpace(*nick)
		if n != "" {
			return name + "-" + n
		}
	}
	return name
}

// formatDuration renders a minute count as HH:MM, matching the example
// the admin team gave (e.g. 75 → "01:15"). Empty input renders as "-".
func formatDuration(min *int) string {
	if min == nil {
		return "-"
	}
	h := *min / 60
	m := *min % 60
	return fmt.Sprintf("%02d:%02d", h, m)
}
