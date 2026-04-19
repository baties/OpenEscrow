/**
 * callbacks/chat-actions.ts — OpenEscrow Telegram Bot
 *
 * Handles: Chat room entry, message history display, and "load older" pagination.
 *          Implements the Telegram-side privacy relay for deal chat:
 *          neither party sees the other's Telegram ID — messages route through the API.
 * Does NOT: access the database directly, handle text input (see commands/chat-message.ts),
 *            dispatch callbacks (see callbacks/milestone.ts).
 *
 * Chat room state is tracked per-user via chatDealId + chatOldestMessageAt in sessions.ts.
 * Entering a room sets chatDealId; exiting (🚪) clears it. Text messages in active rooms
 * are forwarded to the API by chat-message.ts.
 *
 * Icons: 🧑‍💼 = Client, 🛠️ = Freelancer — shown on every message for visual separation.
 */

import type { Context as TelegrafContext } from 'telegraf';
import { Markup } from 'telegraf';
import { requireLinked } from '../middleware/auth.js';
import { getDeal, getDealMessages, ApiClientError } from '../api-client/index.js';
import { setChatDealId, setChatOldestMessageAt } from '../store/sessions.js';
import { logger } from '../lib/logger.js';
import type { Message } from '../api-client/types.js';

const log = logger.child({ module: 'callbacks.chat-actions' });

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Formats a UTC ISO 8601 timestamp into a compact human-readable string.
 * Example: "Apr 17, 2:30 PM"
 *
 * @param createdAt - ISO 8601 timestamp string
 * @returns Formatted date/time string
 */
