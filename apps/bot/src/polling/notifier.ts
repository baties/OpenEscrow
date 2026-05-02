/**
 * polling/notifier.ts — OpenEscrow Telegram Bot
 *
 * Handles: Notification polling loop.
 *          Every BOT_POLL_INTERVAL_MS milliseconds, checks for new deal_events
 *          for each linked user and sends Telegram notifications for new events.
 *          Tracks `lastSeenEventAt` (ISO timestamp) per user to avoid duplicate notifications.
 * Does NOT: send messages for events the user has already seen,
 *           access the database directly, or modify deal state.
 *
 * Architecture:
 *   - Iterates over all sessions in the session store
 *   - For each session, fetches active deals via GET /api/v1/deals
 *   - For each deal, fetches timeline via GET /api/v1/deals/:id/timeline
 *   - Compares event createdAt timestamps against lastSeenEventAt to find new events
 *     (ISO 8601 string comparison is safe for monotonic ordering; UUID v4 is not)
 *   - Sends user-friendly Telegram messages for each new event
 *   - Updates lastSeenEventAt after processing
 *
 * Error handling: Per-user poll failures are logged but do NOT crash the loop.
 *   The loop continues to the next user on any error.
 */

import type { Telegraf, Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getAllSessions, updateLastSeenEventAt } from '../store/sessions.js';
import { listDeals, getDealTimeline, ApiClientError } from '../api-client/index.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { DealEvent } from '../api-client/types.js';

const log = logger.child({ module: 'polling.notifier' });

// ─── Event notification formatters ───────────────────────────────────────────

/**
 * Formats a DealEvent into a human-readable Telegram notification message.
 * Returns null for events that should not generate a notification.
 *
 * @param event - The deal event to format
 * @param userRole - 'client' or 'freelancer' so notifications are role-relevant
 * @param inChatRoom - When true and event is MESSAGE_RECEIVED, returns a compact
 *                     inline format (no "Open Chat" prompt) for already-open rooms
 * @returns Markdown notification string, or null if event should be skipped
 */
function formatEventNotification(
  event: DealEvent,
  userRole: string,
  inChatRoom = false
): string | null {
  const dealId =
    typeof event.metadata?.['dealId'] === 'string' ? event.metadata['dealId'] : event.dealId;
  const shortDealId = dealId.slice(0, 8);

  switch (event.eventType) {
    case 'DEAL_AGREED':
      // Notify client that freelancer agreed
      if (userRole === 'client') {
        return (
          `🤝 *Deal Agreed!*\n\n` +
          `The freelancer has agreed to deal \`${shortDealId}...\`\n` +
          `You can now fund the deal on the web dashboard.\n\n` +
          `_Deal ID: \`${dealId}\`_`
        );
      }
      return null;

    case 'DEAL_FUNDED':
      // Notify freelancer that deal was funded
      if (userRole === 'freelancer') {
        return (
          `💰 *Deal Funded!*\n\n` +
          `Deal \`${shortDealId}...\` has been funded.\n` +
          `You can now submit your first milestone.\n\n` +
          `_Use /deals to see your deals and submit milestones._`
        );
      }
      return null;

    case 'MILESTONE_SUBMITTED': {
      // Notify client that a milestone was submitted
      if (userRole === 'client') {
        const seq = event.metadata?.['milestoneSequence'];
        const seqLabel = typeof seq === 'number' ? ` #${seq}` : '';
        return (
          `📤 *Milestone${seqLabel} Submitted!*\n\n` +
          `A milestone has been submitted for review on deal \`${shortDealId}...\`\n\n` +
          `_Use /deals to review and approve or reject._`
        );
      }
      return null;
    }

    case 'MILESTONE_APPROVED': {
      // Notify freelancer that a milestone was approved
      if (userRole === 'freelancer') {
        const seq = event.metadata?.['milestoneSequence'];
        const seqLabel = typeof seq === 'number' ? ` #${seq}` : '';
        return (
          `✅ *Milestone${seqLabel} Approved!*\n\n` +
          `Your milestone has been approved on deal \`${shortDealId}...\`\n` +
          `Funds have been released to your wallet.\n\n` +
          `_Use /deals to see remaining milestones._`
        );
      }
      return null;
    }

    case 'MILESTONE_REJECTED': {
      // Notify freelancer that a milestone was rejected
      if (userRole === 'freelancer') {
        const seq = event.metadata?.['milestoneSequence'];
        const seqLabel = typeof seq === 'number' ? ` #${seq}` : '';
        const reasons = Array.isArray(event.metadata?.['reasonCodes'])
          ? (event.metadata['reasonCodes'] as string[]).join(', ')
          : 'See web dashboard for details';
        return (
          `❌ *Milestone${seqLabel} Rejected*\n\n` +
          `Your milestone on deal \`${shortDealId}...\` was rejected.\n` +
          `Reasons: ${reasons}\n\n` +
          `_Use /deals to resubmit after revision._`
        );
      }
      return null;
    }

    case 'DEAL_COMPLETED':
      return (
        `🏁 *Deal Completed!*\n\n` +
        `Deal \`${shortDealId}...\` is now complete.\n` +
        `All milestones have been approved.\n\n` +
        `_Thank you for using OpenEscrow!_`
      );

    case 'DEAL_CANCELLED':
      return (
        `🚫 *Deal Cancelled*\n\n` +
        `Deal \`${shortDealId}...\` has been cancelled.\n` +
        `_Refund rules apply per agreement. Check the web dashboard for details._`
      );

    case 'MESSAGE_RECEIVED': {
      // Only notify the counterparty — not the sender themselves.
      const senderRole =
        typeof event.metadata?.['senderRole'] === 'string' ? event.metadata['senderRole'] : null;
      const isFromSelf =
        (senderRole === 'client' && userRole === 'client') ||
        (senderRole === 'freelancer' && userRole === 'freelancer');
      if (isFromSelf) return null; // Never notify the sender of their own message.

      const senderIcon = senderRole === 'client' ? '🧑‍💼' : '🛠️';
      const preview =
        typeof event.metadata?.['preview'] === 'string' ? event.metadata['preview'] : 'New message';

      // Compact inline format when recipient already has the chat room open.
      if (inChatRoom) {
        return `${senderIcon} ${preview}`;
      }

      return (
        `💬 *New message — Deal \\#${shortDealId}*\n\n` +
        `${senderIcon}: "${preview}"\n\n` +
        `_Tap the button below to open the chat room and reply._`
      );
    }

    case 'MILESTONE_REVISION': {
      // Notify freelancer the milestone is ready for revision
      if (userRole === 'freelancer') {
        const seq = event.metadata?.['milestoneSequence'];
        const seqLabel = typeof seq === 'number' ? ` #${seq}` : '';
        return (
          `🔄 *Milestone${seqLabel} Ready for Revision*\n\n` +
          `Please revise and resubmit milestone on deal \`${shortDealId}...\`\n\n` +
          `_Use /deals to resubmit._`
        );
      }
      return null;
    }

    default:
      // DEAL_CREATED — don't notify (user created it themselves)
      return null;
  }
}

