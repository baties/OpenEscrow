/**
 * use-deal-timeline.ts — OpenEscrow Web Dashboard
 *
 * Custom hook for fetching the event timeline (audit trail) for a single deal.
 * Handles: fetching deal_events on mount and on demand, loading state, error state.
 * Does NOT: fetch the deal itself (see use-deal.ts),
 *            mutate deal state (see use-deal-actions.ts).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DealEvent } from '@open-escrow/shared';
import { dealsApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * Return type of the useDealTimeline hook.
 */
export interface UseDealTimelineResult {
  /** Array of deal events, null while loading or if fetch failed */
  events: DealEvent[] | null;
  /** True while a fetch is in progress */
  isLoading: boolean;
  /** Error message if the last fetch failed, null otherwise */
  error: string | null;
  /** Triggers a fresh fetch of the timeline from the API */
  refresh: () => void;
}

/**
 * Fetches the audit trail events for a single deal.
 * Automatically fetches when dealId changes. Call refresh() to reload.
 *
 * @param dealId - The UUID of the deal whose timeline to fetch, or null to skip
 * @returns UseDealTimelineResult with events, loading state, error, and refresh
 */
export function useDealTimeline(dealId: string | null | undefined): UseDealTimelineResult {
  const [events, setEvents] = useState<DealEvent[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!dealId) {
      setEvents(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await dealsApi.getTimeline(dealId);
      setEvents(data);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('[useDealTimeline] Failed to fetch timeline:', { dealId, error: message });
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  return {
    events,
    isLoading,
    error,
    refresh: () => { void fetchTimeline(); },
  };
}
