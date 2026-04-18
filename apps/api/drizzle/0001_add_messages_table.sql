-- 0001_add_messages_table.sql — OpenEscrow API
-- Adds the messages table for deal-scoped private chat between client and freelancer.
-- Messages are permanent records — no soft delete. Telegram IDs are never stored here.
-- Privacy relay: the bot proxies messages between parties without exposing Telegram user IDs.
-- All messages retrievable for admin purposes at any time via deal_id + sender_id.

CREATE TABLE IF NOT EXISTS "messages" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deal_id"     UUID NOT NULL REFERENCES "deals"("id"),
  "sender_id"   UUID NOT NULL REFERENCES "users"("id"),
  "content"     TEXT NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index optimises per-deal history (newest-first) and cursor-based pagination.
-- Also enables efficient full admin scan when filtering by deal_id.
CREATE INDEX IF NOT EXISTS "idx_messages_deal_id_created_at" ON "messages"("deal_id", "created_at" DESC);
