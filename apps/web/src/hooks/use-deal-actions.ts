/**
 * use-deal-actions.ts — OpenEscrow Web Dashboard
 *
 * Custom hook providing mutation functions for deal state transitions.
 * Handles: agree, cancel, fund deal — each returns loading state and error.
 * Does NOT: fetch deal data (see use-deal.ts), manage auth state,
 *            perform on-chain interactions directly (fund only records the tx hash).
 *
 * All actions delegate to api-client.ts — no raw fetch calls here.
 */

'use client';

import { useState, useCallback } from 'react';
import { dealsApi, type CreateDealInput } from '@/lib/api-client';
import type { Deal } from '@open-escrow/shared';
import { getErrorMessage } from '@/lib/errors';

/**
 * State for a single async action (loading + error).
 */
interface ActionState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Return type of the useDealActions hook.
 */
export interface UseDealActionsResult {
  /** State for the createDeal action */
  createState: ActionState;
  /** State for the agree action */
  agreeState: ActionState;
  /** State for the fund action */
  fundState: ActionState;
  /** State for the cancel action */
  cancelState: ActionState;

  /**
   * Creates a new deal with the given input.
   *
   * @param input - Deal creation payload
   * @returns The created deal, or null on error
   */
  createDeal: (input: CreateDealInput) => Promise<Deal | null>;

  /**
   * Freelancer agrees to the deal, triggering DRAFT → AGREED.
   *
   * @param dealId - The deal UUID
   * @returns Updated deal, or null on error
   */
  agreeDeal: (dealId: string) => Promise<Deal | null>;

  /**
   * Records that the client has funded the deal on-chain.
   *
   * @param dealId - The deal UUID
   * @param txHash - The transaction hash of the on-chain deposit
   * @returns Updated deal, or null on error
   */
  fundDeal: (dealId: string, txHash: string) => Promise<Deal | null>;

  /**
   * Cancels the deal. Refund rules are applied server-side.
   *
   * @param dealId - The deal UUID
   * @returns Updated deal in CANCELLED state, or null on error
   */
  cancelDeal: (dealId: string) => Promise<Deal | null>;
}

/**
 * Provides all deal-level mutation actions with per-action loading/error state.
 *
 * @returns UseDealActionsResult with action functions and their state
 */
export function useDealActions(): UseDealActionsResult {
  const [createState, setCreateState] = useState<ActionState>({ isLoading: false, error: null });
  const [agreeState, setAgreeState] = useState<ActionState>({ isLoading: false, error: null });
  const [fundState, setFundState] = useState<ActionState>({ isLoading: false, error: null });
  const [cancelState, setCancelState] = useState<ActionState>({ isLoading: false, error: null });

  const createDeal = useCallback(async (input: CreateDealInput): Promise<Deal | null> => {
    setCreateState({ isLoading: true, error: null });
    try {
      const deal = await dealsApi.create(input);
      setCreateState({ isLoading: false, error: null });
      return deal;
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[useDealActions] createDeal failed:', { error: message });
      setCreateState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  const agreeDeal = useCallback(async (dealId: string): Promise<Deal | null> => {
    setAgreeState({ isLoading: true, error: null });
    try {
      // API returns the updated Deal directly (not wrapped in { deal: ... })
      const deal = await dealsApi.agree(dealId);
      setAgreeState({ isLoading: false, error: null });
      return deal;
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[useDealActions] agreeDeal failed:', { dealId, error: message });
      setAgreeState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  const fundDeal = useCallback(async (dealId: string, txHash: string): Promise<Deal | null> => {
    setFundState({ isLoading: true, error: null });
    try {
      // API returns the updated Deal directly
      const deal = await dealsApi.fund(dealId, txHash);
      setFundState({ isLoading: false, error: null });
      return deal;
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[useDealActions] fundDeal failed:', { dealId, error: message });
      setFundState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  const cancelDeal = useCallback(async (dealId: string): Promise<Deal | null> => {
    setCancelState({ isLoading: true, error: null });
    try {
      // API returns the updated Deal directly
      const deal = await dealsApi.cancel(dealId);
      setCancelState({ isLoading: false, error: null });
      return deal;
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[useDealActions] cancelDeal failed:', { dealId, error: message });
      setCancelState({ isLoading: false, error: message });
      return null;
    }
  }, []);

  return {
    createState,
    agreeState,
    fundState,
    cancelState,
    createDeal,
    agreeDeal,
    fundDeal,
    cancelDeal,
  };
}
