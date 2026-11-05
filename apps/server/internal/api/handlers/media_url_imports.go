package handlers

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/openpost/backend/internal/api/middleware"
	"github.com/openpost/backend/internal/services/urlimport"
	"github.com/openpost/backend/internal/services/workspaceaccess"
	"github.com/uptrace/bun"
)

// MediaURLImportHandler fetches the media behind a page link with yt-dlp and
// hands the file to the editor, which imports it like a file from disk.
type MediaURLImportHandler struct {
	db       *bun.DB
	auth     middleware.Authenticator
	importer *urlimport.Importer
}

func NewMediaURLImportHandler(db *bun.DB, authenticator middleware.Authenticator, importer *urlimport.Importer) *MediaURLImportHandler {
	return &MediaURLImportHandler{db: db, auth: authenticator, importer: importer}
}

type MediaURLImportStatusInput struct {
	WorkspaceID string `query:"workspace_id" required:"true" doc:"Workspace ID"`
}

type MediaURLImportStatusOutput struct {
	Body struct {
		Enabled bool `json:"enabled" doc:"Whether this server imports media from links"`
	}
}

type MediaURLImportInput struct {
	Body struct {
		WorkspaceID string `json:"workspace_id" minLength:"1"`
		URL         string `json:"url" minLength:"1" maxLength:"2048" doc:"A public page or media link"`
	}
}

func (h *MediaURLImportHandler) RegisterRoutes(api huma.API) {
	auth := huma.Middlewares{middleware.AuthMiddleware(api, h.auth)}
	huma.Register(api, huma.Operation{
		OperationID: "get-media-url-import-status", Method: http.MethodGet, Path: "/media/url-imports",
		Summary: "Check whether link import is available", Tags: []string{"Media"},
		Middlewares: auth, Errors: []int{403},
	}, h.status)
	huma.Register(api, huma.Operation{
		OperationID: "create-media-url-import", Method: http.MethodPost, Path: "/media/url-imports",
		Summary:     "Download the media behind a link",
		Description: "Runs yt-dlp on this server and returns the file. Headers X-Source-Title, X-Source-Uploader, X-Source-Url, X-Source-Id and X-Source-Extractor carry what the page said about it. Only for media you have the rights to use.",
		Tags:        []string{"Media"}, Middlewares: auth, Errors: []int{400, 403, 413, 422, 429, 503},
	}, h.create)
}

func (h *MediaURLImportHandler) authorize(ctx context.Context, workspaceID string, level workspaceaccess.Level) error {
	decision, err := workspaceaccess.NewAuthorizer(h.db).Authorize(ctx, strings.TrimSpace(workspaceID), workspaceActor(ctx, middleware.GetUserID(ctx)), level)
	if err != nil {
		return huma.Error503ServiceUnavailable("Workspace access could not be checked")
	}
	if !decision.Allowed {
		return huma.Error403Forbidden("workspace editor role required")
	}
	return nil
}

func (h *MediaURLImportHandler) status(ctx context.Context, input *MediaURLImportStatusInput) (*MediaURLImportStatusOutput, error) {
	if err := h.authorize(ctx, input.WorkspaceID, workspaceaccess.LevelRead); err != nil {
		return nil, err
	}
	output := &MediaURLImportStatusOutput{}
	output.Body.Enabled = h.importer.Enabled()
	return output, nil
}

func (h *MediaURLImportHandler) create(ctx context.Context, input *MediaURLImportInput) (*huma.StreamResponse, error) {
	if err := h.authorize(ctx, input.Body.WorkspaceID, workspaceaccess.LevelEdit); err != nil {
		return nil, err
	}
	download, err := h.importer.Fetch(ctx, input.Body.URL)
	if err != nil {
		return nil, urlImportError(err)
	}
	file, err := os.Open(download.Path)
	if err != nil {
		_ = download.Close()
		return nil, huma.Error500InternalServerError("Could not read the downloaded file")
	}
	return &huma.StreamResponse{Body: func(hctx huma.Context) {
		defer func() {
			_ = file.Close()
			_ = download.Close()
		}()
		hctx.SetHeader("Content-Type", download.MimeType)
		hctx.SetHeader("Content-Length", strconv.FormatInt(download.Size, 10))
		hctx.SetHeader("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": download.FileName}))
		hctx.SetHeader("Cache-Control", "no-store")
		source := download.Source
		for name, value := range map[string]string{
			"X-Source-Title": source.Title, "X-Source-Uploader": source.Uploader, "X-Source-Url": source.PageURL,
			"X-Source-Id": source.ID, "X-Source-Extractor": source.Extractor,
		} {
			if value != "" {
				hctx.SetHeader(name, url.QueryEscape(value))
			}
		}
		hctx.SetStatus(http.StatusOK)
		_, _ = io.Copy(hctx.BodyWriter(), file)
	}}, nil
}

func urlImportError(err error) error {
	switch {
	case errors.Is(err, urlimport.ErrDisabled):
		return huma.Error503ServiceUnavailable("Importing from links is not turned on for this server. An administrator can set OPENPOST_URL_IMPORT_ENABLED=true and install yt-dlp.")
	case errors.Is(err, urlimport.ErrInvalidURL):
		return huma.Error400BadRequest("Enter a public http(s) link.")
	case errors.Is(err, urlimport.ErrBusy):
		return huma.Error429TooManyRequests("Other link imports are running. Try again in a moment.")
	case errors.Is(err, urlimport.ErrTooLarge):
		return huma.NewError(http.StatusRequestEntityTooLarge, "That file is larger than this server allows.")
	case errors.Is(err, urlimport.ErrNoMedia):
		return huma.Error422UnprocessableEntity("That link has no video, audio or image to import.")
	default:
		return huma.Error422UnprocessableEntity("Could not download that link: " + err.Error())
	}
}
