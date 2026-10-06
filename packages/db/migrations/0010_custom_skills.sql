BEGIN;

-- Skills users create for their own agent teams. Private to the owner.
CREATE TABLE custom_skills (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_skills_user_created_idx
  ON custom_skills (user_id, created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'offerflow_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON custom_skills TO offerflow_app';
  END IF;
END;
$$;

COMMIT;
