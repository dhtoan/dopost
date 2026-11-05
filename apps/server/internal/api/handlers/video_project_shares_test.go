package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humaecho"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/mediasigner"
	"github.com/stretchr/testify/require"
)

func TestVideoProjectShareLinkLifecycle(t *testing.T) {
	db := createHandlerTestDB(t,
		(*models.Workspace)(nil),
		(*models.User)(nil),
		(*models.WorkspaceMember)(nil),
		(*models.VideoProject)(nil),
		(*models.VideoProjectRevision)(nil),
		(*models.VideoProjectMutation)(nil),
		(*models.VideoProjectConflict)(nil),
		(*models.VideoProjectCheckpoint)(nil),
		(*models.ProjectAsset)(nil),
		(*models.MediaAttachment)(nil),
		(*models.VideoProjectShare)(nil),
	)
	server := videoProjectTestServerWithDB(t, db)
	signer := mediasigner.New("share-test-secret")
	api := humaecho.NewWithGroup(server.echo, server.echo.Group("/api/v1"), huma.DefaultConfig("Test", "1.0.0"))
	NewVideoProjectShareHandler(db, videoProjectTestAuthenticator{}, signer).RegisterRoutes(api)

	created := server.request(t, "editor-token", http.MethodPost, "/api/v1/video-projects", map[string]any{
		"id": "shared-project", "workspace_id": "ws-1", "name": "Launch clip",
		"document": map[string]any{"id": "shared-project", "timeline": map[string]any{
			"items": []any{map[string]any{"id": "clip", "mediaId": "clip-source"}},
		}},
	})
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	media := []models.MediaAttachment{
		{ID: "media-ready", WorkspaceID: "ws-1", FilePath: "ready.mp4", MimeType: "video/mp4", Width: 1080, Height: 1920, DurationMS: 4000, VideoCodec: "h264"},
		{ID: "media-trashed", WorkspaceID: "ws-1", FilePath: "trashed.mp4", MimeType: "video/mp4", TrashedAt: time.Now()},
	}
	_, err := db.NewInsert().Model(&media).Exec(t.Context())
	require.NoError(t, err)
	assets := []models.ProjectAsset{
		{ID: "asset-ready", ProjectID: "shared-project", WorkspaceID: "ws-1", StableMediaID: "clip-source", MediaID: "media-ready",
			OriginalFilename: "clip.mp4", MimeType: "video/mp4", Size: 100, Status: models.ProjectAssetStatusReady,
			PreparationJSON: `{"editorMedia":{"duration":4}}`, UploadedByUserID: "user-editor"},
		{ID: "asset-trashed", ProjectID: "shared-project", WorkspaceID: "ws-1", StableMediaID: "old", MediaID: "media-trashed",
			OriginalFilename: "old.mp4", MimeType: "video/mp4", Status: models.ProjectAssetStatusReady, PreparationJSON: `{}`, UploadedByUserID: "user-editor"},
		{ID: "asset-pending", ProjectID: "shared-project", WorkspaceID: "ws-1", StableMediaID: "pending",
			OriginalFilename: "pending.mp4", MimeType: "video/mp4", Status: models.ProjectAssetStatusPending, PreparationJSON: `{}`, UploadedByUserID: "user-editor"},
	}
	_, err = db.NewInsert().Model(&assets).Exec(t.Context())
	require.NoError(t, err)

	sharePath := "/api/v1/video-projects/shared-project/share?workspace_id=ws-1"
	readShare := func(token, method string) VideoProjectShareResponse {
		t.Helper()
		response := server.request(t, token, method, sharePath, nil)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var body struct {
			Share *VideoProjectShareResponse `json:"share"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
		if body.Share == nil {
			return VideoProjectShareResponse{}
		}
		return *body.Share
	}

	require.Empty(t, readShare("viewer-token", http.MethodGet).Token, "no link until someone turns it on")
	viewerEnable := server.request(t, "viewer-token", http.MethodPut, sharePath, nil)
	require.Equal(t, http.StatusForbidden, viewerEnable.Code, "viewers may not publish a link")

	share := readShare("editor-token", http.MethodPut)
	require.GreaterOrEqual(t, len(share.Token), 32)
	require.Equal(t, share.Token, readShare("editor-token", http.MethodPut).Token, "turning it on again keeps the link")
	require.Equal(t, share.Token, readShare("viewer-token", http.MethodGet).Token)

	public := server.request(t, "", http.MethodGet, "/api/v1/public/video-shares/"+share.Token, nil)
	require.Equal(t, http.StatusOK, public.Code, public.Body.String())
	var shared struct {
		Name     string                    `json:"name"`
		Document map[string]any            `json:"document"`
		Assets   []SharedVideoProjectAsset `json:"assets"`
	}
	require.NoError(t, json.Unmarshal(public.Body.Bytes(), &shared))
	require.Equal(t, "Launch clip", shared.Name)
	require.Equal(t, "shared-project", shared.Document["id"])
	require.NotContains(t, public.Body.String(), "ws-1", "the public view carries no workspace id")
	require.Len(t, shared.Assets, 1, "only ready, untrashed media is shared")
	asset := shared.Assets[0]
	require.Equal(t, "clip-source", asset.StableMediaID)
	require.Equal(t, 1080, asset.Width)
	require.Equal(t, "h264", asset.VideoCodec)
	link, err := url.Parse(asset.URL)
	require.NoError(t, err)
	require.Equal(t, "/media/media-ready", link.Path)
	exp, err := strconv.ParseInt(link.Query().Get("exp"), 10, 64)
	require.NoError(t, err)
	require.True(t, signer.Verify("media-ready", link.Query().Get("sig"), exp), "the media URL carries a valid signature")

	missing := server.request(t, "", http.MethodGet, "/api/v1/public/video-shares/"+strings.Repeat("x", 32), nil)
	require.Equal(t, http.StatusNotFound, missing.Code)

	require.Empty(t, readShare("editor-token", http.MethodDelete).Token)
	revoked := server.request(t, "", http.MethodGet, "/api/v1/public/video-shares/"+share.Token, nil)
	require.Equal(t, http.StatusNotFound, revoked.Code, "a turned-off link stops working")
	again := readShare("editor-token", http.MethodPut)
	require.NotEqual(t, share.Token, again.Token, "turning it on again makes a new link")

	trashed := server.request(t, "editor-token", http.MethodPost, "/api/v1/video-projects/shared-project/trash", map[string]any{"workspace_id": "ws-1"})
	require.Equal(t, http.StatusOK, trashed.Code, trashed.Body.String())
	afterTrash := server.request(t, "", http.MethodGet, "/api/v1/public/video-shares/"+again.Token, nil)
	require.Equal(t, http.StatusNotFound, afterTrash.Code, "a trashed project is not shared")
}
