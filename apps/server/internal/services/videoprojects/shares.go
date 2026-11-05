package videoprojects

// Read-only share links, after Donkey Cut's project shares
// (site/src/cut/server/cloud/share.ts, commit cddf34f, Apache-2.0): one link
// per project, an unguessable token, and a viewer read that resolves the
// token and reads the owner's project without a session.

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/workspaceaccess"
	"github.com/uptrace/bun"
)

const maxShareTokenLength = 64

// newShareToken returns 24 random bytes (192 bits), base64url: for a link
// anyone can open, the token is the only gate.
func newShareToken() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// GetShare returns the project's share link, or nil when it has none.
func (s *Service) GetShare(ctx context.Context, actor workspaceaccess.ActorFacts, workspaceID, projectID string) (*models.VideoProjectShare, error) {
	project, err := s.Get(ctx, actor, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	return findShare(ctx, s.db, project.ID)
}

// EnableShare creates the project's share link, or returns the one it has.
func (s *Service) EnableShare(ctx context.Context, actor workspaceaccess.ActorFacts, workspaceID, projectID string) (*models.VideoProjectShare, error) {
	var share *models.VideoProjectShare
	err := s.db.RunInTx(ctx, &sql.TxOptions{}, func(txCtx context.Context, tx bun.Tx) error {
		project, err := loadProject(txCtx, tx, strings.TrimSpace(workspaceID), strings.TrimSpace(projectID), false)
		if err != nil {
			return err
		}
		if err := authorize(txCtx, tx, actor, project.WorkspaceID, workspaceaccess.LevelEdit); err != nil {
			return err
		}
		if share, err = findShare(txCtx, tx, project.ID); err != nil || share != nil {
			return err
		}
		token, err := newShareToken()
		if err != nil {
			return err
		}
		share = &models.VideoProjectShare{
			Token: token, ProjectID: project.ID, WorkspaceID: project.WorkspaceID,
			CreatedByUserID: actor.UserID, CreatedAt: s.now().UTC(),
		}
		_, err = tx.NewInsert().Model(share).Exec(txCtx)
		return err
	})
	if err != nil {
		return nil, err
	}
	return share, nil
}

// DisableShare deletes the project's share link; the old link stops working.
func (s *Service) DisableShare(ctx context.Context, actor workspaceaccess.ActorFacts, workspaceID, projectID string) error {
	project, err := loadProject(ctx, s.db, strings.TrimSpace(workspaceID), strings.TrimSpace(projectID), false)
	if err != nil {
		return err
	}
	if err := authorize(ctx, s.db, actor, project.WorkspaceID, workspaceaccess.LevelEdit); err != nil {
		return err
	}
	_, err = s.db.NewDelete().Model((*models.VideoProjectShare)(nil)).Where("project_id = ?", project.ID).Exec(ctx)
	return err
}

// SharedAsset is a ready project asset and the media file that holds it.
type SharedAsset struct {
	Asset models.ProjectAsset
	Media models.MediaAttachment
}

// SharedProject is what a share link shows: the project and the media
// playback needs. Trashed projects and media are left out.
type SharedProject struct {
	Project *models.VideoProject
	Assets  []SharedAsset
}

// ResolveShare reads a shared project by its token. It needs no session: the
// token is the access check, and only this project's ready assets come back.
func (s *Service) ResolveShare(ctx context.Context, token string) (*SharedProject, error) {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > maxShareTokenLength {
		return nil, ErrNotFound
	}
	var share models.VideoProjectShare
	if err := s.db.NewSelect().Model(&share).Where("token = ?", token).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	project, err := loadProject(ctx, s.db, share.WorkspaceID, share.ProjectID, false)
	if err != nil {
		return nil, err
	}
	var assets []models.ProjectAsset
	if err := s.db.NewSelect().Model(&assets).
		Where("project_id = ? AND workspace_id = ? AND status = ? AND media_id IS NOT NULL", project.ID, project.WorkspaceID, models.ProjectAssetStatusReady).
		OrderExpr("created_at ASC").
		Scan(ctx); err != nil {
		return nil, err
	}
	result := &SharedProject{Project: project}
	if len(assets) == 0 {
		return result, nil
	}
	mediaIDs := make([]string, 0, len(assets))
	for _, asset := range assets {
		mediaIDs = append(mediaIDs, asset.MediaID)
	}
	var media []models.MediaAttachment
	if err := s.db.NewSelect().Model(&media).
		Where("id IN (?) AND workspace_id = ? AND trashed_at IS NULL", bun.List(mediaIDs), project.WorkspaceID).
		Scan(ctx); err != nil {
		return nil, err
	}
	byID := make(map[string]models.MediaAttachment, len(media))
	for _, item := range media {
		byID[item.ID] = item
	}
	for _, asset := range assets {
		if item, ok := byID[asset.MediaID]; ok {
			result.Assets = append(result.Assets, SharedAsset{Asset: asset, Media: item})
		}
	}
	return result, nil
}

func findShare(ctx context.Context, db bun.IDB, projectID string) (*models.VideoProjectShare, error) {
	var share models.VideoProjectShare
	if err := db.NewSelect().Model(&share).Where("project_id = ?", projectID).Scan(ctx); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &share, nil
}
