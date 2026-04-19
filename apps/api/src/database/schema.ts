/**
 * database/schema.ts — OpenEscrow API
 *
 * Handles: Drizzle ORM table definitions for all 8 database tables.
 *          Defines column types, constraints, and relations used by repositories.
 * Does NOT: contain query logic (that lives in service files),
 *            run migrations (see migrate.ts), or manage connections (see index.ts).
 *
 * Tables (8):
 *   users, deals, milestones, submissions, deal_events, telegram_links, rejection_notes, messages
 */

import { pgTable, text, timestamp, integer, jsonb, uuid } from 'drizzle-orm/pg-core';

// ─── users ────────────────────────────────────────────────────────────────────

/**
 * Core user identity. Wallet address is the primary identifier.
 * Telegram user ID and username are optional — set after their respective flows.
 * username: public display handle used instead of wallet address for counterparty privacy.
 * telegramUsername: Telegram @handle, stored when provided during the linking flow.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: text('wallet_address').notNull().unique(),
  telegramUserId: text('telegram_user_id').unique(),
  telegramUsername: text('telegram_username'),
  username: text('username').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── deals ────────────────────────────────────────────────────────────────────

/**
 * Core deal record. Links client and freelancer wallets.
 * chain_deal_id is nullable until the deal is registered on-chain.
 * agreed_at is populated when freelancer calls /deals/:id/agree (DRAFT→AGREED).
 */
export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => users.id),
  freelancerId: uuid('freelancer_id')
    .notNull()
    .references(() => users.id),
  tokenAddress: text('token_address').notNull(),
  // Amount stored as text to avoid BigInt precision loss across JSON serialization.
  totalAmount: text('total_amount').notNull(),
  status: text('status').notNull().default('DRAFT'),
  // Numeric chain deal ID from the smart contract (null until funded).
  chainDealId: text('chain_deal_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Set when freelancer confirms DRAFT→AGREED transition.
  agreedAt: timestamp('agreed_at', { withTimezone: true }),
});

// ─── milestones ───────────────────────────────────────────────────────────────

/**
 * Milestones within a deal. Ordered by sequence (1-based).
 * Amount is stored as text (BigInt string) to avoid precision loss.
 */
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id')
    .notNull()
    .references(() => deals.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  acceptanceCriteria: text('acceptance_criteria').notNull(),
  amount: text('amount').notNull(),
  sequence: integer('sequence').notNull(),
  status: text('status').notNull().default('PENDING'),
});

// ─── submissions ──────────────────────────────────────────────────────────────

/**
 * Freelancer submissions for milestones.
 * links is a JSONB array of URL strings.
 * ai_summary is null until Phase 5 AI layer is implemented.
 */
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  milestoneId: uuid('milestone_id')
    .notNull()
    .references(() => milestones.id),
  submittedBy: uuid('submitted_by')
    .notNull()
    .references(() => users.id),
  summary: text('summary').notNull(),
  // Array of URL strings stored as JSONB.
  links: jsonb('links').notNull().default([]),
  // Populated by AI layer in Phase 5 only.
  aiSummary: text('ai_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── deal_events ──────────────────────────────────────────────────────────────

/**
 * Immutable audit trail for every deal action.
 * Every state transition and significant operation appends a row here.
 * metadata is a JSONB object with event-specific context.
 */
export const dealEvents = pgTable('deal_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id')
    .notNull()
    .references(() => deals.id),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  eventType: text('event_type').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── telegram_links ───────────────────────────────────────────────────────────

/**
 * One-time codes for linking Telegram user IDs to wallet accounts.
 * OTP expires 15 minutes after creation (enforced at verify time).
 * used_at is set when the OTP is successfully consumed.
 */
export const telegramLinks = pgTable('telegram_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  oneTimeCode: text('one_time_code').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Null until the code is consumed.
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// ─── rejection_notes ──────────────────────────────────────────────────────────

/**
 * Structured rejection feedback attached to a submission.
 * reason_codes is a JSONB array of short code strings (e.g. ["INCOMPLETE", "QUALITY"]).
 * ai_revision_notes is null until Phase 5 AI layer is implemented.
 */
export const rejectionNotes = pgTable('rejection_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => submissions.id),
  reasonCodes: jsonb('reason_codes').notNull().default([]),
  freeText: text('free_text').notNull(),
  // Populated by AI layer in Phase 5 only.
  aiRevisionNotes: text('ai_revision_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── messages ─────────────────────────────────────────────────────────────────

/**
 * Deal-scoped private chat messages between client and freelancer.
 * Messages are permanent — no soft delete. Telegram IDs are NOT stored here;
 * the bot proxies messages without exposing Telegram identities to either party.
 * All messages are retrievable for admin/audit purposes via deal_id + sender_id.
 */
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id')
    .notNull()
    .references(() => deals.id),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────

/** Inferred TypeScript types for each table row (select shape). */
export type User = typeof users.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type DealEvent = typeof dealEvents.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type RejectionNote = typeof rejectionNotes.$inferSelect;
export type Message = typeof messages.$inferSelect;

/** Inferred TypeScript types for inserts (all required columns). */
export type NewUser = typeof users.$inferInsert;
export type NewDeal = typeof deals.$inferInsert;
export type NewMilestone = typeof milestones.$inferInsert;
export type NewSubmission = typeof submissions.$inferInsert;
export type NewDealEvent = typeof dealEvents.$inferInsert;
export type NewTelegramLink = typeof telegramLinks.$inferInsert;
export type NewRejectionNote = typeof rejectionNotes.$inferInsert;
export type NewMessage = typeof messages.$inferInsert;
