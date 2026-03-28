/**
 * NotificationProvider.tsx — OpenEscrow Web Dashboard
 *
 * React context provider for real-time in-app notifications.
 * Handles: polling GET /api/v1/deals every 30s, detecting deal state changes,
 *          generating in-app notifications, dispatching 'deal:updated' window events
 *          so individual deal pages can auto-refresh, managing unread count.
 * Does NOT: send Telegram messages (that's the bot's job), make WebSocket connections,
 *            store notifications beyond the current browser session.
 *
 * Architecture:
 *   - On each poll, compare current deal statuses to the previously stored snapshot.
 *   - When a deal's status changes, create a Notification and add it to state.
 *   - Dispatch a 'deal:updated' CustomEvent on window so the deal detail page
 *     can call refreshDeal() without knowing about the notification system.
 *   - Notifications are kept in memory only — cleared on page reload (intentional
 *     for MVP; persistence would require a proper notifications API endpoint).
 *
 * Polling interval: 30 seconds (matches bot polling interval per MVP spec).
 * First poll: seeds the status snapshot without generating notifications (prevents
 * flooding notifications for deals that already exist before the user opened the tab).
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { dealsApi } from '@/lib/api-client';
import { getAuthToken } from '@/lib/auth-storage';
import type { Deal, DealStatus } from '@open-escrow/shared';

/** How often to poll for deal updates (matches bot polling per CLAUDE.md Section C). */
const POLL_INTERVAL_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single in-app notification generated from a deal state change.
 */
export interface AppNotification {
  /** Unique notification ID (timestamp-based, sufficient for in-memory use) */
  id: string;
  /** The deal this notification is about */
  dealId: string;
  /** Short deal ID for display (first 8 chars) */
  shortDealId: string;
  /** Human-readable notification message */
  message: string;
  /** Icon/emoji for the notification type */
  icon: string;
  /** ISO 8601 timestamp when this notification was generated */
  createdAt: string;
  /** Whether the user has seen/dismissed this notification */
  read: boolean;
}

/**
 * Context value shape for the notification system.
 */
export interface NotificationContextValue {
  /** All notifications, newest first */
  notifications: AppNotification[];
  /** Number of unread notifications */
  unreadCount: number;
  /** Mark all notifications as read */
  markAllRead: () => void;
  /** Remove all notifications */
  clearAll: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Event label map ──────────────────────────────────────────────────────────

/** Maps a deal status transition to a human-readable notification message and icon. */
const TRANSITION_MESSAGE: Partial<Record<DealStatus, { message: string; icon: string }>> = {
  AGREED: { icon: '🤝', message: 'Freelancer agreed to the deal — you can now fund it.' },
  FUNDED: { icon: '💰', message: 'Deal funded — work can begin.' },
  SUBMITTED: { icon: '📤', message: 'Milestone submitted for review.' },
  APPROVED: { icon: '✅', message: 'Milestone approved — funds released.' },
  REJECTED: { icon: '❌', message: 'Milestone rejected — revision required.' },
  REVISION: { icon: '🔄', message: 'Milestone ready for revision.' },
  COMPLETED: { icon: '🏁', message: 'Deal completed — all milestones approved!' },
  CANCELLED: { icon: '🚫', message: 'Deal cancelled.' },
};

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Props for NotificationProvider.
 */
interface NotificationProviderProps {
  children: ReactNode;
}

/**
 * Provides real-time deal change notifications to the app.
 * Must be placed inside AuthProvider (needs access to the stored JWT).
 *
 * @param props - Children to render within the notification context
 * @returns JSX.Element — the notification context provider
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  /** Map of dealId → last known DealStatus, used to detect changes between polls. */
  const dealStatusSnapshotRef = useRef<Map<string, DealStatus>>(new Map());
  /** True after the first successful poll — prevents flooding on initial load. */
  const hasSeededRef = useRef(false);

  /**
   * Polls the deal list API, compares statuses to the snapshot, and generates
   * notifications for any deals that changed status since the last poll.
   * Also dispatches 'deal:updated' window events for deal-specific auto-refresh.
   */
  const pollDeals = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return; // Not authenticated — skip poll

    try {
      const deals: Deal[] = await dealsApi.list();
      if (!Array.isArray(deals)) return;

      const snapshot = dealStatusSnapshotRef.current;

      if (!hasSeededRef.current) {
        // First poll: seed the snapshot without creating notifications.
        // This prevents showing notifications for all existing deals when the user
        // first opens the app.
        for (const deal of deals) {
          snapshot.set(deal.id, deal.status);
        }
        hasSeededRef.current = true;
        return;
      }

      const newNotifications: AppNotification[] = [];

      for (const deal of deals) {
        const previousStatus = snapshot.get(deal.id);

        if (previousStatus !== undefined && previousStatus !== deal.status) {
          // Status changed — generate a notification
          const meta = TRANSITION_MESSAGE[deal.status];
          if (meta) {
            const notif: AppNotification = {
              id: `${deal.id}-${Date.now()}`,
              dealId: deal.id,
              shortDealId: deal.id.slice(0, 8),
              message: meta.message,
              icon: meta.icon,
              createdAt: new Date().toISOString(),
              read: false,
            };
            newNotifications.push(notif);

            // Debug: log state change (only warn/error allowed by ESLint; use console.warn)
            console.warn('[NotificationProvider] Deal status change detected', {
              dealId: deal.id,
              status: deal.status,
            });
          }

          // Dispatch a window event so the open deal detail page can auto-refresh.
          // This decouples the notification system from the deal detail component.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('deal:updated', { detail: { dealId: deal.id, status: deal.status } })
            );
          }
        }

        // Always update snapshot to current status
        snapshot.set(deal.id, deal.status);
      }

      if (newNotifications.length > 0) {
        setNotifications((prev) => [...newNotifications, ...prev].slice(0, 50)); // cap at 50
      }
    } catch (err) {
      // Poll failures are non-fatal — logged but do not affect the UI
      console.warn('[NotificationProvider] Deal poll failed — will retry next interval', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Start polling when the component mounts, stop on unmount.
  useEffect(() => {
    // Run immediately then on interval
    void pollDeals();
    const handle = setInterval(() => void pollDeals(), POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [pollDeals]);

  /**
   * Marks all current notifications as read.
   */
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  /**
   * Removes all notifications.
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Reads the notification context. Must be used inside <NotificationProvider>.
 *
 * @returns NotificationContextValue
 * @throws {Error} If called outside of <NotificationProvider>
 */
export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (ctx === null) {
    throw new Error('useNotifications must be used within <NotificationProvider>');
  }
  return ctx;
}
