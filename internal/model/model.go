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
	Password  string    `json:"-"`
	Name      string    `json:"name"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Student struct {
	ID          string    `json:"id"`
	StudentID   string    `json:"studentId"`
	Name        string    `json:"name"`
	DateOfBirth time.Time `json:"dateOfBirth"`
	Gender      string    `json:"gender"`
	Address     *string   `json:"address,omitempty"`
	ParentName  string    `json:"parentName"`
	ParentPhone string    `json:"parentPhone"`
	ParentEmail *string   `json:"parentEmail,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
