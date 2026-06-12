package model

import "time"

// PhotoURLPrefix is the path that the photo file-server is mounted at.
// Photo filenames stored in the DB become `PhotoURLPrefix + filename` when
// serialized for API responses.
const PhotoURLPrefix = "/api/files/photos/"

// PhotoURL converts a stored photo filename into a fully-qualified URL.
// Returns nil for nil/empty input so the JSON omitempty tag drops it.
func PhotoURL(filename *string) *string {
	if filename == nil || *filename == "" {
		return nil
	}
	u := PhotoURLPrefix + *filename
	return &u
}

type AttendanceStatus string

const (
	AttendanceHadir     AttendanceStatus = "hadir"
	AttendanceIzinMurid AttendanceStatus = "izin_murid"
	AttendanceIzinGuru  AttendanceStatus = "izin_guru"
	AttendanceByVN      AttendanceStatus = "by_vn"
	AttendanceAlfa      AttendanceStatus = "alfa"
)

// Attendance — one teaching encounter (kehadiran). teacher_id / student_id
// reference the unified users table (no FK in DB to allow soft removal).
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

type Role string

const (
	RoleAdmin    Role = "admin"
	RoleStaff    Role = "staff"
	RolePengurus Role = "pengurus"
	RoleGuru     Role = "guru"
	RoleOrtu     Role = "ortu"
	RoleMurid    Role = "murid"
)

// AllRoles is the canonical role list, mirrored in the SQL CHECK constraint
// and the frontend Role union.
var AllRoles = []Role{RoleAdmin, RoleStaff, RolePengurus, RoleGuru, RoleOrtu, RoleMurid}

type StudentLevel string

const (
	LevelCaberawit StudentLevel = "Caberawit"
	LevelPraRemaja StudentLevel = "Pra Remaja"
	LevelRemaja    StudentLevel = "Remaja"
	LevelPraNikah  StudentLevel = "Pra Nikah"
)

// StudentKelompoks is the canonical list of valid kelompok values for murid,
// mirrored in the SQL CHECK constraint and the frontend dropdown.
var StudentKelompoks = []string{"California", "Chicago", "New Hampshire", "Canada"}

