package model

import "time"

type Role string

const (
	RoleAdmin Role = "admin"
	RoleStaff Role = "staff"
)

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Username  *string   `json:"username,omitempty"`
	Password  string    `json:"-"`
	Name      string    `json:"name"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type TeacherStatus string

const (
	TeacherActive  TeacherStatus = "active"
	TeacherRetired TeacherStatus = "retired"
)

type Teacher struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	Nickname   *string       `json:"nickname,omitempty"`
	Kelompok   string        `json:"kelompok"`
	Desa       string        `json:"desa"`
	Daerah     string        `json:"daerah"`
	JoinedAt   *time.Time    `json:"joinedAt,omitempty"`
	RetiredAt  *time.Time    `json:"retiredAt,omitempty"`
	Status     TeacherStatus `json:"status"`
	Notes      *string       `json:"notes,omitempty"`
	CreatedAt  time.Time     `json:"createdAt"`
	UpdatedAt  time.Time     `json:"updatedAt"`
}

type StudentStatus string

const (
	StudentActive StudentStatus = "active"
	StudentLeft   StudentStatus = "left"
)

type StudentLevel string

const (
	LevelCaberawit StudentLevel = "Caberawit"
	LevelPraRemaja StudentLevel = "Pra Remaja"
	LevelRemaja    StudentLevel = "Remaja"
	LevelPraNikah  StudentLevel = "Pra Nikah"
)

// StudentKelompoks is the canonical list of valid kelompok values, mirrored
// in the SQL CHECK constraint and the frontend dropdown.
var StudentKelompoks = []string{"California", "Chicago", "New Hampshire", "Canada"}

type AttendanceStatus string

const (
	AttendanceHadir     AttendanceStatus = "hadir"
	AttendanceIzinMurid AttendanceStatus = "izin_murid"
	AttendanceIzinGuru  AttendanceStatus = "izin_guru"
	AttendanceByVN      AttendanceStatus = "by_vn"
)

// Attendance is one teaching session row. teacher_id and student_id are
// strict FKs to the teachers / students tables; the inline TeacherName /
// StudentName fields are populated by store.List/Get via JOIN for the UI.
type Attendance struct {
	ID          string           `json:"id"`
	Date        time.Time        `json:"date"`
	DurationMin *int             `json:"durationMin,omitempty"`
	TeacherID   string           `json:"teacherId"`
	TeacherName string           `json:"teacherName"`
	StudentID   string           `json:"studentId"`
	StudentName string           `json:"studentName"`
	Status      AttendanceStatus `json:"status"`
	Materi      *string          `json:"materi,omitempty"`
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
}

type Student struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Nickname    *string       `json:"nickname,omitempty"`
	DateOfBirth *time.Time    `json:"dateOfBirth,omitempty"`
	Gender      string        `json:"gender"`
	Level       StudentLevel  `json:"level"`
	Kelompok    string        `json:"kelompok"`
	City        *string       `json:"city,omitempty"`
	JoinedAt    *time.Time    `json:"joinedAt,omitempty"`
	LeftAt      *time.Time    `json:"leftAt,omitempty"`
	LeaveReason *string       `json:"leaveReason,omitempty"`
	Status      StudentStatus `json:"status"`
	ParentName  *string       `json:"parentName,omitempty"`
	ParentPhone *string       `json:"parentPhone,omitempty"`
	ParentEmail *string       `json:"parentEmail,omitempty"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
}
