package model

import "time"

// Canonical role IDs that extend the legacy RoleAdmin/RoleStaff pair in
// model.go. The full catalogue lives in the roles table (migration 012);
// these constants exist for compile-time references in handler code.
const (
	RolePengurus Role = "pengurus"
	RoleGuru     Role = "guru"
	RoleOrtu     Role = "ortu"
	RoleMurid    Role = "murid"
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

// UserRoleBinding ties a user to a role, optionally inside a scope.
// A nil ScopeID means the binding is global.
type UserRoleBinding struct {
	UserID    string    `json:"userId"`
	RoleID    string    `json:"roleId"`
	ScopeID   *string   `json:"scopeId,omitempty"`
	IsPrimary bool      `json:"isPrimary"`
	CreatedAt time.Time `json:"createdAt"`
}
