BEGIN;

CREATE UNIQUE INDEX users_active_email_unique_idx
  ON users ((lower(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE api_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
