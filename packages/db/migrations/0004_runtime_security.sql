BEGIN;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  scope text NOT NULL CHECK (scope IN ('user', 'device')),
  device_id text,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE handoff_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_path text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tailor_tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE resume_versions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tailor_task_id uuid REFERENCES tailor_tasks(id) ON DELETE SET NULL,
  revision bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE opportunity_feed_snapshots (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  policy_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE applications ADD COLUMN payload jsonb;
ALTER TABLE conversations ADD COLUMN payload jsonb;
ALTER TABLE messages ADD COLUMN payload jsonb;
ALTER TABLE interview_records ADD COLUMN payload jsonb;

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx
  ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX handoff_codes_expiry_idx
  ON handoff_codes (expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX resume_versions_user_updated_idx
  ON resume_versions (user_id, updated_at DESC);
CREATE INDEX audit_logs_user_created_idx
  ON audit_logs (user_id, created_at DESC);

CREATE TRIGGER tailor_tasks_set_updated_at
BEFORE UPDATE ON tailor_tasks
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER resume_versions_set_updated_at
BEFORE UPDATE ON resume_versions
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

COMMIT;
