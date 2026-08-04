BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION offerflow_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_auth_id text NOT NULL UNIQUE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  official_url text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recruitment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  batch text,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'open', 'closing', 'closed', 'ongoing')),
  open_at timestamptz,
  deadline_at timestamptz,
  graduation_years jsonb NOT NULL DEFAULT '[]'::jsonb,
  role_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  cities jsonb NOT NULL DEFAULT '[]'::jsonb,
  official_url text NOT NULL,
  source_name text,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, title, batch)
);

CREATE TABLE job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES recruitment_campaigns(id) ON DELETE SET NULL,
  external_job_id text,
  title text NOT NULL,
  department text,
  location text,
  job_type text,
  description text,
  responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text NOT NULL,
  deadline_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_url)
);

CREATE TABLE opportunity_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('feishu', 'official_site', 'json', 'manual')),
  source_url text,
  enabled boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunity_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES opportunity_sources(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed')),
  fetched_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE opportunity_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES opportunity_sources(id) ON DELETE CASCADE,
  import_run_id uuid REFERENCES opportunity_import_runs(id) ON DELETE SET NULL,
  source_record_id text NOT NULL,
  payload_hash text NOT NULL,
  raw_payload jsonb NOT NULL,
  campaign_id uuid REFERENCES recruitment_campaigns(id) ON DELETE SET NULL,
  job_posting_id uuid REFERENCES job_postings(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE applications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_posting_id uuid REFERENCES job_postings(id) ON DELETE SET NULL,
  stage text NOT NULL
    CHECK (stage IN ('interested', 'to_apply', 'applied', 'assessment', 'interview', 'offer', 'closed')),
  external_stage text,
  company_name_snapshot text NOT NULL,
  position_snapshot text NOT NULL,
  department_snapshot text,
  city_snapshot text,
  job_type_snapshot text,
  source_url text NOT NULL,
  source_host text NOT NULL,
  summary_snapshot text,
  responsibilities_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_excerpt_snapshot text,
  is_favorite boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  deadline_at timestamptz,
  next_action text,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, id)
);

CREATE TABLE application_events (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'stage_changed', 'updated', 'captured')),
  title text NOT NULL,
  occurred_at timestamptz NOT NULL,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text,
  last_cursor bigint NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE sync_changes (
  sequence_id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type text NOT NULL
    CHECK (entity_type IN ('application', 'application_event', 'profile')),
  entity_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete')),
  revision bigint NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE form_mapping_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id text NOT NULL,
  version text NOT NULL,
  mapping_data jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adapter_id, version)
);

CREATE INDEX recruitment_campaigns_status_deadline_idx
  ON recruitment_campaigns (status, deadline_at);
CREATE INDEX job_postings_campaign_idx ON job_postings (campaign_id);
CREATE INDEX applications_user_updated_idx ON applications (user_id, updated_at DESC);
CREATE INDEX applications_user_stage_idx ON applications (user_id, stage);
CREATE INDEX application_events_application_time_idx
  ON application_events (application_id, occurred_at DESC);
CREATE INDEX sync_changes_user_sequence_idx ON sync_changes (user_id, sequence_id);

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER recruitment_campaigns_set_updated_at
BEFORE UPDATE ON recruitment_campaigns
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER job_postings_set_updated_at
BEFORE UPDATE ON job_postings
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER opportunity_sources_set_updated_at
BEFORE UPDATE ON opportunity_sources
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

CREATE TRIGGER applications_set_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION offerflow_set_updated_at();

COMMIT;
