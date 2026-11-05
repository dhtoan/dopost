-- Read-only share links for Cloud Video Projects. The token is the link and,
-- for anyone without a workspace session, the only gate, so it is random.
CREATE TABLE IF NOT EXISTS video_project_shares (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
);
