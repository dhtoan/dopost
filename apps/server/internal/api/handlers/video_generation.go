package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/openpost/backend/internal/ai"
	"github.com/openpost/backend/internal/api/middleware"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/videogeneration"
)

type VideoGenerationHandler struct {
	service *videogeneration.Service
	auth    middleware.Authenticator
}

func NewVideoGenerationHandler(service *videogeneration.Service, auth middleware.Authenticator) *VideoGenerationHandler {
	return &VideoGenerationHandler{service, auth}
}

type CreateVideoGenerationInput struct {
	IdempotencyKey string `header:"Idempotency-Key" required:"true" minLength:"8" maxLength:"160"`
	Body           videogeneration.VideoGenerationRequest
}
type VideoGenerationOutput struct {
	Body videogeneration.VideoGenerationRun
}
type GetVideoGenerationInput struct {
	ID string `path:"id" maxLength:"200"`
}
type ListVideoGenerationsInput struct {
	WorkspaceID string `query:"workspace_id" required:"true" maxLength:"200"`
	ProjectID   string `query:"project_id" required:"true" maxLength:"200"`
}
type ListVideoGenerationsOutput struct {
	Body struct {
		Runs []videogeneration.VideoGenerationRun `json:"runs"`
	}
}
type VideoGenerationConfigOutput struct {
	Body struct {
		Available    bool            `json:"available"`
		DefaultModel string          `json:"default_model"`
		Models       []ai.VideoModel `json:"models"`
	}
}

func (h *VideoGenerationHandler) RegisterRoutes(api huma.API) {
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary, Tags: []string{"Video generation"}, Errors: []int{400, 403, 404, 409, 503}, Middlewares: huma.Middlewares{middleware.AuthMiddleware(api, h.auth)}}
	}
	huma.Register(api, op("video-generation-config", http.MethodGet, "/video-generations/config", "Read signed-in video generation capabilities"), h.config)
	huma.Register(api, op("create-video-generation", http.MethodPost, "/video-generations", "Generate a video clip from a prompt and an optional start image"), h.create)
	huma.Register(api, op("get-video-generation", http.MethodGet, "/video-generations/{id}", "Read a saved video generation request"), h.get)
	huma.Register(api, op("list-video-generations", http.MethodGet, "/video-generations", "Read the current user's video generation history for a project"), h.list)
}

func (h *VideoGenerationHandler) config(_ context.Context, _ *struct{}) (*VideoGenerationConfigOutput, error) {
	out := &VideoGenerationConfigOutput{}
	out.Body.Available, out.Body.DefaultModel, out.Body.Models = h.service.Available(), ai.DefaultVideoModel, ai.VideoModels()
	return out, nil
}

func (h *VideoGenerationHandler) create(ctx context.Context, input *CreateVideoGenerationInput) (*VideoGenerationOutput, error) {
	if h.service == nil {
		return nil, videoGenerationError(videogeneration.ErrUnavailable)
	}
	run, err := h.service.Create(ctx, workspaceActor(ctx, middleware.GetUserID(ctx)), input.IdempotencyKey, input.Body)
	return &VideoGenerationOutput{Body: run}, videoGenerationError(err)
}

func (h *VideoGenerationHandler) get(ctx context.Context, input *GetVideoGenerationInput) (*VideoGenerationOutput, error) {
	if h.service == nil {
		return nil, videoGenerationError(videogeneration.ErrUnavailable)
	}
	run, err := h.service.Get(ctx, workspaceActor(ctx, middleware.GetUserID(ctx)), input.ID)
	return &VideoGenerationOutput{Body: run}, videoGenerationError(err)
}

func (h *VideoGenerationHandler) list(ctx context.Context, input *ListVideoGenerationsInput) (*ListVideoGenerationsOutput, error) {
	if h.service == nil {
		return nil, videoGenerationError(videogeneration.ErrUnavailable)
	}
	runs, err := h.service.List(ctx, workspaceActor(ctx, middleware.GetUserID(ctx)), input.WorkspaceID, input.ProjectID)
	out := &ListVideoGenerationsOutput{}
	out.Body.Runs = runs
	return out, videoGenerationError(err)
}

func videoGenerationError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, videogeneration.ErrInvalid):
		return huma.Error400BadRequest("Check the prompt, start image, length and frame shape for this model")
	case errors.Is(err, videogeneration.ErrAccess):
		return huma.Error403Forbidden("This workspace or start image is not available for video generation")
	case errors.Is(err, videogeneration.ErrNotFound):
		return huma.Error404NotFound("Video generation not found")
	case errors.Is(err, videogeneration.ErrConflict):
		return huma.Error409Conflict("This request key was already used with different settings")
	default:
		return huma.Error503ServiceUnavailable("Video generation is unavailable. Try again later")
	}
}

// ImportGeneratedVideo uses the ordinary Media admission, quota and analysis
// path. Durable retries reuse the bytes and never buy another video.
func (h *MediaHandler) ImportGeneratedVideo(ctx context.Context, input videogeneration.MediaImport) (models.MediaAttachment, error) {
	mediaID := uuid.NewSHA1(uuid.NameSpaceURL, []byte("openpost:video-generation:"+input.WorkspaceID+":"+input.RunID)).String()
	result, err := h.processUploadBytes(ctx, mediaUploadBytesInput{StableID: mediaID, WorkspaceID: input.WorkspaceID, Filename: "ai-video-" + input.RunID + ".mp4", DeclaredMimeType: "video/mp4", Size: int64(len(input.Content)), Content: input.Content, Source: "video_generation", AssetKind: "library", RetentionClass: "library", ParentMediaID: input.ParentMediaID})
	if err != nil {
		return models.MediaAttachment{}, err
	}
	id, _ := result["id"].(string)
	var media models.MediaAttachment
	if err = h.db.NewSelect().Model(&media).Where("id = ? AND workspace_id = ?", id, input.WorkspaceID).Scan(ctx); err != nil {
		return media, err
	}
	recipe := models.MediaGenerationRecipe{MediaID: id, WorkspaceID: input.WorkspaceID, Kind: "ai_video", RendererKey: "fal", TemplateID: input.RunID, RecipeJSON: input.Recipe, CreatedAt: time.Now().UTC()}
	_, err = h.db.NewInsert().Model(&recipe).On("CONFLICT (media_id) DO NOTHING").Exec(ctx)
	return media, err
}