// ─── Per-user poll logic ──────────────────────────────────────────────────────

/**
 * Polls new events for a single linked user and sends Telegram notifications.
 * Fetches all active deals, then fetches timelines for each, filtering to new events.
 *
 * @param bot - The Telegraf bot instance (used to send messages)
 * @param telegramUserId - The Telegram user ID string from the session map
 * @param session - The user's session (jwt, userId, lastSeenEventAt)
 * @returns Promise<void> — errors are logged but not rethrown
 */
async function pollUserNotifications(
  bot: Telegraf<Context>,
  telegramUserId: string,
  session: {
    jwt: string;
    userId: string;
    lastSeenEventAt: string | null;
    chatDealId: string | null;
  }
): Promise<void> {
  try {
    const dealsResponse = await listDeals(session.jwt);
    const deals =
      dealsResponse.deals ??
      // The API may return a bare array instead of { deals: [...] } depending on version.
      // as unknown as: dealsResponse typed as ListDealsResponse but API may return Deal[] directly.
      (dealsResponse as unknown as {
        id: string;
        clientId: string;
        freelancerId: string;
        status: string;
      }[]);

    if (!Array.isArray(deals) || deals.length === 0) return;

    // Poll all deals, including COMPLETED and CANCELLED, so the final
    // DEAL_COMPLETED and DEAL_CANCELLED events are delivered to both parties.
    // Deduplication is handled by the lastSeenEventAt timestamp filter below.
    // Once the final event has been seen, completed/cancelled deals produce
    // 0 new events and are skipped cheaply on every subsequent poll.

    // Track the latest createdAt timestamp seen in this poll cycle.
    // ISO 8601 string comparison is safe for chronological ordering.
    let newestEventAt = session.lastSeenEventAt;

    for (const deal of deals) {
      try {
        const timelineResponse = await getDealTimeline(session.jwt, deal.id);
        const events: DealEvent[] =
          timelineResponse.events ??
          // as unknown as: API may return bare DealEvent[] instead of { events: [...] }.
          (timelineResponse as unknown as DealEvent[]);

        if (!Array.isArray(events) || events.length === 0) continue;

        // Determine user role for this deal
        const userRole = deal.clientId === session.userId ? 'client' : 'freelancer';

        // Filter to events newer than lastSeenEventAt (ISO 8601 string comparison is reliable).
        // UUID v4 IDs are random and not monotonically ordered — do NOT use e.id for this.
        const newEvents = session.lastSeenEventAt
          ? events.filter((e) => e.createdAt > session.lastSeenEventAt!)
          : events.slice(-5); // On first poll, only show last 5 events to avoid spam

        for (const event of newEvents) {
          // If recipient is already in this deal's chat room, use compact inline format.
          const alreadyInRoom =
            event.eventType === 'MESSAGE_RECEIVED' && session.chatDealId === deal.id;
          const message = formatEventNotification(event, userRole, alreadyInRoom);
          if (message) {
            try {
              const replyMarkup =
                event.eventType === 'MESSAGE_RECEIVED' && !alreadyInRoom
                  ? Markup.inlineKeyboard([
                      [Markup.button.callback('💬 Open Chat', `open_chat:${deal.id}`)],
                    ]).reply_markup
                  : undefined;

              await bot.telegram.sendMessage(Number(telegramUserId), message, {
                parse_mode: 'Markdown',
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
              });
              log.info(
                {
                  module: 'polling.notifier',
                  operation: 'pollUserNotifications',
                  telegramUserId,
                  eventId: event.id,
                  eventType: event.eventType,
                  dealId: deal.id,
                },
                'Notification sent'
              );
            } catch (sendErr) {
              log.error(
                {
                  module: 'bot',
                  operation: 'pollUserNotifications',
                  telegramUserId,
                  eventId: event.id,
                  error: sendErr instanceof Error ? sendErr.message : String(sendErr),
                },
                'Failed to send notification message'
              );
            }
          }

          // Track the newest createdAt timestamp across all deals in this poll cycle
          if (newestEventAt === null || event.createdAt > newestEventAt) {
            newestEventAt = event.createdAt;
          }
        }
      } catch (dealErr) {
        if (dealErr instanceof ApiClientError) {
          log.warn(
            {
              module: 'bot',
              operation: 'pollUserNotifications',
              telegramUserId,
              dealId: deal.id,
              statusCode: dealErr.statusCode,
              error: dealErr.message,
            },
            'API error fetching deal timeline during poll — skipping this deal'
          );
        } else {
          log.error(
            {
              module: 'bot',
              operation: 'pollUserNotifications',
              telegramUserId,
              dealId: deal.id,
              error: dealErr instanceof Error ? dealErr.message : String(dealErr),
            },
            'Unexpected error fetching deal timeline — skipping this deal'
          );
        }
      }
    }

    // Update lastSeenEventAt if we saw any new events in this poll cycle
    if (newestEventAt !== null && newestEventAt !== session.lastSeenEventAt) {
      updateLastSeenEventAt(telegramUserId, newestEventAt);
    }
  } catch (err) {
    if (err instanceof ApiClientError) {
      if (err.statusCode === 401) {
        log.warn(
          {
            module: 'bot',
            operation: 'pollUserNotifications',
            telegramUserId,
            error: err.message,
          },
          'JWT expired for user during poll — user session will remain but notifications paused'
        );
      } else {
        log.error(
          {
            module: 'bot',
            operation: 'pollUserNotifications',
            telegramUserId,
            statusCode: err.statusCode,
            error: err.message,
          },
          'API error during poll for user'
        );
      }
    } else {
      log.error(
        {
          module: 'bot',
          operation: 'pollUserNotifications',
          telegramUserId,
          error: err instanceof Error ? err.message : String(err),
        },
        'Unexpected error polling notifications for user'
      );
    }
  }
}

