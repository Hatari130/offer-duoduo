BEGIN;

ALTER TABLE users
  ADD COLUMN avatar_key text NOT NULL DEFAULT 'sprout';

ALTER TABLE users
  ADD CONSTRAINT users_avatar_key_check
  CHECK (avatar_key IN ('sprout', 'sunny', 'peach', 'cloud', 'berry', 'acorn', 'mint', 'coral'));

COMMIT;
