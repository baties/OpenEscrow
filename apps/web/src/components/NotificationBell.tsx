/**
 * NotificationBell.tsx — OpenEscrow Web Dashboard
 *
 * Notification bell icon for the Navbar with an unread badge and dropdown list.
 * Handles: displaying unread count badge, opening/closing the notification dropdown,
 *          marking all as read when the dropdown opens, rendering notification items.
 * Does NOT: fetch notifications (that's NotificationProvider's job), make API calls,
 *            or persist notification read state across sessions.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useNotifications, type AppNotification } from '@/providers/NotificationProvider';
import { formatDate } from '@/lib/format';

/**
 * Bell icon SVG (inline — avoids a separate icon library dependency).
 *
 * @param hasUnread - Whether to use the "active" animation style
 * @returns Bell SVG element
 */
function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg
      className={`h-5 w-5 transition-colors ${hasUnread ? 'text-indigo-600' : 'text-gray-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

/**
 * A single notification row in the dropdown.
 *
 * @param notif - The notification to display
 * @param onNavigate - Called when the user clicks through to the deal
 * @returns Notification row JSX
 */
function NotificationItem({
  notif,
  onNavigate,
}: {
  notif: AppNotification;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={`/deals/${notif.dealId}`}
      onClick={onNavigate}
      className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-gray-50 ${
        notif.read ? '' : 'bg-indigo-50'
      }`}
    >
      <span className="mt-0.5 text-base" aria-hidden="true">
        {notif.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`leading-snug ${notif.read ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
          {notif.message}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          Deal #{notif.shortDealId} · {formatDate(notif.createdAt)}
        </p>
      </div>
      {!notif.read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
      )}
    </Link>
  );
}

/**
 * Notification bell button with unread badge and dropdown panel.
 * Clicking the bell opens the dropdown and marks all notifications as read.
 * Clicking outside closes the dropdown.
 *
 * @returns NotificationBell JSX element
 */
export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark all as read when the dropdown opens
  function handleOpen() {
    setOpen((prev) => {
      if (!prev) markAllRead();
      return !prev;
    });
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
      >
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notif={n}
                  onNavigate={() => setOpen(false)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2 text-center">
              <Link
                href="/deals"
                onClick={() => setOpen(false)}
                className="text-xs text-indigo-600 hover:underline"
              >
                View all deals →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
