BEGIN;

-- Application IDs come from browser/client data and are not guaranteed UUIDs.
ALTER TABLE application_events
  DROP CONSTRAINT IF EXISTS application_events_application_id_fkey;

ALTER TABLE interview_records
  DROP CONSTRAINT IF EXISTS interview_records_user_id_application_id_fkey;

ALTER TABLE applications
  ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE application_events
  ALTER COLUMN application_id TYPE text USING application_id::text;

ALTER TABLE interview_records
  ALTER COLUMN application_id TYPE text USING application_id::text;

ALTER TABLE application_events
  ADD CONSTRAINT application_events_application_id_fkey
  FOREIGN KEY (application_id)
  REFERENCES applications(id)
  ON DELETE CASCADE;

ALTER TABLE interview_records
  ADD CONSTRAINT interview_records_user_id_application_id_fkey
  FOREIGN KEY (user_id, application_id)
  REFERENCES applications(user_id, id)
  ON DELETE CASCADE;


-- User/client message IDs are also not guaranteed UUIDs.
ALTER TABLE message_citations
  DROP CONSTRAINT IF EXISTS message_citations_message_id_fkey;

ALTER TABLE messages
  ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE message_citations
  ALTER COLUMN message_id TYPE text USING message_id::text;

ALTER TABLE message_citations
  ADD CONSTRAINT message_citations_message_id_fkey
  FOREIGN KEY (message_id)
  REFERENCES messages(id)
  ON DELETE CASCADE;


-- Keep the complete domain object so new JobApplication fields can be added
-- without destructive schema changes while still retaining relational ownership.
ALTER TABLE applications
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE messages
  ADD COLUMN citations jsonb NOT NULL DEFAULT '[]'::jsonb;


-- Resume/tailor data currently exists in MemoryStore but had no SQL tables.
CREATE TABLE resume_versions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE INDEX resume_versions_user_updated_idx
  ON resume_versions (user_id, updated_at DESC);

CREATE TABLE tailor_tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, version_id)
    REFERENCES resume_versions(user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX tailor_tasks_user_updated_idx
  ON tailor_tasks (user_id, updated_at DESC);


-- Short-lived browser → website handoff tokens.
CREATE TABLE handoff_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_path text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX handoff_codes_expiry_idx
  ON handoff_codes (expires_at)
  WHERE consumed_at IS NULL;


-- Public opportunity feed snapshot.
CREATE TABLE opportunity_feed_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  payload jsonb NOT NULL DEFAULT '{"opportunities":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO opportunity_feed_state (singleton, payload)
VALUES (true, '{"opportunities":[]}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;


CREATE TRIGGER resume_versions_set_updated_at
BEFORE UPDATE ON resume_versions
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER tailor_tasks_set_updated_at
BEFORE UPDATE ON tailor_tasks
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

COMMIT;
