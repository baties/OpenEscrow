/**
 * middleware/auth.ts — OpenEscrow Telegram Bot
 *
 * Handles: The `isLinked` check shared across all command and callback handlers.
 *          Provides a helper that retrieves the session or replies with link instructions.
 * Does NOT: verify JWTs (that's the API's job), access the database,
 *           or handle Telegram-specific message routing.
 *
 * Usage: Call `requireLinked(ctx)` at the top of every command/callback handler.
 *        If it returns null, the handler must return immediately.
 */

import type { Context } from 'telegraf';
import { isLinked, getSession } from '../store/sessions.js';
import { logger } from '../lib/logger.js';
import type { UserSession } from '../api-client/types.js';

const log = logger.child({ module: 'middleware.auth' });

/** Message sent to unlinked users when they try to use bot commands. */
const LINK_INSTRUCTIONS =
  '🔗 *Account not linked.*\n\n' +
  'To use OpenEscrow bot:\n' +
  '1. Go to the web dashboard → Settings → Telegram\n' +
  '2. Click "Generate Link Code" to get a one-time code\n' +
  '3. Send the code here: `/link <your-code>`\n\n' +
  'Your Telegram account will be linked to your wallet.';

/**
 * Checks if the Telegram user is linked to a wallet account.
 * If linked, returns the user session. If not linked, sends instructions and returns null.
 *
 * This must be called at the entry point of every command and callback handler.
 * If this function returns null, the handler MUST return immediately without further action.
 *
 * @param ctx - Telegraf context for the current message/callback
 * @returns The UserSession if linked, or null if not linked (reply already sent)
 */
export async function requireLinked(ctx: Context): Promise<UserSession | null> {
  const telegramUserId = ctx.from?.id;

  if (telegramUserId === undefined) {
    log.warn(
      { module: 'middleware.auth', operation: 'requireLinked' },
      'ctx.from.id is undefined — ignoring update'
    );
    return null;
  }

  if (!isLinked(telegramUserId)) {
    log.info(
      {
        module: 'middleware.auth',
        operation: 'requireLinked',
        telegramUserId,
      },
      'Unlinked user attempted command'
    );

    try {
      await ctx.replyWithMarkdown(LINK_INSTRUCTIONS);
    } catch (replyErr) {
      log.error(
        {
          module: 'middleware.auth',
          operation: 'requireLinked',
          telegramUserId,
          error: replyErr instanceof Error ? replyErr.message : String(replyErr),
        },
        'Failed to send link instructions'
      );
    }

    return null;
  }

  const session = getSession(telegramUserId);
  if (!session) {
    // Should not happen — isLinked() returned true but getSession returned undefined.
    // Log as error and treat as unlinked (defensive guard).
    log.error(
      {
        module: 'middleware.auth',
        operation: 'requireLinked',
        telegramUserId,
      },
      'isLinked() returned true but getSession() returned undefined — session store inconsistency'
    );

    try {
      await ctx.replyWithMarkdown(LINK_INSTRUCTIONS);
    } catch (replyErr) {
      log.error(
        {
          module: 'middleware.auth',
          operation: 'requireLinked',
          telegramUserId,
          error: replyErr instanceof Error ? replyErr.message : String(replyErr),
        },
        'Failed to send link instructions after session inconsistency'
      );
    }

    return null;
  }

  return session;
}
