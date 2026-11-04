package videogeneration

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/openpost/backend/internal/ai"
	"github.com/openpost/backend/internal/jobregistry"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/mediastore"
	"github.com/openpost/backend/internal/services/workspaceaccess"
	"github.com/uptrace/bun"
)

// maxSourceImageBytes keeps the inline first frame well inside fal's 30 MB limit.
const maxSourceImageBytes = 10 * 1024 * 1024

type Service struct {
	db       *bun.DB
	provider ai.VideoProvider
	storage  mediastore.BlobStorage
	importer MediaImporter
}

func New(db *bun.DB, provider ai.VideoProvider, storage mediastore.BlobStorage, importer MediaImporter) *Service {
	return &Service{db, provider, storage, importer}
}

func (s *Service) Available() bool {
	return s != nil && s.provider != nil && s.storage != nil && s.importer != nil
}

func authorize(ctx context.Context, db bun.IDB, actor workspaceaccess.ActorFacts, workspaceID string, level workspaceaccess.Level) (workspaceaccess.StoredAuthority, error) {
	decision, err := workspaceaccess.NewAuthorizer(db).Authorize(ctx, workspaceID, actor, level)
	if err != nil {
		return workspaceaccess.StoredAuthority{}, err
	}
	if !decision.Allowed {
		return workspaceaccess.StoredAuthority{}, ErrAccess
	}
	return workspaceaccess.StoredAuthority{UserID: actor.UserID, WorkspaceID: workspaceID, OrganizationID: decision.OrganizationID, IdentityProviderID: decision.ProviderID, AssuredAt: time.Now().UTC()}, nil
}

// validate checks the request against the chosen model, beyond what the schema can say.
func validate(request VideoGenerationRequest) error {
	model, ok := ai.VideoModelByID(request.Model)
	if !ok || request.Prompt == "" || len(request.Prompt) > 2500 {
		return ErrInvalid
	}
	if request.DurationSec < model.MinSeconds || request.DurationSec > model.MaxSeconds {
		return ErrInvalid
	}
	if !slices.Contains(model.AspectRatios, request.AspectRatio) {
		return ErrInvalid
	}
	if request.GenerateAudio && !model.Audio {
		return ErrInvalid
	}
	return nil
}

func (s *Service) Create(ctx context.Context, actor workspaceaccess.ActorFacts, key string, request VideoGenerationRequest) (VideoGenerationRun, error) {
	if !s.Available() {
		return VideoGenerationRun{}, ErrUnavailable
	}
	request.Prompt = strings.TrimSpace(request.Prompt)
	if err := validate(request); err != nil || len(key) < 8 || len(key) > 160 {
		return VideoGenerationRun{}, ErrInvalid
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		return VideoGenerationRun{}, err
	}
	hash := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(hash[:])
	var stored record
	err = s.db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		authority, err := authorize(ctx, tx, actor, request.WorkspaceID, workspaceaccess.LevelEdit)
		if err != nil {
			return err
		}
		// Serialize admission for duplicate browser submissions on SQLite and PostgreSQL.
		if _, err = tx.ExecContext(ctx, "UPDATE users SET id = id WHERE id = ?", actor.UserID); err != nil {
			return err
		}
		err = tx.NewSelect().Model(&stored).Where("user_id = ? AND workspace_id = ? AND idempotency_key = ?", actor.UserID, request.WorkspaceID, key).Scan(ctx)
		if err == nil {
			if stored.Fingerprint != fingerprint {
				return ErrConflict
			}
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err = checkSource(ctx, tx, request); err != nil {
			return err
		}
		proof, err := json.Marshal(authority)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		stored = record{ID: uuid.NewString(), WorkspaceID: request.WorkspaceID, UserID: actor.UserID, ProjectID: request.ProjectID, IdempotencyKey: key, Fingerprint: fingerprint, RequestJSON: string(encoded), AuthorityJSON: string(proof), SourceMediaID: request.SourceMediaID, Endpoint: ai.VideoEndpoint(request.Model, request.SourceMediaID != ""), State: "queued", BillingState: "pending", CreatedAt: now, UpdatedAt: now}
		if _, err = tx.NewInsert().Model(&stored).Exec(ctx); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]string{"run_id": stored.ID})
		job, err := jobregistry.NewJob(jobregistry.TypeVideoGeneration, string(payload), now)
		if err != nil {
			return err
		}
		_, err = tx.NewInsert().Model(job).Exec(ctx)
		return err
	})
	return project(stored), err
}

// checkSource admits a ready, untrashed still image from this workspace, either
// a library image or a Video Editor project asset.
func checkSource(ctx context.Context, db bun.IDB, request VideoGenerationRequest) error {
	if request.SourceMediaID == "" {
		return nil
	}
	source, err := loadSource(ctx, db, request.WorkspaceID, request.SourceMediaID)
	if err != nil {
		return err
	}
	if source.Size > maxSourceImageBytes || source.Width < 300 || source.Height < 300 {
		return ErrInvalid
	}
	return nil
}

