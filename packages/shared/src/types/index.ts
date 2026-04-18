/**
 * types/index.ts — @open-escrow/shared
 *
 * Shared TypeScript types used across apps/api, apps/web, and apps/bot.
 * Handles: deal state machine types, API request/response shapes, domain enums.
 * Does NOT: contain runtime logic, Zod schemas (those live in apps/api/src/modules/),
 *            or framework-specific types.
 */

// ─── Deal State Machine ───────────────────────────────────────────────────────

/**
 * All possible states for a deal in the OpenEscrow state machine.
 * See CLAUDE.md Section G for the full transition table.
 */
export type DealStatus =
  | 'DRAFT'
  | 'AGREED'
  | 'FUNDED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * All possible states for an individual milestone.
 */
export type MilestoneStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REVISION';

/**
 * Supported stablecoin token addresses (USDC and USDT on Sepolia testnet).
 * Only these two tokens are accepted — no native tokens, no other ERC-20s.
 */
export type SupportedToken = 'USDC' | 'USDT';

// ─── Domain Types ─────────────────────────────────────────────────────────────

/**
 * Core user identity as returned by the API.
 */
export interface User {
  id: string;
  walletAddress: string;
  telegramUserId: string | null;
  createdAt: string; // ISO 8601
}

/**
 * A deal as returned by the API.
 * clientAddress and freelancerAddress are the wallet addresses corresponding to
 * clientId and freelancerId (internal UUIDs). Use these for display and role detection.
 */
export interface Deal {
  id: string;
  clientId: string;
  freelancerId: string;
  /** Ethereum wallet address of the client (lowercase). Use for display and role detection. */
  clientAddress: string;
  /** Ethereum wallet address of the freelancer (lowercase). Use for display and role detection. */
  freelancerAddress: string;
  tokenAddress: string;
  totalAmount: string; // BigInt as string to avoid precision loss
  status: DealStatus;
  chainDealId: string | null;
  createdAt: string; // ISO 8601
  agreedAt: string | null; // ISO 8601 — set when freelancer calls /agree
  milestones: Milestone[];
}

/**
 * A milestone within a deal.
 */
export interface Milestone {
  id: string;
  dealId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: string; // BigInt as string
  sequence: number;
  status: MilestoneStatus;
}

/**
 * A submission for a milestone.
 */
export interface Submission {
  id: string;
  milestoneId: string;
  submittedBy: string;
  summary: string;
  links: string[]; // jsonb array of URLs
  aiSummary: string | null;
  createdAt: string;
}

/**
 * An event in the deal audit trail.
 */
