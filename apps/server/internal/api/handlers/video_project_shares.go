package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/openpost/backend/internal/api/middleware"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/mediasigner"
	"github.com/openpost/backend/internal/services/videoprojects"
	"github.com/uptrace/bun"
)

// sharedMediaURLLifetime is how long the signed media links in a share view
// last. Opening the link again mints fresh ones.
const sharedMediaURLLifetime = 12 * time.Hour

// VideoProjectShareHandler serves read-only share links: owners turn a link
// on or off, and anyone with the token can read the project and its media.
type VideoProjectShareHandler struct {
	service *videoprojects.Service
	auth    middleware.Authenticator
	signer  *mediasigner.Signer
	now     func() time.Time
}

func NewVideoProjectShareHandler(db *bun.DB, authenticator middleware.Authenticator, signer *mediasigner.Signer) *VideoProjectShareHandler {
	return &VideoProjectShareHandler{service: videoprojects.NewService(db), auth: authenticator, signer: signer, now: time.Now}
}

type VideoProjectShareResponse struct {
	Token     string `json:"token"`
	CreatedAt string `json:"created_at"`
}

type VideoProjectShareOutput struct {
	Body struct {
		Share *VideoProjectShareResponse `json:"share" doc:"The project's share link; null when it has none"`
	}
}

type VideoProjectShareInput struct {
	PathID      string `path:"id" doc:"Video project ID"`
	WorkspaceID string `query:"workspace_id" required:"true" doc:"Workspace ID"`
}

type SharedVideoProjectInput struct {
	Token string `path:"token" maxLength:"64" doc:"Share link token"`
}

type SharedVideoProjectAsset struct {
	StableMediaID    string         `json:"stable_media_id"`
	OriginalFilename string         `json:"original_filename"`
	MimeType         string         `json:"mime_type"`
	Size             int64          `json:"size"`
	SHA256           string         `json:"sha256,omitempty"`
	Preparation      map[string]any `json:"preparation"`
	URL              string         `json:"url" doc:"Signed media URL; it expires with the view"`
	Width            int            `json:"width"`
	Height           int            `json:"height"`
	DurationMS       int64          `json:"duration_ms"`
	FrameRate        float64        `json:"frame_rate"`
	ContainerFormat  string         `json:"container_format,omitempty"`
	VideoCodec       string         `json:"video_codec,omitempty"`
	AudioCodec       string         `json:"audio_codec,omitempty"`
}

type SharedVideoProjectOutput struct {
	Body struct {
		Name      string                    `json:"name"`
		UpdatedAt string                    `json:"updated_at"`
		ExpiresAt string                    `json:"expires_at" doc:"When the signed media URLs stop working"`
		Document  videoProjectDocument      `json:"document"`
		Assets    []SharedVideoProjectAsset `json:"assets"`
	}
}

func (h *VideoProjectShareHandler) RegisterRoutes(api huma.API) {
	auth := huma.Middlewares{middleware.AuthMiddleware(api, h.auth)}
	huma.Register(api, huma.Operation{
		OperationID: "get-video-project-share", Method: http.MethodGet, Path: videoProjectsPath + "/{id}/share",
		Summary: "Get a Cloud Video Project's share link", Tags: []string{"Video Projects"},
		Middlewares: auth, Errors: []int{403, 404},
	}, h.get)
	huma.Register(api, huma.Operation{
		OperationID: "enable-video-project-share", Method: http.MethodPut, Path: videoProjectsPath + "/{id}/share",
		Summary: "Turn on a read-only share link", Description: "Anyone with the link can watch the project. Returns the existing link when there is one.",
		Tags: []string{"Video Projects"}, Middlewares: auth, Errors: []int{403, 404},
	}, h.enable)
	huma.Register(api, huma.Operation{
		OperationID: "disable-video-project-share", Method: http.MethodDelete, Path: videoProjectsPath + "/{id}/share",
		Summary: "Turn off a share link", Description: "The old link stops working. Turning sharing on again makes a new link.",
		Tags: []string{"Video Projects"}, Middlewares: auth, Errors: []int{403, 404},
	}, h.disable)
	huma.Register(api, huma.Operation{
		OperationID: "get-shared-video-project", Method: http.MethodGet, Path: "/public/video-shares/{token}",
		Summary: "Read a shared Cloud Video Project", Description: "No session needed: the token is the access check. Media URLs are signed and expire.",
		Tags: []string{"Video Projects"}, Errors: []int{404, 503},
	}, h.read)
}

