BEGIN;

CREATE TABLE product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('suggestion', 'issue', 'content', 'other')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 4 AND 2000),
  contact text CHECK (contact IS NULL OR char_length(contact) <= 160),
  page_path text CHECK (page_path IS NULL OR char_length(page_path) <= 500),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'planned', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_feedback_status_created_idx
  ON product_feedback (status, created_at DESC);
CREATE INDEX product_feedback_user_created_idx
  ON product_feedback (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'offerflow_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON product_feedback TO offerflow_app';
  END IF;
END;
$$;

COMMIT;