function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  return (
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

/**
 * Formats a list of messages into a single Telegram-ready markdown string.
 * Uses 🧑‍💼 for client messages and 🛠️ for freelancer messages.
 * Content is truncated at 150 chars to keep the message within Telegram's 4096-char limit.
 *
 * @param msgs       - Array of messages in ascending created_at order
 * @param clientId   - Internal user UUID of the deal's client
 * @param shortDealId - First 8 chars of the deal UUID (for the header)
 * @returns Formatted markdown string ready to send to Telegram
 */
function formatChatHistory(msgs: Message[], clientId: string, shortDealId: string): string {
  const header = `💬 *Chat — Deal \\#${shortDealId}*\n`;
  const divider = '─────────────────────\n';

  if (msgs.length === 0) {
    return `${header}${divider}_No messages yet. Type a message below._`;
  }

  const lines = msgs
    .map((m) => {
      const icon = m.senderId === clientId ? '🧑‍💼 Client' : '🛠️ Freelancer';
      const time = formatMessageTime(m.createdAt);
      const content = m.content.length > 150 ? m.content.slice(0, 150) + '…' : m.content;
      return `${icon} · _${time}_\n${content}`;
    })
    .join('\n\n');

  return `${header}${divider}${lines}`;
}

// ─── Exported handlers ────────────────────────────────────────────────────────

/**
 * Enters the chat room for a deal.
 * Fetches the last 10 messages, sets the session chat context, and sends the
 * formatted history with a persistent reply keyboard showing "🚪 Exit Chat Room".
 *
 * Called by the callback dispatcher for both `chat:<dealId>` (from deal card button)
 * and `open_chat:<dealId>` (from incoming message notification button).
 *
 * @param ctx    - Telegraf context with callback_query
 * @param dealId - UUID of the deal whose chat room to enter
 * @returns Promise<void>
 */
export async function handleEnterChat(ctx: TelegrafContext, dealId: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Opening chat room…');

    // Verify the user is a participant and get deal info for icon rendering.
    const deal = await getDeal(session.jwt, dealId);
    if (deal.clientId !== session.userId && deal.freelancerId !== session.userId) {
      await ctx.reply('You are not a participant in this deal.');
      return;
    }

    const msgs = await getDealMessages(session.jwt, dealId, undefined, 10);

    // Set the chat context in the session.
    setChatDealId(telegramUserId!, dealId);
    if (msgs.length > 0) {
      setChatOldestMessageAt(telegramUserId!, msgs[0]!.createdAt);
    }

    const shortDealId = dealId.slice(0, 8);
    const historyText = formatChatHistory(msgs, deal.clientId, shortDealId);

    // Build keyboard: "Load older" only if we received a full page (may be more to load).
    const inlineButtons =
      msgs.length >= 10
        ? [Markup.button.callback('← Load older messages', `load_older_chat:${dealId}`)]
        : [];

    if (inlineButtons.length > 0) {
      await ctx.replyWithMarkdown(historyText, Markup.inlineKeyboard([inlineButtons]));
    } else {
      await ctx.replyWithMarkdown(historyText);
    }

    // Show the persistent reply keyboard — this is the visual anchor indicating "in chat mode".
    await ctx.reply('Type a message to send it to the other party.', {
      reply_markup: {
        keyboard: [[{ text: '🚪 Exit Chat Room' }]],
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });

    log.info(
      {
        module: 'callbacks.chat-actions',
        operation: 'handleEnterChat',
        telegramUserId,
        chatId,
        dealId,
        messageCount: msgs.length,
      },
      'Entered chat room'
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'handleEnterChat',
          telegramUserId,
          chatId,
          dealId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error entering chat room'
      );
      await ctx.reply('Failed to open chat room. Please try again.');
      return;
    }
    log.error(
      {
        module: 'bot',
        operation: 'handleEnterChat',
        telegramUserId,
        chatId,
        dealId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error entering chat room'
    );
    try {
      await ctx.reply('Something went wrong. Please try again.');
    } catch {
      log.error(
        { module: 'bot', operation: 'handleEnterChat', chatId },
        'Failed to send error reply'
      );
    }
  }
}

/**
 * Loads older messages for the active chat room using cursor-based pagination.
 * Uses session.chatOldestMessageAt as the cursor.
 * Prepends the loaded messages above the current chat view.
 * Updates chatOldestMessageAt if older messages were found.
 *
 * @param ctx    - Telegraf context with callback_query
 * @param dealId - UUID of the deal whose older messages to load
 * @returns Promise<void>
 */
export async function handleLoadOlderMessages(ctx: TelegrafContext, dealId: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  if (!session.chatOldestMessageAt) {
    await ctx.answerCbQuery('No cursor available — please re-open the chat.');
    return;
  }

  try {
    await ctx.answerCbQuery('Loading older messages…');

    const deal = await getDeal(session.jwt, dealId);
    const olderMsgs = await getDealMessages(session.jwt, dealId, session.chatOldestMessageAt, 10);

    if (olderMsgs.length === 0) {
      await ctx.replyWithMarkdown('_No older messages._');
      return;
    }

    // Update the oldest cursor to the beginning of the newly loaded batch.
    setChatOldestMessageAt(telegramUserId!, olderMsgs[0]!.createdAt);

    const shortDealId = dealId.slice(0, 8);
    const historyText = formatChatHistory(olderMsgs, deal.clientId, shortDealId);

    const inlineButtons =
      olderMsgs.length >= 10
        ? [Markup.button.callback('← Load older messages', `load_older_chat:${dealId}`)]
        : [];

    if (inlineButtons.length > 0) {
      await ctx.replyWithMarkdown(historyText, Markup.inlineKeyboard([inlineButtons]));
    } else {
      await ctx.replyWithMarkdown(historyText);
    }

    log.info(
      {
        module: 'callbacks.chat-actions',
        operation: 'handleLoadOlderMessages',
        telegramUserId,
        chatId,
        dealId,
        loaded: olderMsgs.length,
      },
      'Loaded older messages'
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'handleLoadOlderMessages',
          telegramUserId,
          chatId,
          dealId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error loading older messages'
      );
      await ctx.reply('Failed to load older messages. Please try again.');
      return;
    }
    log.error(
      {
        module: 'bot',
        operation: 'handleLoadOlderMessages',
        telegramUserId,
        chatId,
        dealId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error loading older messages'
    );
    try {
      await ctx.reply('Something went wrong. Please try again.');
    } catch {
      log.error(
        { module: 'bot', operation: 'handleLoadOlderMessages', chatId },
        'Failed to send error reply'
      );
    }
  }
}
