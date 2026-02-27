/**
 * modules/milestones/milestones.service.ts — OpenEscrow API
 *
 * Handles: Business logic for milestone state transitions:
 *          submit (PENDING/REVISION → SUBMITTED),
 *          approve (SUBMITTED → APPROVED, with deal completion check),
 *          reject (SUBMITTED → REJECTED, auto-sets REVISION).
 * Does NOT: interact with the blockchain directly (see chain/indexer.ts),
 *            send notifications, handle HTTP request/response,
 *            or enforce role-based access (enforced in middleware and router).
 *
 * Architecture decision (DEC-005): The approve endpoint updates DB state only.
 * The on-chain approveMilestone call is handled by the web frontend via wagmi,
 * as it requires the client's connected wallet for signing. The chain indexer
 * then confirms the FundsReleased event. See DECISIONS.md for rationale.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../database/index.js';
import {
  milestones,
  deals,
  submissions,
  dealEvents,
  rejectionNotes,
  type Milestone,
  type Deal,
  type Submission,
  type RejectionNote,
} from '../../database/schema.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { SubmitMilestoneInput, RejectMilestoneInput } from './milestones.schema.js';

const log = logger.child({ module: 'milestones.service' });

// ─── Valid milestone state transitions ────────────────────────────────────────

const VALID_MILESTONE_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: ['REVISION'],
  REVISION: ['SUBMITTED'],
};

/**
 * Asserts that a milestone state transition is valid.
 *
 * @param from - Current milestone status
 * @param to - Desired target status
 * @throws {AppError} INVALID_TRANSITION if not permitted
 */