func loadSource(ctx context.Context, db bun.IDB, workspaceID, mediaID string) (models.MediaAttachment, error) {
	var source models.MediaAttachment
	err := db.NewSelect().Model(&source).Where("id = ? AND workspace_id = ?", mediaID, workspaceID).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return source, ErrAccess
	}
	if err != nil {
		return source, err
	}
	if !source.TrashedAt.IsZero() || source.ProcessingStatus != "ready" || (source.AssetKind != "library" && source.AssetKind != "project_asset") {
		return source, ErrAccess
	}
	switch source.MimeType {
	case "image/png", "image/jpeg", "image/webp":
	default:
		return source, ErrInvalid
	}
	return source, nil
}

// providerInput is the endpoint input, with the start image read back from
// storage at submission so the request row never holds image bytes.
func (s *Service) providerInput(ctx context.Context, stored *record, request VideoGenerationRequest) (ai.VideoRequest, error) {
	model, ok := ai.VideoModelByID(request.Model)
	if !ok {
		return ai.VideoRequest{}, ErrInvalid
	}
	startImage := ""
	if request.SourceMediaID != "" {
		source, err := loadSource(ctx, s.db, request.WorkspaceID, request.SourceMediaID)
		if err != nil {
			return ai.VideoRequest{}, err
		}
		reader, err := s.storage.Open(ctx, source.FilePath)
		if err != nil {
			return ai.VideoRequest{}, err
		}
		data, err := io.ReadAll(io.LimitReader(reader, maxSourceImageBytes+1))
		_ = reader.Close()
		if err != nil || len(data) > maxSourceImageBytes {
			return ai.VideoRequest{}, ErrInvalid
		}
		startImage = "data:" + source.MimeType + ";base64," + base64.StdEncoding.EncodeToString(data)
	}
	return ai.VideoRequest{
		Endpoint: stored.Endpoint,
		Input:    ai.VideoInput(model, request.Prompt, request.DurationSec, request.AspectRatio, request.GenerateAudio, startImage),
	}, nil
}

func (s *Service) Get(ctx context.Context, actor workspaceaccess.ActorFacts, id string) (VideoGenerationRun, error) {
	var stored record
	err := s.db.NewSelect().Model(&stored).Where("id = ? AND user_id = ?", id, actor.UserID).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return VideoGenerationRun{}, ErrNotFound
	}
	if err != nil {
		return VideoGenerationRun{}, err
	}
	if _, err = authorize(ctx, s.db, actor, stored.WorkspaceID, workspaceaccess.LevelRead); err != nil {
		return VideoGenerationRun{}, err
	}
	return project(stored), nil
}

func (s *Service) List(ctx context.Context, actor workspaceaccess.ActorFacts, workspaceID, projectID string) ([]VideoGenerationRun, error) {
	if _, err := authorize(ctx, s.db, actor, workspaceID, workspaceaccess.LevelRead); err != nil {
		return nil, err
	}
	var records []record
	if err := s.db.NewSelect().Model(&records).Where("workspace_id = ? AND user_id = ? AND project_id = ?", workspaceID, actor.UserID, projectID).Order("created_at DESC").Limit(30).Scan(ctx); err != nil {
		return nil, err
	}
	runs := make([]VideoGenerationRun, 0, len(records))
	for _, item := range records {
		runs = append(runs, project(item))
	}
	return runs, nil
}

func project(stored record) VideoGenerationRun {
	var request VideoGenerationRequest
	_ = json.Unmarshal([]byte(stored.RequestJSON), &request)
	return VideoGenerationRun{ID: stored.ID, WorkspaceID: stored.WorkspaceID, ProjectID: stored.ProjectID, Prompt: request.Prompt, Model: request.Model, DurationSec: request.DurationSec, AspectRatio: request.AspectRatio, GenerateAudio: request.GenerateAudio, SourceMediaID: stored.SourceMediaID, State: stored.State, ErrorMessage: stored.ErrorMessage, ResultMediaID: stored.ResultMediaID, CostMicrousd: stored.CostMicrousd, BillingState: stored.BillingState, CreatedAt: stored.CreatedAt}
}

func recipeJSON(request VideoGenerationRequest, receipt string) string {
	encoded, _ := json.Marshal(map[string]any{"provider": "fal", "model": request.Model, "prompt": request.Prompt, "duration_seconds": request.DurationSec, "aspect_ratio": request.AspectRatio, "generate_audio": request.GenerateAudio, "source_media_id": request.SourceMediaID, "provider_request_id": receipt})
	return string(encoded)
}
