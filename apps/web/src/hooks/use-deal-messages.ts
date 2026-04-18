/**
 * use-deal-messages.ts — OpenEscrow Web Dashboard
 *
 * Custom hook for fetching and polling the chat message history for a deal.
 * Handles: initial fetch, 30s polling for new messages, load-older pagination,
 *          loading state, and error state.
 * Does NOT: send messages (chat is Telegram-only), manage auth state,
 *            or call the API directly (all calls go through dealsApi).
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message } from '@open-escrow/shared';
import { dealsApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

/** Poll interval for new messages — 30 seconds (consistent with deal events polling). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Return type of the useDealMessages hook.
 */
export interface UseDealMessagesResult {
  /** All loaded messages in ascending created_at order (oldest first). */
  messages: Message[];
  /** True while the initial fetch is in progress. */
  isLoading: boolean;
  /** Error message if the last fetch failed, null otherwise. */
  error: string | null;
  /** Loads the next page of older messages (cursor-based). Returns false if no more. */
  loadOlder: () => Promise<boolean>;
  /** True if there may be older messages to load (last loadOlder call returned results). */
  hasMore: boolean;
}

/**
 * Fetches and polls the chat history for a single deal.
 * Automatically starts a 30s polling loop for new messages on mount.
 * Supports loading older messages via cursor-based pagination.
 *
 * @param dealId - The UUID of the deal whose messages to fetch, or null to skip
 * @returns UseDealMessagesResult with messages, loading state, error, loadOlder, hasMore
 */
export function useDealMessages(dealId: string | null | undefined): UseDealMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Ref to track the newest message's createdAt for polling deduplication.
  const newestAtRef = useRef<string | null>(null);
  // Ref to track the oldest message's createdAt for load-older cursor.
  const oldestAtRef = useRef<string | null>(null);

  /** Fetches the initial page of messages (newest 20). */
  const fetchInitial = useCallback(async () => {
    if (!dealId) {
      setMessages([]);
      setHasMore(true);
      newestAtRef.current = null;
      oldestAtRef.current = null;
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await dealsApi.getMessages(dealId, undefined, 20);
      setMessages(data);
      setHasMore(data.length >= 20);
      newestAtRef.current = data.length > 0 ? (data[data.length - 1]?.createdAt ?? null) : null;
      oldestAtRef.current = data.length > 0 ? (data[0]?.createdAt ?? null) : null;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error('[useDealMessages] Failed to fetch messages:', { dealId, error: message });
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  /** Polls for new messages (createdAt newer than the current newest). */
  const pollNew = useCallback(async () => {
    if (!dealId) return;
    try {
      // Fetch the last 20 messages — new ones will appear at the end.
      const data = await dealsApi.getMessages(dealId, undefined, 20);
      if (data.length === 0) return;

      const latestAt = data[data.length - 1]?.createdAt ?? null;
      if (latestAt === newestAtRef.current) return; // Nothing new.

      // Merge: keep all existing messages and append any that are strictly newer.
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOnes = data.filter((m) => !existingIds.has(m.id));
        if (newOnes.length === 0) return prev;
        return [...prev, ...newOnes];
      });
      newestAtRef.current = latestAt;
    } catch {
      // Polling errors are silent — they don't update the error state so the UI
      // doesn't flash on transient network issues during background polling.
    }
  }, [dealId]);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  // ── Polling loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dealId) return;
    const interval = setInterval(() => {
      void pollNew();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dealId, pollNew]);

  // ── Load older ────────────────────────────────────────────────────────────

  /**
   * Loads the previous page of messages (older than the currently oldest visible message).
   * Prepends the loaded messages to the top of the list.
   *
   * @returns true if messages were loaded, false if there are no more
   */
  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (!dealId || !oldestAtRef.current) return false;
    try {
      const data = await dealsApi.getMessages(dealId, oldestAtRef.current, 20);
      if (data.length === 0) {
        setHasMore(false);
        return false;
      }
      setMessages((prev) => [...data, ...prev]);
      oldestAtRef.current = data[0]?.createdAt ?? oldestAtRef.current;
      setHasMore(data.length >= 20);
      return true;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      return false;
    }
  }, [dealId]);

  return { messages, isLoading, error, loadOlder, hasMore };
}