// ─── Polling loop ─────────────────────────────────────────────────────────────

/**
 * Starts the notification polling loop.
 * Runs every POLL_INTERVAL_MS milliseconds (default: 30s per MVP spec).
 * Iterates over all linked users and sends notifications for new deal events.
 *
 * This function never throws — all errors are caught and logged at the per-user level.
 * Call this once at bot startup after Telegraf is connected.
 *
 * @param bot - The running Telegraf bot instance (needed for bot.telegram.sendMessage)
 * @returns The setInterval handle (call clearInterval to stop)
 */
export function startNotificationPolling(bot: Telegraf<Context>): ReturnType<typeof setInterval> {
  log.info(
    {
      module: 'polling.notifier',
      operation: 'startNotificationPolling',
      pollIntervalMs: env.POLL_INTERVAL_MS,
    },
    'Starting notification polling loop'
  );

  const intervalHandle = setInterval(() => {
    const sessions = getAllSessions();

    // Fire-and-forget per user — errors handled inside pollUserNotifications
    for (const [telegramUserId, session] of sessions) {
      pollUserNotifications(bot, telegramUserId, session).catch((unexpectedErr) => {
        // This catch should never fire (pollUserNotifications handles all errors internally)
        log.error(
          {
            module: 'bot',
            operation: 'startNotificationPolling',
            telegramUserId,
            error: unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr),
          },
          'Unhandled error escaped pollUserNotifications'
        );
      });
    }
  }, env.POLL_INTERVAL_MS);

  return intervalHandle;
}
