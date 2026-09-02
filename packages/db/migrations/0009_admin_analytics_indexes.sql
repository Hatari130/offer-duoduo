BEGIN;

-- Read-only operations dashboards aggregate across users and time rather than
-- following the per-user access paths used by the product UI.
CREATE INDEX users_active_created_idx
  ON users (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX conversations_active_created_idx
  ON conversations (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX messages_role_created_idx
  ON messages (role, created_at DESC)
  INCLUDE (status, user_id);

CREATE INDEX applications_active_created_idx
  ON applications (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX resume_versions_created_idx
  ON resume_versions (created_at DESC);

CREATE INDEX interview_records_created_idx
  ON interview_records (created_at DESC);

COMMIT;
