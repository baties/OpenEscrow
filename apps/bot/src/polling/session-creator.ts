/**
 * polling/session-creator.ts — OpenEscrow Telegram Bot
 *
 * Handles: Polling for newly linked Telegram users and establishing their bot sessions.
 *          When a user completes the web-dashboard linking flow, the API links their
 *          Telegram ID. This poller detects that, creates an in-memory session,
 *          and sends a welcome notification to the user.
 * Does NOT: perform the actual linking (that's the web dashboard + API),
 *           send deal event notifications (that's polling/notifier.ts),
 *           access the database directly.
 *
 * Flow:
 *   1. User sends /link <code> to bot → added to pendingLinks Set
 *   2. User submits code + Telegram ID on web dashboard → API links the account
 *   3. This poller calls POST /api/v1/telegram/bot-session for each pending user
 *   4. On success (user is linked): creates session, sends welcome message, removes from pending
 *   5. On 404 (user not linked yet): skips until next poll
 */

import type { Telegraf, Context } from 'telegraf';
import { pendingLinks } from '../commands/link.js';
import { getBotSession } from '../api-client/index.js';
import { setSession } from '../store/sessions.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'polling.session-creator' });

/** How often to check pending links in milliseconds. Use same interval as deal notification poll. */
const SESSION_POLL_INTERVAL_MS = env.POLL_INTERVAL_MS;

/**
 * Attempts to create a bot session for a single pending Telegram user.
 * Calls POST /api/v1/telegram/bot-session with the shared bot secret.
 * On success: stores the session and sends a welcome message.
 * On 404 (not yet linked): silently skips.
 *
 * @param bot - The Telegraf bot instance used to send the welcome message
 * @param telegramUserId - The Telegram user ID string to check and potentially link
 * @returns Promise<void> — errors are logged but not rethrown
 */
async function tryCreateSession(bot: Telegraf<Context>, telegramUserId: string): Promise<void> {
  try {
    const sessionData = await getBotSession(telegramUserId, env.BOT_API_SECRET);

    if (!sessionData) {
      // Not yet linked — normal state, try again on next poll
      return;
    }

    // User is linked — create the in-memory session
    setSession(telegramUserId, {
      userId: sessionData.userId,
      jwt: sessionData.token,
      walletAddress: sessionData.walletAddress,
      lastSeenEventAt: null,
      chatDealId: null,
      chatOldestMessageAt: null,
    });

    // Remove from pending list — session is established
    pendingLinks.delete(telegramUserId);

    log.info(
      {
        module: 'polling.session-creator',
        operation: 'tryCreateSession',
        telegramUserId,
        userId: sessionData.userId,
      },
      'Bot session created for newly linked user'
    );

    // Send welcome notification
    try {
      await bot.telegram.sendMessage(
        Number(telegramUserId),
        `🎉 *Account linked successfully!*\n\n` +
          `Your Telegram account is now connected to your wallet.\n\n` +
          `*What you can do:*\n` +
          `• Receive real-time notifications for deals and milestones\n` +
          `• Use /deals to list your active deals\n` +
          `• Use /status <dealId> to check deal details\n\n` +
          `_You're all set. Happy building!_`,
        { parse_mode: 'Markdown' }
      );
    } catch (sendErr) {
      log.error(
        {
          module: 'bot',
          operation: 'tryCreateSession',
          telegramUserId,
          error: sendErr instanceof Error ? sendErr.message : String(sendErr),
        },
        'Failed to send welcome message to newly linked user'
      );
      // Session was still created successfully — welcome message failure is non-fatal
    }
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'tryCreateSession',
        telegramUserId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Error checking pending link status'
    );
  }
}

/**
 * Starts the session-creator polling loop.
 * Runs every SESSION_POLL_INTERVAL_MS milliseconds.
 * For each user in the pendingLinks Set, attempts to create a bot session.
 *
 * This function never throws — all errors are caught at the per-user level.
 * Call this once at bot startup after Telegraf is connected.
 *
 * @param bot - The running Telegraf bot instance (used to send welcome messages)
 * @returns The setInterval handle (call clearInterval to stop)
 */
export function startSessionCreatorPolling(bot: Telegraf<Context>): ReturnType<typeof setInterval> {
  log.info(
    {
      module: 'polling.session-creator',
      operation: 'startSessionCreatorPolling',
      pollIntervalMs: SESSION_POLL_INTERVAL_MS,
    },
    'Starting session-creator polling loop'
  );

  const intervalHandle = setInterval(() => {
    if (pendingLinks.size === 0) return;

    for (const telegramUserId of pendingLinks) {
      tryCreateSession(bot, telegramUserId).catch((unexpectedErr) => {
        log.error(
          {
            module: 'bot',
            operation: 'startSessionCreatorPolling',
            telegramUserId,
            error: unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr),
          },
          'Unhandled error escaped tryCreateSession'
        );
      });
    }
  }, SESSION_POLL_INTERVAL_MS);

  return intervalHandle;
}
