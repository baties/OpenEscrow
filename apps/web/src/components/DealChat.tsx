/**
 * DealChat.tsx — OpenEscrow Web Dashboard
 *
 * Read-only chat history panel for a deal's client↔freelancer conversation.
 * Handles: displaying messages in a fixed-height scrollable box with role icons,
 *          polling for new messages, cursor-based "Load more" pagination for older
 *          messages. Auto-scrolls to the latest message on load and new arrivals.
 * Does NOT: send messages (Telegram-only), manage auth state,
 *            call the API directly (all via useDealMessages hook).
 */

'use client';

import { useRef, useEffect } from 'react';
import { useDealMessages } from '@/hooks/use-deal-messages';
import type { Message } from '@open-escrow/shared';

/** Props for the DealChat component. */
interface DealChatProps {
  /** UUID of the deal whose chat to show. */
  dealId: string;
  /** UUID of the deal's client — used to determine sender role for icon display. */
  clientId: string;
}

/**
 * Formats a UTC ISO timestamp into a compact local time string.
 *
 * @param iso - ISO 8601 datetime string
 * @returns Locale-formatted date and time, e.g. "Apr 17, 14:32"
 */
function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Renders a single chat message bubble with role icon, sender label, timestamp, and content.
 *
 * @param message - The message object to render
 * @param isClient - True if the sender is the client; false if freelancer
 * @returns JSX element for the message bubble
 */
function MessageBubble({ message, isClient }: { message: Message; isClient: boolean }) {
  const icon = isClient ? '🧑‍💼' : '🛠️';
  const label = isClient ? 'Client' : 'Freelancer';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm" aria-label={label}>
          {icon}
        </span>
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">{formatMessageTime(message.createdAt)}</span>
      </div>
      <p className="ml-5 whitespace-pre-wrap break-words text-sm text-gray-800">
        {message.content}
      </p>
    </div>
  );
}

/**
 * Read-only chat history panel for a deal's client↔freelancer conversation.
 * Displayed as a fixed-height scrollable box — newest messages at the bottom.
 * Auto-scrolls to the bottom on initial load and when new messages arrive.
 * Loading older messages (top pagination) preserves the current scroll position.
 *
 * @param dealId - UUID of the deal whose chat to show
 * @param clientId - UUID of the deal's client (used to derive sender role icons)
 * @returns JSX element for the chat panel
 */
export function DealChat({ dealId, clientId }: DealChatProps) {
  const { messages, isLoading, error, loadOlder, hasMore } = useDealMessages(dealId);

  // Ref for the scrollable message container — used to scroll to bottom.
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tracks whether the last messages change was from loading older (top) pagination.
  // When true, we skip the scroll-to-bottom so the user stays where they were.
  const loadingOlderRef = useRef(false);

  // Scroll to the bottom whenever messages change, unless we just loaded older messages.
  useEffect(() => {
    if (!scrollRef.current) return;
    if (loadingOlderRef.current) {
      loadingOlderRef.current = false;
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /**
   * Loads older messages and suppresses the auto-scroll so the user stays in place.
   */
  function handleLoadOlder(): void {
    loadingOlderRef.current = true;
    void loadOlder();
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Chat</h2>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Telegram-only notice */}
        <div className="flex items-start gap-2 border-b border-gray-100 px-5 py-3 text-sm text-gray-500">
          <span className="mt-0.5 text-base">💬</span>
          <span>
            Chat history is shown here read-only.{' '}
            <span className="font-medium text-gray-700">
              To send messages, use the Telegram bot.
            </span>
          </span>
        </div>

        {/* Scrollable message area — fixed height, newest messages at bottom */}
        <div ref={scrollRef} className="h-80 overflow-y-auto px-5">
          {/* Load older messages button — sits at the top of the scroll area */}
          {hasMore && !isLoading && (
            <div className="py-3 text-center">
              <button
                onClick={handleLoadOlder}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                ↑ Load older messages
              </button>
            </div>
          )}

          {/* Initial loading state */}
          {isLoading && messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Loading messages…
            </div>
          )}

          {/* Error state */}
          {error && messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              No messages yet. Start the conversation via the Telegram bot.
            </div>
          )}

          {/* Messages — divided by thin lines */}
          <div className="divide-y divide-gray-50">
            {messages.map((msg) => (
              <div key={msg.id} className="py-3">
                <MessageBubble message={msg} isClient={msg.senderId === clientId} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
