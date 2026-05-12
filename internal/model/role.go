package model

import "time"

// Canonical role IDs that extend the legacy RoleAdmin/RoleStaff pair in
// model.go. The full catalogue lives in the roles table (migration 011);
// these constants exist for compile-time references in handler code.
const (
	RoleCoordinator Role = "coordinator"
	RoleTeacher     Role = "teacher"
	RoleParent      Role = "parent"
	RoleStudent     Role = "student"
)

// RoleRecord is one row from the roles table — the catalogue entry that
// drives permission decisions (manageable_role_ids, can_login, etc.).
type RoleRecord struct {
	ID                string    `json:"id"`
	Label             string    `json:"label"`
	CanLogin          bool      `json:"canLogin"`
	ManageableRoleIDs []string  `json:"manageableRoleIds"`
	SortOrder         int       `json:"sortOrder"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

// UserRoleBinding ties a user to a role.
type UserRoleBinding struct {
	UserID    string    `json:"userId"`
	RoleID    string    `json:"roleId"`
	IsPrimary bool      `json:"isPrimary"`
	CreatedAt time.Time `json:"createdAt"`
}
