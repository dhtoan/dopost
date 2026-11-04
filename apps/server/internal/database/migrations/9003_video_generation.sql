CREATE TABLE video_generation_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    request_json TEXT NOT NULL,
    authority_json TEXT NOT NULL,
    source_media_id TEXT REFERENCES media_attachments(id) ON DELETE SET NULL,
    result_media_id TEXT REFERENCES media_attachments(id) ON DELETE SET NULL,
    endpoint TEXT NOT NULL,
    provider_request_id TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    error_message TEXT NOT NULL DEFAULT '',
    billing_state TEXT NOT NULL DEFAULT 'pending',
    cost_microusd BIGINT,
    lease_token TEXT NOT NULL DEFAULT '',
    lease_expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    UNIQUE(user_id, workspace_id, idempotency_key)
);
CREATE INDEX video_generation_project ON video_generation_runs(workspace_id, user_id, project_id, created_at);
CREATE INDEX video_generation_source ON video_generation_runs(source_media_id);
CREATE INDEX video_generation_result ON video_generation_runs(result_media_id);
