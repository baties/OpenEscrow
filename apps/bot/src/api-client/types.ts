/**
 * api-client/types.ts — OpenEscrow Telegram Bot
 *
 * Handles: TypeScript request and response type definitions that mirror the
 *          OpenEscrow backend API contract. Used exclusively by the api-client.
 * Does NOT: contain runtime logic, Zod schemas, or validation code.
 *           Types here must stay in sync with the API's actual response shapes.
 *
 * Source of truth: apps/api/src/modules/ + packages/shared/src/types/
 */

// ─── Re-exported shared types used throughout the bot ─────────────────────────

export type {
  DealStatus,
  MilestoneStatus,
  Deal,
  Milestone,
  DealEvent,
  DealEventType,
} from '@open-escrow/shared';

// Import locally for use in interface definitions below
import type { Deal, MilestoneStatus, DealEvent } from '@open-escrow/shared';

// ─── API Response Shapes ──────────────────────────────────────────────────────

/**
 * Health check response from GET /api/v1/health.
 */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

/**
 * Standard API error response body.
 * Returned by the API on 4xx / 5xx responses.
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Response from POST /api/v1/auth/nonce.
 */
export interface NonceResponse {
  nonce: string;
}

/**
 * Response from POST /api/v1/auth/verify.
 */
export interface AuthVerifyResponse {
  token: string;
  userId: string;
  walletAddress: string;
}

/**
 * Response from GET /api/v1/deals.
 * Returns deals (with milestones array per the API implementation).
 */
export interface ListDealsResponse {
  deals: Deal[];
}

/**
 * Response from GET /api/v1/deals/:id.
 * Returns the full deal with milestones.
 */
export type GetDealResponse = Deal;

/**
 * Response from GET /api/v1/deals/:id/timeline.
 */
export interface GetTimelineResponse {
  events: DealEvent[];
}

/**
 * Response from POST /api/v1/milestones/:id/submit.
 * Returns the created submission record.
 */
export interface SubmitMilestoneResponse {
  id: string;
  milestoneId: string;
  submittedBy: string;
  summary: string;
  links: string[];
  createdAt: string;
}

/**
 * Request body for POST /api/v1/milestones/:id/submit.
 */
export interface SubmitMilestoneRequest {
  summary: string;
  links: string[];
}

/**
 * Request body for POST /api/v1/milestones/:id/reject.
 */
export interface RejectMilestoneRequest {
  reasonCodes: string[];
  freeText: string;
}

/**
 * Response from POST /api/v1/milestones/:id/approve.
 */
export interface ApproveMilestoneResponse {
  id: string;
  dealId: string;
  status: MilestoneStatus;
}

/**
 * Response from POST /api/v1/milestones/:id/reject.
 */
export interface RejectMilestoneResponse {
  id: string;
  submissionId: string;
  reasonCodes: string[];
  freeText: string;
  createdAt: string;
}

/**
 * Response from POST /api/v1/deals/:id/agree.
 */
export type AgreeDealResponse = Deal;

/**
 * Response from POST /api/v1/deals/:id/cancel.
 */
export type CancelDealResponse = Deal;

/**
 * Response from POST /api/v1/telegram/link.
 */
export interface TelegramLinkResponse {
  success: boolean;
  message: string;
}

/**
 * A session entry stored in the in-memory sessions map.
 * Holds all state the bot needs to act on behalf of a linked user.
 */
export interface UserSession {
  /** Our internal user UUID. */
  userId: string;
  /** JWT token from the API — used as Authorization header for all API calls. */
  jwt: string;
  /** The user's wallet address (lowercase). */
  walletAddress: string;
  /**
   * ISO 8601 timestamp of the most recent deal_event we notified about.
   * Used by the poller to filter events with createdAt > lastSeenEventAt,
   * which is reliable unlike UUID string comparison (UUIDs v4 are random,
   * not monotonically ordered).
   */
  lastSeenEventAt: string | null;
}