func shareOutput(share *models.VideoProjectShare) *VideoProjectShareOutput {
	output := &VideoProjectShareOutput{}
	if share != nil {
		output.Body.Share = &VideoProjectShareResponse{Token: share.Token, CreatedAt: share.CreatedAt.UTC().Format(time.RFC3339Nano)}
	}
	return output
}

func (h *VideoProjectShareHandler) get(ctx context.Context, input *VideoProjectShareInput) (*VideoProjectShareOutput, error) {
	share, err := h.service.GetShare(ctx, workspaceActor(ctx, middleware.GetUserID(ctx)), input.WorkspaceID, input.PathID)
	if err != nil {
		return nil, videoProjectError(err, "read the share link of")
	}
	return shareOutput(share), nil
}

func (h *VideoProjectShareHandler) enable(ctx context.Context, input *VideoProjectShareInput) (*VideoProjectShareOutput, error) {
	share, err := h.service.EnableShare(ctx, workspaceActor(ctx, middleware.GetUserID(ctx)), input.WorkspaceID, input.PathID)
	if err != nil {
		return nil, videoProjectError(err, "share")
	}
	return shareOutput(share), nil
}

func (h *VideoProjectShareHandler) disable(ctx context.Context, input *VideoProjectShareInput) (*VideoProjectShareOutput, error) {
	if err := h.service.DisableShare(ctx, workspaceActor(ctx, middleware.GetUserID(ctx)), input.WorkspaceID, input.PathID); err != nil {
		return nil, videoProjectError(err, "stop sharing")
	}
	return shareOutput(nil), nil
}

func (h *VideoProjectShareHandler) read(ctx context.Context, input *SharedVideoProjectInput) (*SharedVideoProjectOutput, error) {
	if h.signer == nil || h.signer.Sign("probe", h.now()) == "" {
		return nil, huma.Error503ServiceUnavailable("Share links need media signing, which this server has not configured")
	}
	shared, err := h.service.ResolveShare(ctx, input.Token)
	if err != nil {
		return nil, videoProjectError(err, "open the shared")
	}
	document := videoProjectDocument{RawMessage: json.RawMessage(shared.Project.DocumentJSON)}
	if !document.valid() {
		return nil, huma.Error500InternalServerError("Stored project document is invalid")
	}
	expiresAt := h.now().UTC().Add(sharedMediaURLLifetime).Truncate(time.Second)
	output := &SharedVideoProjectOutput{}
	output.Body.Name = shared.Project.Name
	output.Body.UpdatedAt = shared.Project.UpdatedAt.UTC().Format(time.RFC3339Nano)
	output.Body.ExpiresAt = expiresAt.Format(time.RFC3339)
	output.Body.Document = document
	output.Body.Assets = make([]SharedVideoProjectAsset, 0, len(shared.Assets))
	for _, entry := range shared.Assets {
		preparation := map[string]any{}
		if json.Unmarshal([]byte(entry.Asset.PreparationJSON), &preparation) != nil {
			preparation = map[string]any{}
		}
		mimeType := entry.Media.MimeType
		if mimeType == "" {
			mimeType = entry.Asset.MimeType
		}
		query := url.Values{}
		query.Set("exp", strconv.FormatInt(expiresAt.Unix(), 10))
		query.Set("sig", h.signer.Sign(entry.Media.ID, expiresAt))
		output.Body.Assets = append(output.Body.Assets, SharedVideoProjectAsset{
			StableMediaID: entry.Asset.StableMediaID, OriginalFilename: entry.Asset.OriginalFilename,
			MimeType: mimeType, Size: entry.Asset.Size, SHA256: entry.Asset.SHA256, Preparation: preparation,
			URL:   "/media/" + url.PathEscape(entry.Media.ID) + "?" + query.Encode(),
			Width: entry.Media.Width, Height: entry.Media.Height, DurationMS: entry.Media.DurationMS,
			FrameRate: entry.Media.FrameRate, ContainerFormat: entry.Media.ContainerFormat,
			VideoCodec: entry.Media.VideoCodec, AudioCodec: entry.Media.AudioCodec,
		})
	}
	return output, nil
}
