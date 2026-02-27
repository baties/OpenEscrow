/**
 * use-deals.ts — OpenEscrow Web Dashboard
 *
 * Custom hook for fetching and managing the current user's deal list.
 * Handles: fetching deals on mount, loading and error state, manual refresh.
 * Does NOT: create or mutate deals (see use-deal-actions.ts),
 *            fetch a single deal (see use-deal.ts),
 *            handle auth state.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Deal } from '@open-escrow/shared';
import { dealsApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * Return type of the useDeals hook.
 */
export interface UseDealsResult {
  /** List of deals for the authenticated user, null while loading */
  deals: Deal[] | null;
  /** True while the initial fetch or a refresh is in progress */
  isLoading: boolean;
  /** Error message if the last fetch failed, null otherwise */
  error: string | null;
  /** Triggers a fresh fetch from the API */
  refresh: () => void;
}

/**
 * Fetches the current user's deal list from the API.
 * Automatically fetches on mount. Call refresh() to reload.
 *
 * @returns UseDealsResult with deals, loading state, error, and refresh function
 */
export function useDeals(): UseDealsResult {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dealsApi.list();
      setDeals(data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('[useDeals] Failed to fetch deals:', { error: message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDeals();
  }, [fetchDeals]);

  return {
    deals,
    isLoading,
    error,
    refresh: () => { void fetchDeals(); },
  };
}
