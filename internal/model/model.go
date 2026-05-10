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

type Student struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Nickname    *string       `json:"nickname,omitempty"`
	DateOfBirth *time.Time    `json:"dateOfBirth,omitempty"`
	Level       *StudentLevel `json:"level,omitempty"`
	Kelompok    *string       `json:"kelompok,omitempty"`
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
