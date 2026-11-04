package autovideoprojects

import (
	"database/sql"
	"encoding/json"
	"testing"

	"github.com/openpost/backend/internal/models"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"github.com/uptrace/bun/driver/sqliteshim"
)

func newAutoVideoProjectsTestDB(t *testing.T) *bun.DB {
	t.Helper()
	sqlDB, err := sql.Open(sqliteshim.ShimName, "file:"+t.Name()+"?mode=memory&cache=shared")
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	db := bun.NewDB(sqlDB, sqlitedialect.New())
	t.Cleanup(func() { require.NoError(t, db.Close()) })
	for _, model := range []any{(*models.VideoProject)(nil), (*models.DopostAutoVideoProject)(nil)} {
		_, err := db.NewCreateTable().Model(model).IfNotExists().Exec(t.Context())
		require.NoError(t, err)
	}
	_, err = db.NewInsert().Model(&models.VideoProject{
		ID: "project", WorkspaceID: "workspace", Name: "Auto", HeadRevision: 1, DocumentJSON: `{}`,
		SyncStatus: models.VideoProjectSyncSynced, CreatedByUserID: "user", UpdatedByUserID: "user",
	}).Exec(t.Context())
	require.NoError(t, err)
	return db
}

func sidecarInput(version int64, title string) UpsertInput {
	return UpsertInput{
		WorkspaceID:       "workspace",
		ProjectID:         "project",
		GenerationVersion: version,
		SourceManifest:    json.RawMessage(`{"source":{"kind":"text"}}`),
		Storyboard:        json.RawMessage(`{"version":1,"title":"` + title + `"}`),
		ProviderManifest:  json.RawMessage(`{}`),
		GenerationGraph:   json.RawMessage(`{"version":1,"blocks":[]}`),
	}
}

func TestUpsertAcceptsNewerGenerationsAndRefusesStaleOnes(t *testing.T) {
	service := New(newAutoVideoProjectsTestDB(t))

	first, err := service.Upsert(t.Context(), sidecarInput(1, "first"))
	require.NoError(t, err)
	require.EqualValues(t, 1, first.GenerationVersion)

	second, err := service.Upsert(t.Context(), sidecarInput(2, "second"))
	require.NoError(t, err)
	require.EqualValues(t, 2, second.GenerationVersion)

	// Another tab still holding generation 1 saves its own generation 2: refused,
	// and the stored work is untouched.
	_, err = service.Upsert(t.Context(), sidecarInput(2, "other tab"))
	require.ErrorIs(t, err, ErrConflict)
	_, err = service.Upsert(t.Context(), sidecarInput(1, "older"))
	require.ErrorIs(t, err, ErrConflict)

	stored, err := service.Get(t.Context(), "workspace", "project")
	require.NoError(t, err)
	require.EqualValues(t, 2, stored.GenerationVersion)
	require.JSONEq(t, `{"version":1,"title":"second"}`, string(stored.Storyboard))
}

func TestUpsertRefusesProjectsOutsideTheWorkspace(t *testing.T) {
	service := New(newAutoVideoProjectsTestDB(t))
	input := sidecarInput(1, "x")
	input.WorkspaceID = "elsewhere"
	_, err := service.Upsert(t.Context(), input)
	require.ErrorIs(t, err, ErrNotFound)
}
