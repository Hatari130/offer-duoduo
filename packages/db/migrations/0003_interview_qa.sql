BEGIN;

-- Interview artefacts are private user data. Keeping user_id on both tables
-- makes tenant filtering explicit before any full-text or future vector lookup.
CREATE TABLE interview_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('transcript', 'audio')),
  status text NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  transcript text NOT NULL DEFAULT '',
  processing_provider text,
  original_file_name text,
  error text,
  knowledge_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, application_id)
    REFERENCES applications(user_id, id) ON DELETE CASCADE
);

CREATE TABLE interview_qa_pairs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interview_record_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  evidence text,
  speaker_confidence real CHECK (
    speaker_confidence IS NULL OR
    (speaker_confidence >= 0 AND speaker_confidence <= 1)
  ),
  start_ms integer CHECK (start_ms IS NULL OR start_ms >= 0),
  end_ms integer CHECK (end_ms IS NULL OR end_ms >= 0),
  search_document tsvector GENERATED ALWAYS AS
    (to_tsvector('simple', coalesce(question, '') || ' ' || coalesce(answer, ''))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_record_id, ordinal),
  FOREIGN KEY (user_id, interview_record_id)
    REFERENCES interview_records(user_id, id) ON DELETE CASCADE
);

CREATE INDEX interview_records_user_application_idx
  ON interview_records (user_id, application_id, created_at DESC);
CREATE INDEX interview_qa_pairs_user_record_idx
  ON interview_qa_pairs (user_id, interview_record_id, ordinal);
CREATE INDEX interview_qa_pairs_search_idx
  ON interview_qa_pairs USING gin (search_document);

CREATE TRIGGER interview_records_set_updated_at
BEFORE UPDATE ON interview_records
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

COMMIT;
