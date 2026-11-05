package models

import (
	"time"

	"github.com/uptrace/bun"
)

// VideoProjectShare is a read-only link to a Cloud Video Project. One per
// project; the token is the link.
type VideoProjectShare struct {
	bun.BaseModel `bun:"table:video_project_shares"`

	Token           string    `bun:"token,pk" json:"token"`
	ProjectID       string    `bun:"project_id,notnull" json:"project_id"`
	WorkspaceID     string    `bun:"workspace_id,notnull" json:"workspace_id"`
	CreatedByUserID string    `bun:"created_by_user_id,notnull" json:"created_by_user_id"`
	CreatedAt       time.Time `bun:"created_at,nullzero,notnull,default:current_timestamp" json:"created_at"`
}
