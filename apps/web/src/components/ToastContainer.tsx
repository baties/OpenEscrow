/**
 * ToastContainer.tsx — OpenEscrow Web Dashboard
 *
 * Floating toast notification container — renders stacked toasts in the
 * bottom-right corner when new deal events are detected.
 * Handles: listening for 'deal:updated' window events, displaying dismissible
 *          toast messages, auto-dismissing after 4 seconds.
 * Does NOT: make API calls, duplicate logic from NotificationProvider,
 *            or persist toast history.
 *
 * Toasts and the NotificationBell are complementary: toasts give an instant
 * visual pop-up when an event fires; the bell gives a persistent history.
 * Dependency: none — pure Tailwind CSS, no toast library needed.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotifications } from '@/providers/NotificationProvider';

/**
 * Duration a toast stays visible before auto-dismiss (ms).
 * 4 seconds balances visibility and non-intrusiveness.
 */
const TOAST_DURATION_MS = 4_000;

/**
 * A single displayed toast item.
 */
interface ToastItem {
  id: string;
  icon: string;
  message: string;
  shortDealId: string;
}

/**
 * Single toast card component.
 *
 * @param toast - Toast data to display
 * @param onDismiss - Called when the user clicks the dismiss button
 * @returns Toast card JSX
 */
function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg max-w-xs w-full animate-in slide-in-from-bottom-2 fade-in duration-200"
    >
      <span className="text-lg" aria-hidden="true">
        {toast.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-snug">{toast.message}</p>
        <p className="mt-0.5 text-xs text-gray-400">Deal #{toast.shortDealId}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-gray-400 hover:text-gray-600"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Fixed-position container that renders incoming deal event toasts.
 * Listens to the NotificationProvider's notification stream — whenever a new
 * unread notification arrives, it shows a toast that auto-dismisses after 4s.
 *
 * Place once in the app layout, outside any scrollable container.
 *
 * @returns Fixed toast stack JSX
 */
export function ToastContainer() {
  const { notifications } = useNotifications();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lastSeenCount, setLastSeenCount] = useState(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // When new unread notifications arrive (notifications list grows), show toasts.
  useEffect(() => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length <= lastSeenCount) return;

    // Show only the notifications that are genuinely new since last render.
    // unread is AppNotification[] (from useNotifications) so no cast needed.
    const newOnes = unread.slice(0, unread.length - lastSeenCount);
    setLastSeenCount(unread.length);

    const newToasts: ToastItem[] = newOnes.map((n) => ({
      id: n.id,
      icon: n.icon,
      message: n.message,
      shortDealId: n.shortDealId,
    }));

    setToasts((prev) => [...newToasts, ...prev].slice(0, 5)); // cap at 5 visible at once

    // Auto-dismiss each new toast after TOAST_DURATION_MS
    for (const t of newToasts) {
      setTimeout(() => dismissToast(t.id), TOAST_DURATION_MS);
    }
  }, [notifications, lastSeenCount, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