function assertValidMilestoneTransition(from: string, to: string): void {
  const allowed = VALID_MILESTONE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot transition milestone from ${from} to ${to}`, {
      from,
      to,
    });
  }
}

// ─── Service functions ─────────────────────────────────────────────────────────

/**
 * Retrieves a milestone by ID along with its parent deal.
 *
 * @param milestoneId - UUID of the milestone
 * @returns Object with milestone and deal, or null if not found
 * @throws {AppError} MILESTONE_NOT_FOUND if milestone does not exist
 */
async function getMilestoneWithDeal(
  milestoneId: string,
): Promise<{ milestone: Milestone; deal: Deal }> {
  const [milestone] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);

  if (!milestone) {
    throw new AppError('MILESTONE_NOT_FOUND', `Milestone ${milestoneId} not found`, {
      milestoneId,
    });
  }

  const [deal] = await db
    .select()
    .from(deals)
    .where(eq(deals.id, milestone.dealId))
    .limit(1);

  if (!deal) {
    // Should never happen due to FK constraint, but guard defensively.
    throw new AppError('DEAL_NOT_FOUND', `Parent deal for milestone ${milestoneId} not found`, {
      milestoneId,
    });
  }

  return { milestone, deal };
}

/**
 * Checks whether all milestones for a deal are approved.
 * Used to auto-transition the deal to COMPLETED.
 *
 * @param dealId - UUID of the deal
 * @returns true if every milestone has status APPROVED
 */
async function areAllMilestonesApproved(dealId: string): Promise<boolean> {
  const allMilestones = await db
    .select({ status: milestones.status })
    .from(milestones)
    .where(eq(milestones.dealId, dealId));

  return allMilestones.every((m) => m.status === 'APPROVED');
}

/**
 * Submits a milestone deliverable. Transitions milestone from PENDING or REVISION to SUBMITTED.
 * Creates a submission record and appends MILESTONE_SUBMITTED to deal_events.
 *
 * @param milestoneId - UUID of the milestone to submit
 * @param freelancerId - UUID of the freelancer submitting
 * @param input - Validated submission payload (summary, links)
 * @returns The created submission record
 * @throws {AppError} MILESTONE_NOT_FOUND if milestone does not exist
 * @throws {AppError} INVALID_TRANSITION if milestone is not in PENDING or REVISION status
 * @throws {AppError} MILESTONE_SUBMIT_FAILED on database error
 */
export async function submitMilestone(
  milestoneId: string,
  freelancerId: string,
  input: SubmitMilestoneInput,
): Promise<Submission> {
  log.info({
    module: 'milestones.service',
    operation: 'submitMilestone',
    milestoneId,
    freelancerId,
  }, 'Submitting milestone');

  const { milestone, deal } = await getMilestoneWithDeal(milestoneId);

  // Milestone must be PENDING or REVISION to submit.
  if (milestone.status !== 'PENDING' && milestone.status !== 'REVISION') {
    assertValidMilestoneTransition(milestone.status, 'SUBMITTED');
  }

  // Deal must be FUNDED for milestone submission to be valid.
  if (deal.status !== 'FUNDED') {
    throw new AppError('INVALID_TRANSITION', 'Milestone can only be submitted when deal is FUNDED', {
      milestoneId,
      dealStatus: deal.status,
    });
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .update(milestones)
        .set({ status: 'SUBMITTED' })
        .where(eq(milestones.id, milestoneId));

      const submissionInsert = await tx
        .insert(submissions)
        .values({
          milestoneId,
          submittedBy: freelancerId,
          summary: input.summary,
          links: input.links,
        })
        .returning();

      const submission = submissionInsert[0];
      if (!submission) {
        throw new Error('Submission insert returned no rows');
      }

      await tx.insert(dealEvents).values({
        dealId: deal.id,
        actorId: freelancerId,
        eventType: 'MILESTONE_SUBMITTED',
        metadata: {
          milestoneId,
          milestoneSequence: milestone.sequence,
          submissionId: submission.id,
        },
      });

      return submission;
    });

    log.info({
      module: 'milestones.service',
      operation: 'submitMilestone',
      milestoneId,
      freelancerId,
      submissionId: result.id,
    }, 'Milestone submitted successfully');

    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'milestones.service',
      operation: 'submitMilestone',
      milestoneId,
      freelancerId,
      error: err instanceof Error ? err.message : String(err),
    }, 'submitMilestone transaction failed');
    throw new AppError('MILESTONE_SUBMIT_FAILED', 'Failed to submit milestone');
  }
}

/**
 * Approves a milestone submission. Transitions milestone from SUBMITTED to APPROVED.
 * If all milestones are now APPROVED, auto-transitions the deal to COMPLETED.
 *
 * Architecture note: This endpoint updates DB state only.
 * The on-chain approveMilestone call is the frontend's responsibility (wagmi + client wallet).
 * The chain indexer confirms FundsReleased events separately.
 * See DECISIONS.md DEC-005.
 *
 * @param milestoneId - UUID of the milestone to approve
 * @param clientId - UUID of the client approving
 * @returns Updated milestone record
 * @throws {AppError} MILESTONE_NOT_FOUND if milestone does not exist
 * @throws {AppError} MILESTONE_NO_SUBMISSION if no submission exists for this milestone
 * @throws {AppError} INVALID_TRANSITION if milestone is not in SUBMITTED status
 * @throws {AppError} MILESTONE_APPROVE_FAILED on database error
 */
export async function approveMilestone(
  milestoneId: string,
  clientId: string,
): Promise<Milestone> {
  log.info({
    module: 'milestones.service',
    operation: 'approveMilestone',
    milestoneId,
    clientId,
  }, 'Approving milestone');

  const { milestone, deal } = await getMilestoneWithDeal(milestoneId);
  assertValidMilestoneTransition(milestone.status, 'APPROVED');

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(milestones)
        .set({ status: 'APPROVED' })
        .where(eq(milestones.id, milestoneId));

      await tx.insert(dealEvents).values({
        dealId: deal.id,
        actorId: clientId,
        eventType: 'MILESTONE_APPROVED',
        metadata: {
          milestoneId,
          milestoneSequence: milestone.sequence,
        },
      });

      // Check if all milestones are now approved → auto-complete the deal.
      const allApproved = await areAllMilestonesApproved(deal.id);
      if (allApproved) {
        await tx
          .update(deals)
          .set({ status: 'COMPLETED' })
          .where(eq(deals.id, deal.id));

        await tx.insert(dealEvents).values({
          dealId: deal.id,
          actorId: clientId,
          eventType: 'DEAL_COMPLETED',
          metadata: {
            lastApprovedMilestoneId: milestoneId,
            autoCompleted: true,
          },
        });

        log.info({
          module: 'milestones.service',
          operation: 'approveMilestone',
          milestoneId,
          dealId: deal.id,
          clientId,
        }, 'All milestones approved — deal auto-completed');
      }
    });

    const updatedRows = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .limit(1);

    const updated = updatedRows[0];
    if (!updated) {
      throw new AppError('MILESTONE_NOT_FOUND', `Milestone ${milestoneId} not found after update`);
    }

    log.info({
      module: 'milestones.service',
      operation: 'approveMilestone',
      milestoneId,
      clientId,
    }, 'Milestone approved successfully');

    return updated;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'milestones.service',
      operation: 'approveMilestone',
      milestoneId,
      clientId,
      dealId: deal.id,
      error: err instanceof Error ? err.message : String(err),
    }, 'approveMilestone transaction failed');
    throw new AppError('MILESTONE_APPROVE_FAILED', 'Failed to approve milestone');
  }
}

/**
 * Rejects a milestone submission. Transitions milestone from SUBMITTED to REJECTED,
 * then auto-transitions to REVISION (per state machine: REJECTED → REVISION is automatic).
 * Creates a rejection_note record and appends MILESTONE_REJECTED + MILESTONE_REVISION events.
 *
 * @param milestoneId - UUID of the milestone to reject
 * @param clientId - UUID of the client rejecting
 * @param input - Validated rejection payload (reasonCodes, freeText)
 * @returns The created rejection note record
 * @throws {AppError} MILESTONE_NOT_FOUND if milestone does not exist
 * @throws {AppError} MILESTONE_NO_SUBMISSION if no submission exists for this milestone
 * @throws {AppError} INVALID_TRANSITION if milestone is not in SUBMITTED status
 * @throws {AppError} MILESTONE_REJECT_FAILED on database error
 */
export async function rejectMilestone(
  milestoneId: string,
  clientId: string,
  input: RejectMilestoneInput,
): Promise<RejectionNote> {
  log.info({
    module: 'milestones.service',
    operation: 'rejectMilestone',
    milestoneId,
    clientId,
  }, 'Rejecting milestone');

  const { milestone, deal } = await getMilestoneWithDeal(milestoneId);
  assertValidMilestoneTransition(milestone.status, 'REJECTED');

  // Find the most recent submission for this milestone.
  const [latestSubmission] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.milestoneId, milestoneId))
    .orderBy(submissions.createdAt)
    .limit(1);

  if (!latestSubmission) {
    throw new AppError('MILESTONE_NO_SUBMISSION', `No submission found for milestone ${milestoneId}`, {
      milestoneId,
    });
  }

  try {
    const rejectionNote = await db.transaction(async (tx) => {
      // Transition: SUBMITTED → REJECTED → REVISION (both in same tx).
      await tx
        .update(milestones)
        .set({ status: 'REVISION' })
        .where(eq(milestones.id, milestoneId));

      const noteInsertResult = await tx
        .insert(rejectionNotes)
        .values({
          submissionId: latestSubmission.id,
          reasonCodes: input.reasonCodes,
          freeText: input.freeText,
        })
        .returning();

      const note = noteInsertResult[0];
      if (!note) {
        throw new Error('Rejection note insert returned no rows');
      }

      await tx.insert(dealEvents).values([
        {
          dealId: deal.id,
          actorId: clientId,
          eventType: 'MILESTONE_REJECTED',
          metadata: {
            milestoneId,
            milestoneSequence: milestone.sequence,
            rejectionNoteId: note.id,
            reasonCodes: input.reasonCodes,
          },
        },
        {
          dealId: deal.id,
          actorId: clientId,
          eventType: 'MILESTONE_REVISION',
          metadata: {
            milestoneId,
            milestoneSequence: milestone.sequence,
            autoSet: true,
          },
        },
      ]);

      return note;
    });

    log.info({
      module: 'milestones.service',
      operation: 'rejectMilestone',
      milestoneId,
      clientId,
      rejectionNoteId: rejectionNote.id,
    }, 'Milestone rejected and set to REVISION');

    return rejectionNote;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error({
      module: 'milestones.service',
      operation: 'rejectMilestone',
      milestoneId,
      clientId,
      dealId: deal.id,
      error: err instanceof Error ? err.message : String(err),
    }, 'rejectMilestone transaction failed');
    throw new AppError('MILESTONE_REJECT_FAILED', 'Failed to reject milestone');
  }
}