export interface DealEvent {
  id: string;
  dealId: string;
  actorId: string;
  eventType: DealEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * All possible event types recorded in deal_events.
 */
export type DealEventType =
  | 'DEAL_CREATED'
  | 'DEAL_AGREED'
  | 'DEAL_FUNDED'
  | 'DEAL_CANCELLED'
  | 'DEAL_COMPLETED'
  | 'MILESTONE_SUBMITTED'
  | 'MILESTONE_APPROVED'
  | 'MILESTONE_REJECTED'
  | 'MILESTONE_REVISION'
  /** Internal event used to drive bot message notifications. Filtered out of timeline responses. */
  | 'MESSAGE_RECEIVED';

/**
 * A deal chat message sent between client and freelancer via the Telegram bot.
 * Messages are permanent — no soft delete. Telegram IDs are never stored here.
 * The bot proxies messages between parties without revealing Telegram identities.
 */
export interface Message {
  id: string;
  dealId: string;
  /** UUID of the user who sent the message (maps to clientId or freelancerId on the deal). */
  senderId: string;
  content: string;
  createdAt: string; // ISO 8601
}

/**
 * Rejection notes for a milestone submission.
 */
export interface RejectionNote {
  id: string;
  submissionId: string;
  reasonCodes: string[];
  freeText: string;
  aiRevisionNotes: string | null;
  createdAt: string;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

/**
 * Standard API error response body for invalid state transitions.
 */
export interface InvalidTransitionError {
  error: 'INVALID_TRANSITION';
  from: DealStatus;
  to: DealStatus;
}

/**
 * Standard API error response body for general errors.
 */
export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Health check response.
 */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// ─── Chain / Contract Types ───────────────────────────────────────────────────

/**
 * Supported EVM chain IDs. Sepolia = 11155111 (testnet).
 */
export type SupportedChainId = 11155111; // Sepolia only for MVP

/**
 * On-chain contract event names emitted by OpenEscrow.sol.
 * These map directly to Solidity event names for the indexer.
 */
export type ContractEventName =
  | 'DealCreated'
  | 'DealAgreed'
  | 'DealFunded'
  | 'MilestoneSubmitted'
  | 'MilestoneApproved'
  | 'MilestoneRejected'
  | 'FundsReleased'
  | 'DealCancelled';

// ─── On-Chain Deal / Milestone State Enums ───────────────────────────────────
// These numeric values MUST match the Solidity enum order in OpenEscrow.sol.

/**
 * On-chain DealState enum values from OpenEscrow.sol.
 * Numeric values correspond to the Solidity enum ordering.
 */
export const OnChainDealState = {
  DRAFT: 0,
  AGREED: 1,
  FUNDED: 2,
  COMPLETED: 3,
  CANCELLED: 4,
} as const;
export type OnChainDealState = (typeof OnChainDealState)[keyof typeof OnChainDealState];

/**
 * On-chain MilestoneState enum values from OpenEscrow.sol.
 * Numeric values correspond to the Solidity enum ordering.
 */
export const OnChainMilestoneState = {
  PENDING: 0,
  SUBMITTED: 1,
  APPROVED: 2,
  REJECTED: 3,
} as const;
export type OnChainMilestoneState =
  (typeof OnChainMilestoneState)[keyof typeof OnChainMilestoneState];

// ─── Contract Event Argument Types ───────────────────────────────────────────
// Used by the chain indexer (apps/api/src/chain/) to type-safely parse events.

/**
 * Arguments for the DealCreated on-chain event.
 */
export interface DealCreatedEventArgs {
  dealId: bigint;
  client: string;
  freelancer: string;
  token: string;
  totalAmount: bigint;
  milestoneCount: bigint;
}

/**
 * Arguments for the DealAgreed on-chain event.
 */
export interface DealAgreedEventArgs {
  dealId: bigint;
  freelancer: string;
}

/**
 * Arguments for the DealFunded on-chain event.
 */
export interface DealFundedEventArgs {
  dealId: bigint;
  client: string;
  token: string;
  amount: bigint;
}

/**
 * Arguments for the MilestoneSubmitted on-chain event.
 */
export interface MilestoneSubmittedEventArgs {
  dealId: bigint;
  milestoneIndex: bigint;
  freelancer: string;
}

/**
 * Arguments for the MilestoneApproved on-chain event.
 */
export interface MilestoneApprovedEventArgs {
  dealId: bigint;
  milestoneIndex: bigint;
  client: string;
}

/**
 * Arguments for the MilestoneRejected on-chain event.
 */
export interface MilestoneRejectedEventArgs {
  dealId: bigint;
  milestoneIndex: bigint;
  client: string;
}

/**
 * Arguments for the FundsReleased on-chain event.
 */
export interface FundsReleasedEventArgs {
  dealId: bigint;
  milestoneIndex: bigint;
  freelancer: string;
  token: string;
  amount: bigint;
}

/**
 * Arguments for the DealCancelled on-chain event.
 */
export interface DealCancelledEventArgs {
  dealId: bigint;
  cancelledBy: string;
  refundAmount: bigint;
}

/**
 * Union type of all parseable contract event argument shapes.
 * Used by the indexer's event dispatch logic.
 */
export type ContractEventArgs =
  | DealCreatedEventArgs
  | DealAgreedEventArgs
  | DealFundedEventArgs
  | MilestoneSubmittedEventArgs
  | MilestoneApprovedEventArgs
  | MilestoneRejectedEventArgs
  | FundsReleasedEventArgs
  | DealCancelledEventArgs;

/**
 * A fully-typed parsed contract event ready for the indexer to process.
 */
export interface ParsedContractEvent<T extends ContractEventArgs = ContractEventArgs> {
  /** Block number this event was emitted in. */
  blockNumber: number;
  /** Transaction hash. */
  transactionHash: string;
  /** Log index within the transaction. */
  logIndex: number;
  /** Contract event name (matches ContractEventName). */
  eventName: ContractEventName;
  /** Typed event arguments. */
  args: T;
}

/**
 * On-chain deal view data as returned by OpenEscrow.getDeal().
 * Mirrors the tuple return type of the getDeal view function.
 */
export interface OnChainDeal {
  client: string;
  freelancer: string;
  token: string;
  totalAmount: bigint;
  state: OnChainDealState;
  releasedAmount: bigint;
  milestoneCount: bigint;
}

/**
 * On-chain milestone data as returned by OpenEscrow.getMilestone().
 */
export interface OnChainMilestone {
  amount: bigint;
  state: OnChainMilestoneState;
  released: boolean;
}
