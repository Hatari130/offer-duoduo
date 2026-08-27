BEGIN;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('streaming', 'complete', 'error', 'stopped'));

COMMIT;
