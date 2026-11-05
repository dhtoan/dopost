package handlers

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	echoMiddleware "github.com/labstack/echo/v4/middleware"
	"github.com/openpost/backend/internal/api/middleware"
	"github.com/openpost/backend/internal/services/exportfinish"
	"github.com/uptrace/bun"
)

// ExportFinishingHandler receives a browser-rendered export, re-encodes it
// with ffmpeg and hands the result back. Raw Echo routes, like media upload,
// because the upload is a large streamed body that Huma would buffer.
type ExportFinishingHandler struct {
	db      *bun.DB
	authn   middleware.Authenticator
	service *exportfinish.Service
}

func NewExportFinishingHandler(db *bun.DB, authenticator middleware.Authenticator, service *exportfinish.Service) *ExportFinishingHandler {
	return &ExportFinishingHandler{db: db, authn: authenticator, service: service}
}

func (h *ExportFinishingHandler) RegisterRoutes(e *echo.Echo) {
	auth := middleware.BearerMiddleware(h.authn)
	limit := strconv.FormatInt(MaxMediaUploadBytes+512*1024, 10)
	e.GET("/api/v1/export-finishing", h.capabilities, auth)
	e.POST("/api/v1/export-finishing", h.create, echoMiddleware.BodyLimit(limit), auth)
	e.GET("/api/v1/export-finishing/:id", h.status, auth)
	e.GET("/api/v1/export-finishing/:id/file", h.download, auth)
	e.DELETE("/api/v1/export-finishing/:id", h.cancel, auth)
}

func exportFinishingUser(c echo.Context) string {
	userID, _ := c.Get(string(middleware.UserIDKey)).(string)
	return userID
}

func (h *ExportFinishingHandler) capabilities(c echo.Context) error {
	targets := []exportfinish.Target{}
	if h.service.Enabled() {
		targets = exportfinish.Targets
	}
	return c.JSON(http.StatusOK, map[string]any{"enabled": h.service.Enabled(), "targets": targets})
}

func (h *ExportFinishingHandler) create(c echo.Context) error {
	if !h.service.Enabled() {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": exportfinish.ErrDisabled.Error()})
	}
	userID := exportFinishingUser(c)
	workspaceID := strings.TrimSpace(c.QueryParam("workspace_id"))
	if allowed, err := workspaceEditAllowed(c.Request().Context(), h.db, workspaceID, userID); err != nil {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"error": "workspace access could not be checked"})
	} else if !allowed {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "workspace editor role required"})
	}
	upload, err := os.CreateTemp("", "dopost-finish-upload-*.mp4")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "could not store the upload"})
	}
	_, copyErr := io.Copy(upload, c.Request().Body)
	closeErr := upload.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(upload.Name())
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "the upload did not finish"})
	}
	job, err := h.service.Start(userID, c.QueryParam("target"), c.QueryParam("name"), c.QueryParam("loudness") == "1", upload.Name())
	if err != nil {
		return exportFinishingError(c, err)
	}
	return c.JSON(http.StatusAccepted, job)
}

func (h *ExportFinishingHandler) status(c echo.Context) error {
	job, err := h.service.Get(exportFinishingUser(c), c.Param("id"))
	if err != nil {
		return exportFinishingError(c, err)
	}
	return c.JSON(http.StatusOK, job)
}

func (h *ExportFinishingHandler) download(c echo.Context) error {
	job, file, err := h.service.Open(exportFinishingUser(c), c.Param("id"))
	if err != nil {
		return exportFinishingError(c, err)
	}
	defer func() { _ = file.Close() }()
	header := c.Response().Header()
	header.Set("Content-Type", job.MimeType)
	header.Set("Content-Length", strconv.FormatInt(job.Size, 10))
	header.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": job.FileName}))
	header.Set("Cache-Control", "no-store")
	c.Response().WriteHeader(http.StatusOK)
	_, err = io.Copy(c.Response(), file)
	return err
}

func (h *ExportFinishingHandler) cancel(c echo.Context) error {
	if err := h.service.Cancel(exportFinishingUser(c), c.Param("id")); err != nil {
		return exportFinishingError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

func exportFinishingError(c echo.Context, err error) error {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, exportfinish.ErrDisabled):
		status = http.StatusServiceUnavailable
	case errors.Is(err, exportfinish.ErrUnknownTarget):
		status = http.StatusBadRequest
	case errors.Is(err, exportfinish.ErrBusy):
		status = http.StatusTooManyRequests
	case errors.Is(err, exportfinish.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, exportfinish.ErrNotReady):
		status = http.StatusConflict
	}
	return c.JSON(status, map[string]string{"error": err.Error()})
}
