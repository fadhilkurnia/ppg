package model

import "time"

type ScopeKind string

const (
	ScopeKindDaerah   ScopeKind = "daerah"
	ScopeKindDesa     ScopeKind = "desa"
	ScopeKindKelompok ScopeKind = "kelompok"
)

type ScopeStatus string

const (
	ScopeActive   ScopeStatus = "active"
	ScopeArchived ScopeStatus = "archived"
)

type Scope struct {
	ID        string      `json:"id"`
	ParentID  *string     `json:"parentId,omitempty"`
	Kind      ScopeKind   `json:"kind"`
	Name      string      `json:"name"`
	Code      *string     `json:"code,omitempty"`
	Status    ScopeStatus `json:"status"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
}

// ScopeNode is a tree-shaped scope used by GET /api/scopes/tree.
type ScopeNode struct {
	Scope
	Children []*ScopeNode `json:"children,omitempty"`
}

// UserScope binds a user to a scope. A user has at most one primary scope.
type UserScope struct {
	UserID    string    `json:"userId"`
	ScopeID   string    `json:"scopeId"`
	IsPrimary bool      `json:"isPrimary"`
	CreatedAt time.Time `json:"createdAt"`
}
