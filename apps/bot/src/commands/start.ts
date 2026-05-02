/**
 * commands/start.ts — OpenEscrow Telegram Bot
 *
 * Handles: /start command handler.
 *          Sends a welcome message. If user is already linked, shows their status.
 *          If not linked, sends clear instructions for linking via the web dashboard.
 * Does NOT: check any API state, access the DB, or perform any destructive action.
 */

import type { Context } from 'telegraf';
import { isLinked, getSession } from '../store/sessions.js';
import { logger } from '../lib/logger.js';
import { MAIN_MENU_KEYBOARD } from '../lib/keyboards.js';

const log = logger.child({ module: 'commands.start' });

/** Welcome message for users who are not yet linked. */
const WELCOME_UNLINKED =
  '👋 *Welcome to OpenEscrow Bot!*\n\n' +
  'OpenEscrow is a milestone-based escrow platform for freelancers and Web3 projects.\n\n' +
  '*To get started:*\n' +
  '1. Sign in with your wallet at the web dashboard\n' +
  '2. Go to Settings → Telegram\n' +
  '3. Generate a link code and send it here: `/link <code>`\n\n' +
  "_Once linked, you'll receive deal notifications and can approve/submit milestones from here._";

/** Welcome message for users who are already linked. */
const welcomeLinked = (walletAddress: string): string =>
  `✅ *OpenEscrow Bot — Linked*\n\n` +
  `Your wallet \`${walletAddress}\` is linked.\n\n` +
  `*Available commands:*\n` +
  `/deals — List your active deals\n` +
  `/status <dealId> — Check a specific deal\n` +
  `/link <code> — Re-link your account if needed\n\n` +
  `_You'll receive notifications here when milestones need your attention._`;

/**
 * Handles the /start command.
 * Sends a welcome message. If the user is already linked, shows their linked status.
 * If not linked, shows clear instructions for linking via the web dashboard.
 *
 * @param ctx - Telegraf context for the /start message
 * @returns Promise<void>
 */
export async function startCommandHandler(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  log.info(
    { module: 'commands.start', operation: 'startCommandHandler', telegramUserId, chatId },
    'Handling /start command'
  );

  try {
    if (telegramUserId !== undefined && isLinked(telegramUserId)) {
      const session = getSession(telegramUserId);
      const message = welcomeLinked(session?.walletAddress ?? '(unknown)');
      await ctx.replyWithMarkdown(message, { reply_markup: MAIN_MENU_KEYBOARD });
    } else {
      await ctx.replyWithMarkdown(WELCOME_UNLINKED, { reply_markup: MAIN_MENU_KEYBOARD });
    }
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'startCommandHandler',
        chatId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to handle /start command'
    );
    try {
      await ctx.reply('Sorry, something went wrong. Please try again.');
    } catch {
      // If even the error reply fails, log and move on — do not throw
      log.error(
        { module: 'bot', operation: 'startCommandHandler', chatId },
        'Failed to send error reply for /start'
      );
    }
  }
}
