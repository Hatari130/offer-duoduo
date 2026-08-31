BEGIN;

CREATE TABLE email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register', 'login', 'reset_password')),
  code_hmac char(64) NOT NULL,
  requester_ip inet,
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX email_verification_lookup_idx
  ON email_verification_codes (email, purpose, created_at DESC);

CREATE INDEX email_verification_ip_created_idx
  ON email_verification_codes (requester_ip, created_at DESC)
  WHERE requester_ip IS NOT NULL;

CREATE INDEX email_verification_cleanup_idx
  ON email_verification_codes (created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'offerflow_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON email_verification_codes TO offerflow_app';
  END IF;
END;
$$;

COMMIT;
