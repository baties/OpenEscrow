/**
 * callbacks/milestone.ts — OpenEscrow Telegram Bot
 *
 * Handles: Main dispatcher for all inline keyboard callback_query events.
 *          Parses callback_data in "action:id" format and routes to the
 *          appropriate handler in milestone-actions.ts.
 * Does NOT: implement the action handlers themselves (see milestone-actions.ts),
 *           access the database, or contain business logic.
 *
 * Supported actions: approve, reject, confirm_reject, submit, confirm_submit,
 *                    deal_status, cancel_action.
 */

import type { Context as TelegrafContext } from 'telegraf';
import { logger } from '../lib/logger.js';
import {
  handleApprove,
  handleReject,
  handleConfirmReject,
  handleSubmit,
  handleConfirmSubmit,
  handleDealStatus,
  handleCancelAction,
} from './milestone-actions.js';

const log = logger.child({ module: 'callbacks.milestone' });

// ─── Callback data parser ─────────────────────────────────────────────────────

/**
 * Parses a callback_data string in "action:id" format.
 *
 * @param data - The raw callback_data string (e.g. "approve:uuid-here")
 * @returns { action, id } or null if the format is invalid
 */
function parseCallbackData(data: string): { action: string; id: string } | null {
  const colonIdx = data.indexOf(':');
  if (colonIdx === -1) return null;
  const action = data.slice(0, colonIdx);
  const id = data.slice(colonIdx + 1);
  if (!action || !id) return null;
  return { action, id };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Main dispatcher for all milestone-related inline keyboard callbacks.
 * Routes based on the action prefix in callback_data.
 * Answers and ignores unknown callback data gracefully.
 *
 * @param ctx - Telegraf context with callback_query
 * @returns Promise<void>
 */
export async function milestoneCallbackHandler(ctx: TelegrafContext): Promise<void> {
  // Access .data from the callback_query — type-safely narrowed via Record check.
  // Telegraf's CallbackQuery is a discriminated union; we narrow at runtime via the Record cast.
  const callbackQuery = ctx.callbackQuery as
    | (Record<string, unknown> & { data?: string })
    | undefined;
  const data = callbackQuery?.data;
  const chatId = ctx.chat?.id;
  const telegramUserId = ctx.from?.id;

  if (!data) {
    log.warn(
      { module: 'bot', operation: 'milestoneCallbackHandler', chatId },
      'Received callback_query with no data'
    );
    await ctx.answerCbQuery();
    return;
  }

  const parsed = parseCallbackData(data);
  if (!parsed) {
    log.warn(
      {
        module: 'bot',
        operation: 'milestoneCallbackHandler',
        chatId,
        telegramUserId,
        callbackData: data,
      },
      'Unrecognised callback_data format'
    );
    await ctx.answerCbQuery('Unknown action.');
    return;
  }

  log.info(
    {
      module: 'callbacks.milestone',
      operation: 'milestoneCallbackHandler',
      action: parsed.action,
      id: parsed.id,
      telegramUserId,
      chatId,
    },
    'Dispatching milestone callback'
  );

  switch (parsed.action) {
    case 'approve':
      await handleApprove(ctx, parsed.id);
      break;

    case 'reject':
      await handleReject(ctx, parsed.id);
      break;

    case 'confirm_reject':
      await handleConfirmReject(ctx, parsed.id);
      break;

    case 'submit':
      await handleSubmit(ctx, parsed.id);
      break;

    case 'confirm_submit':
      await handleConfirmSubmit(ctx, parsed.id);
      break;

    case 'deal_status':
      await handleDealStatus(ctx, parsed.id);
      break;

    case 'cancel_action':
      await handleCancelAction(ctx);
      break;

    default:
      log.warn(
        {
          module: 'bot',
          operation: 'milestoneCallbackHandler',
          action: parsed.action,
          chatId,
          telegramUserId,
        },
        'Unknown callback action'
      );
      await ctx.answerCbQuery('Unknown action.');
  }
}
