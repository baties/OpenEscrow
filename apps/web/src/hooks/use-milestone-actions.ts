/**
 * use-milestone-actions.ts — OpenEscrow Web Dashboard
 *
 * Custom hook providing mutation functions for milestone state transitions.
 * Handles: submit, approve, reject — each with its own loading/error state.
 * Does NOT: fetch milestone data (part of deal via use-deal.ts),
 *            manage auth state, or perform on-chain interactions directly.
 *
 * All actions delegate to api-client.ts — no raw fetch calls here.
 */

'use client';

import { useState, useCallback } from 'react';
import {
  milestonesApi,
  type SubmitMilestoneInput,
  type RejectMilestoneInput,
} from '@/lib/api-client';
import type { Milestone, RejectionNote, Submission } from '@open-escrow/shared';
import { getErrorMessage } from '@/lib/errors';

/**
 * State for a single async action (loading + error).
 */
interface ActionState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Return type of the useMilestoneActions hook.
 */
export interface UseMilestoneActionsResult {
  /** State for the submit action */
  submitState: ActionState;
  /** State for the approve action */
  approveState: ActionState;
  /** State for the reject action */
  rejectState: ActionState;

  /**
   * Submits a milestone for client review.
   *
   * @param milestoneId - The milestone UUID
   * @param input - Submission summary and delivery links
   * @returns Object with updated milestone and submission, or null on error
   */
  submitMilestone: (
    milestoneId: string,
    input: SubmitMilestoneInput
  ) => Promise<{ milestone: Milestone; submission: Submission } | null>;

  /**
   * Approves a submitted milestone and triggers on-chain fund release.
   *
   * @param milestoneId - The milestone UUID
   * @returns Updated milestone in APPROVED status, or null on error
   */
  approveMilestone: (milestoneId: string) => Promise<Milestone | null>;

  /**
   * Rejects a submitted milestone with structured reasons.
   *
   * @param milestoneId - The milestone UUID
   * @param input - Rejection reason codes and free-text feedback
   * @returns Object with updated milestone and rejection note, or null on error
   */
  rejectMilestone: (
    milestoneId: string,
    input: RejectMilestoneInput
  ) => Promise<{ milestone: Milestone; rejectionNote: RejectionNote } | null>;
}

/**
 * Provides all milestone-level mutation actions with per-action loading/error state.
 *
 * @returns UseMilestoneActionsResult with action functions and their state
 */
export function useMilestoneActions(): UseMilestoneActionsResult {
  const [submitState, setSubmitState] = useState<ActionState>({ isLoading: false, error: null });
  const [approveState, setApproveState] = useState<ActionState>({ isLoading: false, error: null });
  const [rejectState, setRejectState] = useState<ActionState>({ isLoading: false, error: null });

  const submitMilestone = useCallback(
    async (
      milestoneId: string,
      input: SubmitMilestoneInput
    ): Promise<{ milestone: Milestone; submission: Submission } | null> => {
      setSubmitState({ isLoading: true, error: null });
      try {
        const result = await milestonesApi.submit(milestoneId, input);
        setSubmitState({ isLoading: false, error: null });
        return result;
      } catch (err) {
        const message = getErrorMessage(err);
        console.error('[useMilestoneActions] submitMilestone failed:', {
          milestoneId,
          error: message,
        });
        setSubmitState({ isLoading: false, error: message });
        return null;
      }
    },
    []
  );

  const approveMilestone = useCallback(async (milestoneId: string): Promise<Milestone | null> => {
    setApproveState({ isLoading: true, error: null });
    try {
      const { milestone } = await milestonesApi.approve(milestoneId);
      setApproveState({ isLoading: false, error: null });
      return milestone;
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[useMilestoneActions] approveMilestone failed:', {
        milestoneId,
        error: message,
      });
      setApproveState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  const rejectMilestone = useCallback(
    async (
      milestoneId: string,
      input: RejectMilestoneInput
    ): Promise<{ milestone: Milestone; rejectionNote: RejectionNote } | null> => {
      setRejectState({ isLoading: true, error: null });
      try {
        const result = await milestonesApi.reject(milestoneId, input);
        setRejectState({ isLoading: false, error: null });
        return result;
      } catch (err) {
        const message = getErrorMessage(err);
        console.error('[useMilestoneActions] rejectMilestone failed:', {
          milestoneId,
          error: message,
        });
        setRejectState({ isLoading: false, error: message });
        return null;
      }
    },
    []
  );

  return {
    submitState,
    approveState,
    rejectState,
    submitMilestone,
    approveMilestone,
    rejectMilestone,
  };
}
