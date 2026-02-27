-- 0000_initial_schema.sql — OpenEscrow API
-- Initial database schema migration.
-- Creates all 7 tables: users, deals, milestones, submissions,
--   deal_events, telegram_links, rejection_notes.
-- Run by: database/migrate.ts on server startup via drizzle-kit migrate.

-- ─── users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_address"    TEXT NOT NULL UNIQUE,
  "telegram_user_id"  TEXT UNIQUE,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── deals ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deals" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"       UUID NOT NULL REFERENCES "users"("id"),
  "freelancer_id"   UUID NOT NULL REFERENCES "users"("id"),
  "token_address"   TEXT NOT NULL,
  "total_amount"    TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'DRAFT',
  "chain_deal_id"   TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "agreed_at"       TIMESTAMPTZ
);

-- ─── milestones ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "milestones" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id"             UUID NOT NULL REFERENCES "deals"("id"),
  "title"               TEXT NOT NULL,
  "description"         TEXT NOT NULL,
  "acceptance_criteria" TEXT NOT NULL,
  "amount"              TEXT NOT NULL,
  "sequence"            INTEGER NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'PENDING'
);

-- ─── submissions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "submissions" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "milestone_id"  UUID NOT NULL REFERENCES "milestones"("id"),
  "submitted_by"  UUID NOT NULL REFERENCES "users"("id"),
  "summary"       TEXT NOT NULL,
  "links"         JSONB NOT NULL DEFAULT '[]',
  "ai_summary"    TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── deal_events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deal_events" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id"     UUID NOT NULL REFERENCES "deals"("id"),
  "actor_id"    UUID NOT NULL REFERENCES "users"("id"),
  "event_type"  TEXT NOT NULL,
  "metadata"    JSONB NOT NULL DEFAULT '{}',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── telegram_links ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "telegram_links" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         UUID NOT NULL REFERENCES "users"("id"),
  "one_time_code"   TEXT NOT NULL UNIQUE,
  "expires_at"      TIMESTAMPTZ NOT NULL,
  "used_at"         TIMESTAMPTZ
);

-- ─── rejection_notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "rejection_notes" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "submission_id"       UUID NOT NULL REFERENCES "submissions"("id"),
  "reason_codes"        JSONB NOT NULL DEFAULT '[]',
  "free_text"           TEXT NOT NULL,
  "ai_revision_notes"   TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- Frequently queried columns get indexes for performance.

CREATE INDEX IF NOT EXISTS "idx_deals_client_id" ON "deals"("client_id");
CREATE INDEX IF NOT EXISTS "idx_deals_freelancer_id" ON "deals"("freelancer_id");
CREATE INDEX IF NOT EXISTS "idx_deals_status" ON "deals"("status");
CREATE INDEX IF NOT EXISTS "idx_deals_chain_deal_id" ON "deals"("chain_deal_id");

CREATE INDEX IF NOT EXISTS "idx_milestones_deal_id" ON "milestones"("deal_id");
CREATE INDEX IF NOT EXISTS "idx_milestones_status" ON "milestones"("status");

CREATE INDEX IF NOT EXISTS "idx_submissions_milestone_id" ON "submissions"("milestone_id");

CREATE INDEX IF NOT EXISTS "idx_deal_events_deal_id" ON "deal_events"("deal_id");
CREATE INDEX IF NOT EXISTS "idx_deal_events_created_at" ON "deal_events"("created_at");

CREATE INDEX IF NOT EXISTS "idx_telegram_links_user_id" ON "telegram_links"("user_id");
CREATE INDEX IF NOT EXISTS "idx_telegram_links_one_time_code" ON "telegram_links"("one_time_code");

CREATE INDEX IF NOT EXISTS "idx_rejection_notes_submission_id" ON "rejection_notes"("submission_id");
