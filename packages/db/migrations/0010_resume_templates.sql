BEGIN;

CREATE TABLE resume_templates (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX resume_templates_user_updated_idx
  ON resume_templates (user_id, updated_at DESC);

COMMIT;