// User is the single entity for any person in the system. Auth-related fields
// (Email, Username, Password, Role, Active) are required; the rest are
// optional profile fields shared by every role — the unified-user mechanism
// means there are no role-specific columns. `Active` is the only lifecycle
// state: a person is either currently a member (active=true) or has left/
// retired (active=false). Earlier joined_at/left_at/leave_reason/
// membership_status fields were dropped in migration 041.
type User struct {
	// Auth
	ID       string  `json:"id"`
	Email    string  `json:"email"`
	Username *string `json:"username,omitempty"`
	Password string  `json:"-"`
	Name     string  `json:"name"`
	Role     Role    `json:"role"`
	Active   bool    `json:"active"`

	// Shared profile (all roles)
	Nickname    *string    `json:"nickname,omitempty"`
	DateOfBirth *time.Time `json:"dateOfBirth,omitempty"`
	Gender      *string    `json:"gender,omitempty"`
	NoHP        *string    `json:"noHp,omitempty"`
	Alamat      *string    `json:"alamat,omitempty"`
	Kelompok    *string    `json:"kelompok,omitempty"`

	// Education + family ties (kept available to all roles — same fields
	// across every membership category per the unified-user mechanism).
	Level             *StudentLevel `json:"level,omitempty"`
	ParentName        *string       `json:"parentName,omitempty"`
	ParentTitle       *string       `json:"parentTitle,omitempty"`
	ParentPhone       *string       `json:"parentPhone,omitempty"`
	ParentPhoneRegion *string       `json:"parentPhoneRegion,omitempty"`
	ParentEmail       *string       `json:"parentEmail,omitempty"`

	// Locality + free-form notes (kept available to all roles).
	Desa   *string `json:"desa,omitempty"`
	Daerah *string `json:"daerah,omitempty"`
	Notes  *string `json:"notes,omitempty"`

	// Photo: filename inside the photos dir. The handler layer also exposes
	// a fully-qualified URL via the json:"photoUrl" field when serializing.
	PhotoPath *string `json:"photoPath,omitempty"`
	PhotoURL  *string `json:"photoUrl,omitempty"`

	// IANA tz name, e.g., "Asia/Jakarta" or "America/New_York". Used by the
	// Kehadiran calendar to render local times. nil = app default.
	Timezone *string `json:"timezone,omitempty"`

	// Taaruf-style biodata extensions (added 2026-05-12 via migration 020).
	UserCode    *string    `json:"userCode,omitempty"`
	TempatLahir *string    `json:"tempatLahir,omitempty"`
	Pendidikan  *string    `json:"pendidikan,omitempty"`
	Pekerjaan   *string    `json:"pekerjaan,omitempty"`
	Urutan      int        `json:"urutan"`
	HideDob     bool       `json:"hideDob"`
	TglDaftar   *time.Time `json:"tglDaftar,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Student and Teacher are projection views over User used by the existing
// /api/students and /api/teachers endpoints. Their JSON shape is preserved
// (matches the original ppg.fadhil.id contract) so the frontend Generus and
// Pengajar pages keep working unchanged.
//
// Per the unified-user mechanism both views carry the *same* shared profile
// field set — neither role exposes more data than the other. The only
// deliberate differences are the role-flavoured Status enum (left vs retired)
// and Kelompok/Desa/Daerah being non-pointer on Teacher for back-compat.

type StudentStatus string

const (
	StudentActive StudentStatus = "active"
	StudentLeft   StudentStatus = "left"
)

type Student struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Nickname    *string       `json:"nickname,omitempty"`
	DateOfBirth *time.Time    `json:"dateOfBirth,omitempty"`
	Gender      string        `json:"gender"`
	Level       *StudentLevel `json:"level,omitempty"`
	Kelompok    *string       `json:"kelompok,omitempty"`
	// Status is synthesised from User.Active after migration 041 dropped
	// the membership_status column — active=1 → "active", active=0 → "left".
	Status            StudentStatus `json:"status"`
	ParentName        *string       `json:"parentName,omitempty"`
	ParentTitle       *string       `json:"parentTitle,omitempty"`
	ParentPhone       *string       `json:"parentPhone,omitempty"`
	ParentPhoneRegion *string       `json:"parentPhoneRegion,omitempty"`
	ParentEmail       *string       `json:"parentEmail,omitempty"`
	// Shared profile fields (same set as Teacher per the unified-user
	// mechanism — these were previously guru-only).
	NoHP   *string `json:"noHp,omitempty"`
	Alamat *string `json:"alamat,omitempty"`
	Desa   *string `json:"desa,omitempty"`
	Daerah *string `json:"daerah,omitempty"`
	Notes  *string `json:"notes,omitempty"`
	// Taaruf-style biodata (shared by every role).
	UserCode    *string    `json:"userCode,omitempty"`
	TempatLahir *string    `json:"tempatLahir,omitempty"`
	Pendidikan  *string    `json:"pendidikan,omitempty"`
	Pekerjaan   *string    `json:"pekerjaan,omitempty"`
	Urutan      int        `json:"urutan"`
	HideDob     bool       `json:"hideDob"`
	TglDaftar   *time.Time `json:"tglDaftar,omitempty"`
	PhotoURL    *string    `json:"photoUrl,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type TeacherStatus string

const (
	TeacherActive  TeacherStatus = "active"
	TeacherRetired TeacherStatus = "retired"
)

type Teacher struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Nickname *string `json:"nickname,omitempty"`
	Gender   *string `json:"gender,omitempty"`
	Kelompok string  `json:"kelompok"`
	Desa     string  `json:"desa"`
	Daerah   string  `json:"daerah"`
	// Status is synthesised from User.Active after migration 041 dropped
	// the membership_status column — active=1 → "active", active=0 → "retired".
	Status TeacherStatus `json:"status"`
	Notes  *string       `json:"notes,omitempty"`
	// Shared profile fields (same set as Student per the unified-user
	// mechanism — these were previously murid-only).
	DateOfBirth       *time.Time    `json:"dateOfBirth,omitempty"`
	NoHP              *string       `json:"noHp,omitempty"`
	Alamat            *string       `json:"alamat,omitempty"`
	Level             *StudentLevel `json:"level,omitempty"`
	ParentName        *string       `json:"parentName,omitempty"`
	ParentTitle       *string       `json:"parentTitle,omitempty"`
	ParentPhone       *string       `json:"parentPhone,omitempty"`
	ParentPhoneRegion *string       `json:"parentPhoneRegion,omitempty"`
	ParentEmail       *string       `json:"parentEmail,omitempty"`
	// Taaruf-style biodata (shared by every role).
	UserCode    *string    `json:"userCode,omitempty"`
	TempatLahir *string    `json:"tempatLahir,omitempty"`
	Pendidikan  *string    `json:"pendidikan,omitempty"`
	Pekerjaan   *string    `json:"pekerjaan,omitempty"`
	Urutan      int        `json:"urutan"`
	HideDob     bool       `json:"hideDob"`
	TglDaftar   *time.Time `json:"tglDaftar,omitempty"`
	PhotoURL    *string    `json:"photoUrl,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}
