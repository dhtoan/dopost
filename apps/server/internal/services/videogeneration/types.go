// Package videogeneration runs paid AI video generations for the Video Editor
// with the same durable lifecycle as image generation: a saved request, one
// paid submission, receipt polling, Media admission and cost reconciliation.
package videogeneration

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/openpost/backend/internal/models"
	"github.com/uptrace/bun"
)

var (
	ErrAccess         = errors.New("video generation access denied")
	ErrInvalid        = errors.New("invalid video generation request")
	ErrNotFound       = errors.New("video generation not found")
	ErrConflict       = errors.New("video generation request conflict")
	ErrUnavailable    = errors.New("video generation unavailable")
	ErrPending        = errors.New("video generation awaiting provider")
	ErrBillingPending = fmt.Errorf("%w: billing", ErrPending)
)

//nolint:revive // This name identifies the request in the shared API schema.
type VideoGenerationRequest struct {
	WorkspaceID   string `json:"workspace_id" minLength:"1" maxLength:"200"`
	ProjectID     string `json:"project_id" minLength:"1" maxLength:"200"`
	Prompt        string `json:"prompt" minLength:"1" maxLength:"2500"`
	Model         string `json:"model" enum:"kling-4-flash,kling-3-pro"`
	DurationSec   int    `json:"duration_seconds" minimum:"3" maximum:"20"`
	AspectRatio   string `json:"aspect_ratio" enum:"16:9,9:16,1:1"`
	GenerateAudio bool   `json:"generate_audio,omitempty" doc:"Only models that can make a soundtrack use this"`
	SourceMediaID string `json:"source_media_id,omitempty" maxLength:"200" doc:"Optional image used as the first frame; the frame shape then follows it"`
}

//nolint:revive // This name identifies the run in the shared API schema.
type VideoGenerationRun struct {
	ID            string    `json:"id"`
	WorkspaceID   string    `json:"workspace_id"`
	ProjectID     string    `json:"project_id"`
	Prompt        string    `json:"prompt"`
	Model         string    `json:"model"`
	DurationSec   int       `json:"duration_seconds"`
	AspectRatio   string    `json:"aspect_ratio"`
	GenerateAudio bool      `json:"generate_audio"`
	SourceMediaID string    `json:"source_media_id"`
	State         string    `json:"state" doc:"queued, submitting, generating, saving, completed, failed or unknown"`
	ErrorMessage  string    `json:"error_message"`
	ResultMediaID string    `json:"result_media_id"`
	CostMicrousd  *int64    `json:"cost_microusd"`
	BillingState  string    `json:"billing_state"`
	CreatedAt     time.Time `json:"created_at"`
}

type record struct {
	bun.BaseModel                                                                           `bun:"table:video_generation_runs"`
	ID                                                                                      string `bun:",pk"`
	WorkspaceID, UserID, ProjectID, IdempotencyKey, Fingerprint, RequestJSON, AuthorityJSON string
	SourceMediaID                                                                           string `bun:",nullzero"`
	ResultMediaID                                                                           string `bun:",nullzero"`
	Endpoint, ProviderRequestID, State, ErrorMessage, BillingState                          string
	CostMicrousd                                                                            *int64
	LeaseToken                                                                              string
	LeaseExpiresAt                                                                          *time.Time
	CreatedAt, UpdatedAt                                                                    time.Time
}

type MediaImport struct {
	WorkspaceID, ParentMediaID, ProjectID, RunID, Recipe string
	Content                                              []byte
}

type MediaImporter interface {
	ImportGeneratedVideo(context.Context, MediaImport) (models.MediaAttachment, error)
}
