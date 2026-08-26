BEGIN;

-- Extension application IDs are intentionally stable, human-inspectable
-- strings (for example app_m3...). They are not guaranteed to be UUIDs.
ALTER TABLE application_events DROP CONSTRAINT application_events_application_id_fkey;
ALTER TABLE interview_records DROP CONSTRAINT interview_records_user_id_application_id_fkey;
ALTER TABLE applications DROP CONSTRAINT applications_pkey;
ALTER TABLE applications DROP CONSTRAINT applications_user_id_id_key;

ALTER TABLE applications ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE application_events ALTER COLUMN application_id TYPE text USING application_id::text;
ALTER TABLE interview_records ALTER COLUMN application_id TYPE text USING application_id::text;

ALTER TABLE applications
  ADD CONSTRAINT applications_pkey PRIMARY KEY (user_id, id);

ALTER TABLE application_events
  ADD CONSTRAINT application_events_application_id_fkey
  FOREIGN KEY (user_id, application_id)
  REFERENCES applications(user_id, id) ON DELETE CASCADE;
ALTER TABLE interview_records
  ADD CONSTRAINT interview_records_user_id_application_id_fkey
  FOREIGN KEY (user_id, application_id)
  REFERENCES applications(user_id, id) ON DELETE CASCADE;

COMMIT;
