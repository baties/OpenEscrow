/**
 * use-deal.ts — OpenEscrow Web Dashboard
 *
 * Custom hook for fetching a single deal by ID, including its milestones.
 * Handles: fetch on mount (when dealId is provided), loading state, error state, refresh.
 * Does NOT: mutate deal state (see use-deal-actions.ts),
 *            fetch the timeline (see use-deal-timeline.ts),
 *            manage auth state.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Deal } from '@open-escrow/shared';
import { dealsApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * Return type of the useDeal hook.
 */
export interface UseDealResult {
  /** The deal object, null while loading or if fetch failed */
  deal: Deal | null;
  /** True while the initial fetch or a refresh is in progress */
  isLoading: boolean;
  /** Error message if the last fetch failed, null otherwise */
  error: string | null;
  /** Triggers a fresh fetch of the deal from the API */
  refresh: () => void;
}

/**
 * Fetches a single deal by ID.
 * Automatically fetches when dealId changes. Call refresh() to reload.
 *
 * @param dealId - The UUID of the deal to fetch, or null/undefined to skip
 * @returns UseDealResult with deal, loading state, error, and refresh function
 */
export function useDeal(dealId: string | null | undefined): UseDealResult {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeal = useCallback(async () => {
    if (!dealId) {
      setDeal(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await dealsApi.get(dealId);
      setDeal(data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('[useDeal] Failed to fetch deal:', { dealId, error: message });
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void fetchDeal();
  }, [fetchDeal]);

  return {
    deal,
    isLoading,
    error,
    refresh: () => { void fetchDeal(); },
  };
}
