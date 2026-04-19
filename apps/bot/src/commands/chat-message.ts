/**
 * commands/chat-message.ts — OpenEscrow Telegram Bot
 *
 * Handles: Plain-text messages when the user is inside an active chat room.
 *          Routes messages to the API (which stores them and notifies the counterparty).
 *          Also handles the "🚪 Exit Chat Room" reply keyboard button to leave the room.
 * Does NOT: handle commands (those are intercepted before this handler),
 *            access the database directly, or know the counterparty's Telegram ID.
 *
 * Privacy relay: this handler sends the message text to the API, which writes it to
 * the messages table and emits a MESSAGE_RECEIVED event. The counterparty receives a
 * bot notification from the poller — their Telegram ID is never revealed to the sender.
 *
 * Registration: bot.on('text', chatMessageHandler) in index.ts — fires for all
 * non-command text messages. Exits silently if user is not in a chat room.
 */

import type { Context } from 'telegraf';
import { getSession, setChatDealId } from '../store/sessions.js';
import { sendDealMessage, ApiClientError } from '../api-client/index.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'commands.chat-message' });

/** The exact text of the persistent reply keyboard exit button. */
const EXIT_CHAT_TEXT = '🚪 Exit Chat Room';

/**
 * Handles plain-text messages in the context of an active chat room.
 * If the user presses "🚪 Exit Chat Room": clears session state and removes keyboard.
 * If the user is in a chat room: sends the message to the API.
 * Otherwise: exits silently (not in chat mode — message is ignored).
 *
 * @param ctx - Telegraf context for a text message update
 * @returns Promise<void>
 */
export async function chatMessageHandler(ctx: Context): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!telegramUserId || !chatId) return;

  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (!messageText) return;

  const session = getSession(telegramUserId);

  // ── Exit chat room ────────────────────────────────────────────────────────
  if (messageText === EXIT_CHAT_TEXT) {
    if (session?.chatDealId) {
      setChatDealId(telegramUserId, null);
      log.info(
        {
          module: 'commands.chat-message',
          operation: 'chatMessageHandler',
          telegramUserId,
          chatId,
        },
        'User exited chat room'
      );
    }
    // Remove the persistent reply keyboard regardless of whether they were in a room.
    await ctx.reply('Chat room closed. Use /deals to return to your deals.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  // ── Not in a chat room — ignore silently ──────────────────────────────────
  if (!session?.chatDealId) return;

  // ── Send message to API ───────────────────────────────────────────────────
  const dealId = session.chatDealId;

  log.info(
    {
      module: 'commands.chat-message',
      operation: 'chatMessageHandler',
      telegramUserId,
      chatId,
      dealId,
      contentLength: messageText.length,
    },
    'Sending chat message'
  );

  try {
    await sendDealMessage(session.jwt, dealId, messageText);
    // Send a minimal acknowledgement so the user knows the message was delivered.
    await ctx.reply('✉️ Sent');
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'chatMessageHandler',
          telegramUserId,
          chatId,
          dealId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error sending chat message'
      );

      if (err.statusCode === 400) {
        await ctx.reply('❌ Message too long (max 2000 characters). Please shorten and try again.');
        return;
      }
      if (err.statusCode === 403) {
        await ctx.reply('❌ You are no longer a participant in this deal.');
        setChatDealId(telegramUserId, null);
        await ctx.reply('Chat room closed.', { reply_markup: { remove_keyboard: true } });
        return;
      }

      await ctx.reply('Failed to send message. Please try again.');
      return;
    }

    log.error(
      {
        module: 'bot',
        operation: 'chatMessageHandler',
        telegramUserId,
        chatId,
        dealId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error sending chat message'
    );
    try {
      await ctx.reply('Something went wrong. Please try again.');
    } catch {
      log.error(
        { module: 'bot', operation: 'chatMessageHandler', chatId },
        'Failed to send error reply'
      );
    }
  }
}
