-- Migration: 0002_add_user_fields
-- Adds telegram_username (nullable) and username (unique, not null) to the users table.
-- username is the user's public display handle on the platform — hides wallet addresses
-- from counterparties. Existing users receive a deterministic default based on their UUID.
--
-- Uses IF NOT EXISTS throughout to be idempotent — safe to re-run if the schema was
-- previously synced via drizzle-kit push without being recorded in __drizzle_migrations.

-- Telegram username: optional, stored when the user provides it during the linking flow.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- Platform username: public handle, 4–10 alphanumeric chars, unique.
-- Added as nullable first so we can backfill existing rows.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Backfill existing users with the first 8 uppercase hex chars of their UUID.
-- UUID format: xxxxxxxx-xxxx-... so the first 8 chars are always unique hex digits.
UPDATE users
SET username = UPPER(SUBSTRING(id::text, 1, 8))
WHERE username IS NULL;

-- Enforce NOT NULL after backfill. Idempotent in PostgreSQL (no-op if already set).
ALTER TABLE users
  ALTER COLUMN username SET NOT NULL;

-- Safely add unique constraint only if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_key' AND contype = 'u'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;
