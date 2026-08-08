BEGIN;

CREATE TABLE auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE device_pairing_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status text NOT NULL CHECK (status IN ('streaming', 'complete', 'error')),
  content text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('manual', 'file', 'url')),
  source_url text,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('processing', 'ready', 'failed', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  checksum text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, checksum)
);

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_document tsvector GENERATED ALWAYS AS
    (to_tsvector('simple', coalesce(content, ''))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE message_citations (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES knowledge_chunks(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL,
  excerpt text NOT NULL,
  score real,
  PRIMARY KEY (message_id, chunk_id)
);

CREATE TABLE sync_applied_changes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  revision bigint NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, change_id)
);

ALTER TABLE applications
  ADD COLUMN identity_aliases jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX messages_conversation_created_idx
  ON messages (conversation_id, created_at);
CREATE INDEX knowledge_chunks_search_idx
  ON knowledge_chunks USING gin (search_document);
CREATE INDEX device_pairing_codes_expiry_idx
  ON device_pairing_codes (expires_at)
  WHERE consumed_at IS NULL;

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER knowledge_sources_set_updated_at
BEFORE UPDATE ON knowledge_sources
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER knowledge_documents_set_updated_at
BEFORE UPDATE ON knowledge_documents
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

COMMIT;
