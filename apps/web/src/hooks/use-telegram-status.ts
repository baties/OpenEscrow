/**
 * use-telegram-status.ts — OpenEscrow Web Dashboard
 *
 * Custom hook for fetching the current user's Telegram link status.
 * Handles: one-time fetch on mount (when authenticated), loading and error states.
 * Does NOT: poll for changes, mutate link status, or manage auth state.
 *
 * Used by the deals dashboard to show the Telegram CTA banner when the account
 * is not yet linked.
 */

import { useState, useEffect } from 'react';
import { telegramApi, type TelegramStatusResponse } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

/**
 * State shape returned by the useTelegramStatus hook.
 */
export interface UseTelegramStatusResult {
  /** True if the Telegram account is linked, false if not, null while loading */
  linked: boolean | null;
  /** True while the status fetch is in progress */
  isLoading: boolean;
  /** Error message if the status fetch failed, null otherwise */
  error: string | null;
}

/**
 * Fetches the current user's Telegram link status from the API.
 * Only fetches when `enabled` is true (typically when the user is authenticated).
 * On error, treats the account as unlinked so the CTA is shown rather than hidden.
 *
 * @param enabled - Whether to perform the fetch (set to isAuthenticated)
 * @returns Loading state, link status, and any error
 */
export function useTelegramStatus(enabled: boolean): UseTelegramStatusResult {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function fetchStatus() {
      setIsLoading(true);
      setError(null);

      try {
        const status: TelegramStatusResponse = await telegramApi.getStatus();
        if (!cancelled) {
          setLinked(status.linked);
        }
      } catch (err) {
        if (!cancelled) {
          const message = getErrorMessage(err);
          // Non-fatal: default to showing the CTA (treat as not linked) on error
          setLinked(false);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchStatus();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { linked, isLoading, error };
}
