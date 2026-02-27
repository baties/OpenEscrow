/**
 * modules/deals/deals.service.ts — OpenEscrow API
 *
 * Handles: Business logic for the full deal lifecycle.
 *          create, list, get, agree (DRAFT→AGREED), fund (AGREED→FUNDED),
 *          cancel (any eligible state → CANCELLED), and timeline retrieval.
 * Does NOT: interact with the blockchain directly (see chain/indexer.ts),
 *            send Telegram notifications, handle HTTP request/response,
 *            or enforce role-based access (enforced in middleware and router).
 *
 * State machine: DRAFT → AGREED → FUNDED → ... → COMPLETED | CANCELLED
 * All invalid transitions return AppError with code INVALID_TRANSITION.
 */

import { eq, or, desc } from 'drizzle-orm';
import { db } from '../../database/index.js';
import {
  deals,
  milestones,
  dealEvents,
  users,
  type Deal,
  type Milestone,
  type DealEvent,
} from '../../database/schema.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { CreateDealInput, FundDealInput } from './deals.schema.js';

const log = logger.child({ module: 'deals.service' });

// ─── Valid state transitions ───────────────────────────────────────────────────

/**
 * Maps each deal status to the set of statuses it may transition TO via the API.
 * On-chain transitions (AGREED→FUNDED) are handled by the chain indexer, not this map.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['AGREED', 'CANCELLED'],
  AGREED: ['FUNDED', 'CANCELLED'],
  FUNDED: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED'],
  REJECTED: ['REVISION'],
  REVISION: ['SUBMITTED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Checks if a transition from `from` to `to` is valid per the state machine.
 * Throws AppError with INVALID_TRANSITION if not allowed.
 *
 * @param from - Current deal status
 * @param to - Desired target status
 * @throws {AppError} INVALID_TRANSITION if the transition is not permitted
 */
function assertValidTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot transition from ${from} to ${to}`, {
      from,
      to,
    });
  }
}

// ─── Service functions ─────────────────────────────────────────────────────────

/**
 * Creates a new deal in DRAFT status with the provided milestones.
 * The total amount is computed as the sum of all milestone amounts.
 * A DEAL_CREATED event is appended to deal_events.
 *
 * @param clientId - UUID of the client creating the deal
 * @param input - Validated deal creation payload (freelancerAddress, tokenAddress, milestones)
 * @returns The newly created deal with its milestones
 * @throws {AppError} USER_NOT_FOUND if the freelancer wallet address does not exist
 * @throws {AppError} DEAL_CREATE_FAILED on database error
 */
export async function createDeal(
  clientId: string,
  input: CreateDealInput,
): Promise<Deal & { milestones: Milestone[] }> {
  log.info({
    module: 'deals.service',
    operation: 'createDeal',
    clientId,
    freelancerAddress: input.freelancerAddress,
  }, 'Creating deal');

  // Resolve freelancer user record (must exist — they sign in first).
  const freelancerAddress = input.freelancerAddress.toLowerCase();
  let freelancerId: string;

  try {
    const [freelancer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.walletAddress, freelancerAddress))
      .limit(1);

    if (!freelancer) {
      // Upsert freelancer: create a user record if first time seeing this address.
      const upsertResult = await db
        .insert(users)
        .values({ walletAddress: freelancerAddress })
        .onConflictDoUpdate({
          target: users.walletAddress,
          set: { walletAddress: freelancerAddress },
        })
        .returning({ id: users.id });
      const newUser = upsertResult[0];
      if (!newUser) {
        throw new Error('Freelancer upsert returned no rows');
      }
      freelancerId = newUser.id;
    } else {
      freelancerId = freelancer.id;
    }
  } catch (err) {
    log.error({
      module: 'deals.service',
      operation: 'createDeal',
      clientId,
      freelancerAddress,
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to resolve freelancer user');
    throw new AppError('DEAL_CREATE_FAILED', 'Failed to resolve freelancer user account');
  }

  // Compute total amount as sum of all milestone amounts (BigInt arithmetic).
  const totalAmount = input.milestones
    .reduce((sum, m) => sum + BigInt(m.amount), 0n)
    .toString();

  try {
    // Insert deal and milestones in a transaction.
    const result = await db.transaction(async (tx) => {
      const dealInsertResult = await tx
        .insert(deals)
        .values({
          clientId,
          freelancerId,
          tokenAddress: input.tokenAddress.toLowerCase(),
          totalAmount,
          status: 'DRAFT',
        })
        .returning();

      const deal = dealInsertResult[0];
      if (!deal) {
        throw new Error('Deal insert returned no rows');
      }

      const milestoneRows = await tx
        .insert(milestones)
        .values(
          input.milestones.map((m, i) => ({
            dealId: deal.id,
            title: m.title,
            description: m.description,
            acceptanceCriteria: m.acceptanceCriteria,
            amount: m.amount,
            sequence: i + 1,
            status: 'PENDING',
          })),
        )
        .returning();

      // Append DEAL_CREATED audit event.
      await tx.insert(dealEvents).values({
        dealId: deal.id,
        actorId: clientId,
        eventType: 'DEAL_CREATED',
        metadata: {
          totalAmount,
          milestoneCount: milestoneRows.length,
          tokenAddress: input.tokenAddress.toLowerCase(),
          freelancerId,
        },
      });

      return { deal, milestones: milestoneRows };
    });

    log.info({
      module: 'deals.service',
      operation: 'createDeal',
      dealId: result.deal.id,
      clientId,
      freelancerId,
    }, 'Deal created successfully');

    return { ...result.deal, milestones: result.milestones };
  } catch (err) {
    log.error({
      module: 'deals.service',
      operation: 'createDeal',
      clientId,
      freelancerId,
      error: err instanceof Error ? err.message : String(err),
    }, 'Deal creation transaction failed');
    throw new AppError('DEAL_CREATE_FAILED', 'Failed to create deal');
  }
}

/**
 * Lists all deals where the user is either client or freelancer.
 * Returns deals ordered by createdAt descending (newest first).
 *
 * @param userId - UUID of the authenticated user
 * @returns Array of deals (without milestones — use getDeal for detail)
 * @throws {AppError} DEAL_LIST_FAILED on database error
 */
export async function listDeals(userId: string): Promise<Deal[]> {
  try {
    const result = await db
      .select()
      .from(deals)
      .where(or(eq(deals.clientId, userId), eq(deals.freelancerId, userId)))
      .orderBy(desc(deals.createdAt));

    return result;
  } catch (err) {
    log.error({
      module: 'deals.service',
      operation: 'listDeals',
      userId,
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to list deals');
    throw new AppError('DEAL_LIST_FAILED', 'Failed to retrieve deals');
  }
}

/**
 * Retrieves a single deal by ID including its milestones.
 * Returns null if not found — callers should check for null.
 *
 * @param dealId - UUID of the deal
 * @returns Deal with milestones array, or null if not found
 * @throws {AppError} DEAL_GET_FAILED on database error
 */
export async function getDeal(dealId: string): Promise<(Deal & { milestones: Milestone[] }) | null> {
  try {
    const [deal] = await db
      .select()
      .from(deals)
      .where(eq(deals.id, dealId))
      .limit(1);

    if (!deal) return null;

    const milestoneRows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.dealId, dealId))
      .orderBy(milestones.sequence);

    return { ...deal, milestones: milestoneRows };
  } catch (err) {
    log.error({
      module: 'deals.service',
      operation: 'getDeal',
      dealId,
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to get deal');
    throw new AppError('DEAL_GET_FAILED', 'Failed to retrieve deal');
  }
}

/**
 * Transitions a deal from DRAFT to AGREED when the freelancer confirms.
 * Sets agreed_at on the deal record. Appends DEAL_AGREED event to audit trail.
 *
 * @param dealId - UUID of the deal
 * @param freelancerId - UUID of the freelancer confirming the deal
 * @returns Updated deal with milestones
 * @throws {AppError} DEAL_NOT_FOUND if deal does not exist
 * @throws {AppError} INVALID_TRANSITION if deal is not in DRAFT status
 * @throws {AppError} DEAL_AGREE_FAILED on database error
 */
export async function agreeToDeal(
  dealId: string,
  freelancerId: string,
): Promise<Deal & { milestones: Milestone[] }> {
  log.info({
    module: 'deals.service',
    operation: 'agreeToDeal',
    dealId,
    freelancerId,
  }, 'Freelancer agreeing to deal');

  const deal = await getDeal(dealId);
  if (!deal) {
    throw new AppError('DEAL_NOT_FOUND', `Deal ${dealId} not found`, { dealId });
  }

  assertValidTransition(deal.status, 'AGREED');

  try {
    const agreedAt = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(deals)
        .set({ status: 'AGREED', agreedAt })
        .where(eq(deals.id, dealId));

      await tx.insert(dealEvents).values({
        dealId,
        actorId: freelancerId,
        eventType: 'DEAL_AGREED',
        metadata: { previousStatus: deal.status, agreedAt: agreedAt.toISOString() },
      });
    });

    log.info({
      module: 'deals.service',
      operation: 'agreeToDeal',
      dealId,
      freelancerId,
    }, 'Deal agreed successfully');

    const updated = await getDeal(dealId);
    return updated!;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'deals.service',
      operation: 'agreeToDeal',
      dealId,
      freelancerId,
      error: err instanceof Error ? err.message : String(err),
    }, 'agreeToDeal transaction failed');
    throw new AppError('DEAL_AGREE_FAILED', 'Failed to agree to deal');
  }
}

/**
 * Records funding confirmation after the client deposits on-chain.
 * Transitions deal from AGREED to FUNDED.
 * Stores the chain_deal_id for future indexer correlation.
 * Appends DEAL_FUNDED event to audit trail.
 *
 * NOTE: The canonical FUNDED transition is also triggered by the chain indexer
 * when it detects DealFunded events. This endpoint allows the frontend to
 * optimistically update state without waiting for the next poll cycle.
 * The indexer will skip deals already in FUNDED state.
 *
 * @param dealId - UUID of the deal
 * @param clientId - UUID of the client recording the funding
 * @param input - Contains transactionHash and chainDealId
 * @returns Updated deal with milestones
 * @throws {AppError} DEAL_NOT_FOUND if deal does not exist
 * @throws {AppError} INVALID_TRANSITION if deal is not in AGREED status
 * @throws {AppError} DEAL_FUND_FAILED on database error
 */
export async function fundDeal(
  dealId: string,
  clientId: string,
  input: FundDealInput,
): Promise<Deal & { milestones: Milestone[] }> {
  log.info({
    module: 'deals.service',
    operation: 'fundDeal',
    dealId,
    clientId,
    chainDealId: input.chainDealId,
  }, 'Recording deal funding');

  const deal = await getDeal(dealId);
  if (!deal) {
    throw new AppError('DEAL_NOT_FOUND', `Deal ${dealId} not found`, { dealId });
  }

  assertValidTransition(deal.status, 'FUNDED');

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(deals)
        .set({ status: 'FUNDED', chainDealId: input.chainDealId })
        .where(eq(deals.id, dealId));

      await tx.insert(dealEvents).values({
        dealId,
        actorId: clientId,
        eventType: 'DEAL_FUNDED',
        metadata: {
          transactionHash: input.transactionHash,
          chainDealId: input.chainDealId,
          previousStatus: deal.status,
        },
      });
    });

    log.info({
      module: 'deals.service',
      operation: 'fundDeal',
      dealId,
      clientId,
      chainDealId: input.chainDealId,
    }, 'Deal funded successfully');

    const updated = await getDeal(dealId);
    return updated!;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'deals.service',
      operation: 'fundDeal',
      dealId,
      clientId,
      error: err instanceof Error ? err.message : String(err),
    }, 'fundDeal transaction failed');
    throw new AppError('DEAL_FUND_FAILED', 'Failed to record deal funding');
  }
}

/**
 * Cancels a deal, applying the correct refund rules from CLAUDE.md Section C:
 * - DRAFT/AGREED cancel → no refund needed (funds not yet deposited on-chain)
 * - FUNDED cancel → all unreleased milestone amounts are refundable (noted in event metadata)
 * - Released milestones are irreversible — only unreleased amounts are noted as refundable
 *
 * Appends DEAL_CANCELLED event with refund details for the chain indexer to process.
 *
 * @param dealId - UUID of the deal
 * @param actorId - UUID of the user cancelling (either client or freelancer)
 * @returns Updated deal with milestones
 * @throws {AppError} DEAL_NOT_FOUND if deal does not exist
 * @throws {AppError} INVALID_TRANSITION if deal is in COMPLETED or already CANCELLED state
 * @throws {AppError} DEAL_CANCEL_FAILED on database error
 */
export async function cancelDeal(
  dealId: string,
  actorId: string,
): Promise<Deal & { milestones: Milestone[] }> {
  log.info({
    module: 'deals.service',
    operation: 'cancelDeal',
    dealId,
    actorId,
  }, 'Cancelling deal');

  const deal = await getDeal(dealId);
  if (!deal) {
    throw new AppError('DEAL_NOT_FOUND', `Deal ${dealId} not found`, { dealId });
  }

  assertValidTransition(deal.status, 'CANCELLED');

  // Compute refund metadata per Section C cancel refund rules.
  let refundRequired = false;
  let refundableAmount = '0';
  let refundNote = '';

  if (deal.status === 'DRAFT' || deal.status === 'AGREED') {
    // Funds not yet on-chain — no refund action required.
    refundRequired = false;
    refundNote = 'No funds on-chain at time of cancel; no refund required.';
  } else if (deal.status === 'FUNDED') {
    // Compute unreleased amount: sum of PENDING and SUBMITTED milestones.
    const unreleasedStatuses = ['PENDING', 'SUBMITTED', 'REJECTED', 'REVISION'];
    const unreleasedMilestones = deal.milestones.filter((m) =>
      unreleasedStatuses.includes(m.status),
    );
    refundableAmount = unreleasedMilestones
      .reduce((sum, m) => sum + BigInt(m.amount), 0n)
      .toString();
    refundRequired = BigInt(refundableAmount) > 0n;
    refundNote = `FUNDED cancel: ${refundableAmount} tokens refundable to client. On-chain cancelDeal must be called to execute refund.`;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(deals)
        .set({ status: 'CANCELLED' })
        .where(eq(deals.id, dealId));

      await tx.insert(dealEvents).values({
        dealId,
        actorId,
        eventType: 'DEAL_CANCELLED',
        metadata: {
          previousStatus: deal.status,
          refundRequired,
          refundableAmount,
          refundNote,
        },
      });
    });

    log.info({
      module: 'deals.service',
      operation: 'cancelDeal',
      dealId,
      actorId,
      previousStatus: deal.status,
      refundRequired,
      refundableAmount,
    }, 'Deal cancelled successfully');

    const updated = await getDeal(dealId);
    return updated!;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'deals.service',
      operation: 'cancelDeal',
      dealId,
      actorId,
      error: err instanceof Error ? err.message : String(err),
    }, 'cancelDeal transaction failed');
    throw new AppError('DEAL_CANCEL_FAILED', 'Failed to cancel deal');
  }
}

/**
 * Returns the full audit trail (deal_events) for a deal, ordered chronologically.
 *
 * @param dealId - UUID of the deal
 * @returns Array of DealEvent records ordered by createdAt ascending
 * @throws {AppError} DEAL_NOT_FOUND if the deal does not exist
 * @throws {AppError} DEAL_TIMELINE_FAILED on database error
 */
export async function getDealTimeline(dealId: string): Promise<DealEvent[]> {
  try {
    const [deal] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.id, dealId))
      .limit(1);

    if (!deal) {
      throw new AppError('DEAL_NOT_FOUND', `Deal ${dealId} not found`, { dealId });
    }

    const events = await db
      .select()
      .from(dealEvents)
      .where(eq(dealEvents.dealId, dealId))
      .orderBy(dealEvents.createdAt);

    return events;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'deals.service',
      operation: 'getDealTimeline',
      dealId,
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to retrieve deal timeline');
    throw new AppError('DEAL_TIMELINE_FAILED', 'Failed to retrieve deal timeline');
  }
}
