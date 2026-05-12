package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/fadhilkurnia/ppg-dashboard/internal/messaging"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
)

type recordedSend struct {
	to   string
	body string
}

type stubSender struct {
	mu    sync.Mutex
	calls []recordedSend
	err   error
}

func (s *stubSender) Send(_ context.Context, to, body string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, recordedSend{to: to, body: body})
	return s.err
}

func (s *stubSender) snapshot() []recordedSend {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]recordedSend, len(s.calls))
	copy(out, s.calls)
	return out
}

func newPublicHandlerEnv(t *testing.T) (*PublicAttendance, *stubSender, *model.Teacher, *model.Student) {
	t.Helper()
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := store.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	teachers := store.NewTeachers(db)
	students := store.NewStudents(db)
	attendances := store.NewAttendances(db)

	teacher, err := teachers.Create(context.Background(), store.TeacherInput{
		Name:     "Test Teacher",
		Kelompok: "TK",
		Desa:     "TD",
		Daerah:   "TDA",
		Status:   model.TeacherActive,
	})
	if err != nil {
		t.Fatalf("create teacher: %v", err)
	}
	student, err := students.Create(context.Background(), store.StudentInput{
		Name:     "Test Student",
		Gender:   "male",
		Level:    model.LevelRemaja,
		Kelompok: "California",
		Status:   model.StudentActive,
	})
	if err != nil {
		t.Fatalf("create student: %v", err)
	}

	stub := &stubSender{}
	h := NewPublicAttendance(attendances, students, teachers, stub, "6281111111111", true)
	return h, stub, teacher, student
}

func postJSON(t *testing.T, h http.HandlerFunc, body any) *httptest.ResponseRecorder {
	t.Helper()
	buf, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/public/attendances", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

// awaitCalls polls the stub for up to 2s. The handler dispatches sends
// in a goroutine, so the test can't observe them synchronously off the
// HTTP response.
func awaitCalls(t *testing.T, stub *stubSender, want int) []recordedSend {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		c := stub.snapshot()
		if len(c) >= want {
			return c
		}
		time.Sleep(20 * time.Millisecond)
	}
	return stub.snapshot()
}

func TestPublicAttendanceCreate_HappyPath(t *testing.T) {
	h, stub, teacher, student := newPublicHandlerEnv(t)

	dur := 45
	body := map[string]any{
		"date":           "2025-05-01",
		"durationMin":    dur,
		"teacherId":      teacher.ID,
		"studentId":      student.ID,
		"status":         "hadir",
		"materi":         "Surat Al-Fatihah",
		"submittedPhone": "081234567890",
	}
	rec := postJSON(t, h.Create, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", rec.Code, rec.Body.String())
	}

	var got model.Attendance
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.SubmittedPhone == nil || *got.SubmittedPhone != "6281234567890" {
		t.Errorf("submittedPhone = %v, want 6281234567890", got.SubmittedPhone)
	}

	calls := awaitCalls(t, stub, 2)
	if len(calls) != 2 {
		t.Fatalf("send calls = %d, want 2: %+v", len(calls), calls)
	}
	// One to admin, one to submitter — order is implementation-defined.
	seen := map[string]bool{}
	for _, c := range calls {
		seen[c.to] = true
	}
	if !seen["6281111111111"] || !seen["6281234567890"] {
		t.Errorf("expected sends to admin+submitter, got %+v", calls)
	}
}

func TestPublicAttendanceCreate_InvalidPhone(t *testing.T) {
	h, stub, teacher, student := newPublicHandlerEnv(t)
	body := map[string]any{
		"date":           "2025-05-01",
		"teacherId":      teacher.ID,
		"studentId":      student.ID,
		"status":         "hadir",
		"submittedPhone": "not-a-phone",
	}
	rec := postJSON(t, h.Create, body)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if got := stub.snapshot(); len(got) != 0 {
		t.Errorf("no sends expected on validation failure, got %+v", got)
	}
}

func TestPublicAttendanceCreate_MissingTeacher(t *testing.T) {
	h, _, _, student := newPublicHandlerEnv(t)
	body := map[string]any{
		"date":           "2025-05-01",
		"studentId":      student.ID,
		"status":         "hadir",
		"submittedPhone": "081234567890",
	}
	rec := postJSON(t, h.Create, body)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestPublicAttendanceCreate_SenderErrorDoesNotFailRequest(t *testing.T) {
	h, stub, teacher, student := newPublicHandlerEnv(t)
	stub.err = errStub{}

	body := map[string]any{
		"date":           "2025-05-01",
		"teacherId":      teacher.ID,
		"studentId":      student.ID,
		"status":         "by_vn",
		"submittedPhone": "081234567890",
	}
	rec := postJSON(t, h.Create, body)
	if rec.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201 (send errors must not fail request)", rec.Code)
	}
	// Let the goroutine attempt at least one send so the test exercises
	// the error path; we don't strictly require a count, just that the
	// HTTP response was already 201.
	awaitCalls(t, stub, 1)
}

type errStub struct{}

func (errStub) Error() string { return "stub send failure" }

func TestPublicAttendanceList(t *testing.T) {
	h, _, teacher, student := newPublicHandlerEnv(t)

	req := httptest.NewRequest(http.MethodGet, "/api/public/teachers", nil)
	rec := httptest.NewRecorder()
	h.ListTeachers(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("teachers: status = %d", rec.Code)
	}
	var tres struct {
		Items []publicOption `json:"items"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&tres); err != nil {
		t.Fatalf("decode teachers: %v", err)
	}
	if len(tres.Items) != 1 || tres.Items[0].ID != teacher.ID {
		t.Errorf("teachers items = %+v, want one with id=%s", tres.Items, teacher.ID)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/public/students", nil)
	rec = httptest.NewRecorder()
	h.ListStudents(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("students: status = %d", rec.Code)
	}
	var sres struct {
		Items []publicOption `json:"items"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&sres); err != nil {
		t.Fatalf("decode students: %v", err)
	}
	if len(sres.Items) != 1 || sres.Items[0].ID != student.ID {
		t.Errorf("students items = %+v, want one with id=%s", sres.Items, student.ID)
	}
}

// Confirms the sender plumbing default. NewPublicAttendance must
// substitute Noop for a nil sender so the handler can always call
// Send() without a nil check.
func TestPublicAttendanceNilSenderDefaultsToNoop(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := store.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	h := NewPublicAttendance(
		store.NewAttendances(db),
		store.NewStudents(db),
		store.NewTeachers(db),
		nil,
		"",
		false,
	)
	if _, ok := h.sender.(messaging.Noop); !ok {
		t.Errorf("nil sender should default to Noop, got %T", h.sender)
	}
}

