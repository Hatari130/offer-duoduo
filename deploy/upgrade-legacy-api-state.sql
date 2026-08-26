\set ON_ERROR_STOP on

-- Bridge the GitHub dd5a5fa `api_state` persistence schema to the relational
-- schema used by the current OfferFlow API. Run as postgres or offerflow_admin.
-- The legacy api_state table is intentionally retained for rollback/audit.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('offerflow-legacy-api-state-upgrade'));

DO $$
BEGIN
  IF to_regclass('public.api_state') IS NULL THEN
    RAISE EXCEPTION 'legacy api_state table is missing; refusing the compatibility upgrade';
  END IF;
  IF to_regclass('public.auth_sessions') IS NOT NULL THEN
    RAISE EXCEPTION 'auth_sessions already exists; compatibility upgrade appears to have run already';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tailor_tasks' AND column_name = 'version_id'
  ) THEN
    RAISE EXCEPTION 'unexpected tailor_tasks schema; refusing the compatibility upgrade';
  END IF;
END $$;

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

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE interview_records ADD COLUMN IF NOT EXISTS payload jsonb;

-- Reverse the legacy resume -> task dependency. The current API creates the
-- task first and stores its id on the resume version.
ALTER TABLE tailor_tasks DROP CONSTRAINT tailor_tasks_user_id_version_id_fkey;
ALTER TABLE resume_versions ADD COLUMN tailor_task_id uuid;
UPDATE resume_versions AS version
SET tailor_task_id = task.id
FROM tailor_tasks AS task
WHERE task.user_id = version.user_id AND task.version_id = version.id;
ALTER TABLE resume_versions
  ADD CONSTRAINT resume_versions_tailor_task_id_fkey
  FOREIGN KEY (tailor_task_id) REFERENCES tailor_tasks(id) ON DELETE SET NULL;
ALTER TABLE tailor_tasks DROP COLUMN version_id;

-- Application ids are only unique inside a user account. Rebuild dependent
-- foreign keys before replacing the legacy global primary key.
ALTER TABLE application_events DROP CONSTRAINT application_events_application_id_fkey;
ALTER TABLE interview_records DROP CONSTRAINT interview_records_user_id_application_id_fkey;
ALTER TABLE applications DROP CONSTRAINT applications_pkey;
ALTER TABLE applications DROP CONSTRAINT applications_user_id_id_key;
ALTER TABLE applications ADD CONSTRAINT applications_pkey PRIMARY KEY (user_id, id);
ALTER TABLE application_events
  ADD CONSTRAINT application_events_application_id_fkey
  FOREIGN KEY (user_id, application_id)
  REFERENCES applications(user_id, id) ON DELETE CASCADE;
ALTER TABLE interview_records
  ADD CONSTRAINT interview_records_user_id_application_id_fkey
  FOREIGN KEY (user_id, application_id)
  REFERENCES applications(user_id, id) ON DELETE CASCADE;

INSERT INTO opportunity_feed_snapshots (singleton, payload, updated_at)
SELECT true, payload->'opportunityFeed', updated_at
FROM api_state
WHERE singleton = true AND jsonb_typeof(payload->'opportunityFeed') = 'object'
ON CONFLICT (singleton) DO UPDATE
SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;

INSERT INTO opportunity_feed_snapshots (singleton, payload, updated_at)
SELECT singleton, payload, updated_at
FROM opportunity_feed_state
WHERE NOT EXISTS (SELECT 1 FROM opportunity_feed_snapshots)
ON CONFLICT (singleton) DO NOTHING;

CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx
  ON auth_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS handoff_codes_expiry_idx
  ON handoff_codes (expires_at) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS resume_versions_user_updated_idx
  ON resume_versions (user_id, updated_at DESC);
CREATE INDEX audit_logs_user_created_idx
  ON audit_logs (user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tailor_tasks'::regclass
      AND tgname = 'tailor_tasks_set_updated_at'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER tailor_tasks_set_updated_at
    BEFORE UPDATE ON tailor_tasks
    FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.resume_versions'::regclass
      AND tgname = 'resume_versions_set_updated_at'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER resume_versions_set_updated_at
    BEFORE UPDATE ON resume_versions
    FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (name) VALUES
  ('0001_initial.sql'),
  ('0002_chat_auth_sync.sql'),
  ('0003_interview_qa.sql'),
  ('0004_runtime_security.sql'),
  ('0005_application_text_ids.sql')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE auth_sessions OWNER TO offerflow_admin;
ALTER TABLE opportunity_feed_snapshots OWNER TO offerflow_admin;
ALTER TABLE consent_records OWNER TO offerflow_admin;
ALTER TABLE audit_logs OWNER TO offerflow_admin;
ALTER SEQUENCE audit_logs_id_seq OWNER TO offerflow_admin;
ALTER TABLE schema_migrations OWNER TO offerflow_admin;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO offerflow_app', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO offerflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO offerflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO offerflow_app;

ALTER DEFAULT PRIVILEGES FOR ROLE offerflow_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO offerflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE offerflow_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO offerflow_app;

INSERT INTO audit_logs (action, metadata)
VALUES ('legacy_schema_upgraded', jsonb_build_object(
  'source', 'api_state',
  'target', 'relational_store',
  'upgradedAt', now()
));

COMMIT;
