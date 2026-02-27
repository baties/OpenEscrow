/**
 * commands/status.ts — OpenEscrow Telegram Bot
 *
 * Handles: /status <dealId> command handler.
 *          Shows the full deal status, current milestones, and action buttons.
 *          Role-aware: client sees approve/reject buttons; freelancer sees submit button.
 * Does NOT: access the database, perform state transitions, or modify deal state.
 *
 * IMPORTANT: This handler checks isLinked() first via requireLinked().
 *            Returns immediately if user is not linked.
 */

import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { z } from 'zod';
import { requireLinked } from '../middleware/auth.js';
import { getDeal, ApiClientError } from '../api-client/index.js';
import { logger } from '../lib/logger.js';
import type { Deal, Milestone } from '../api-client/types.js';

const log = logger.child({ module: 'commands.status' });

/**
 * Zod schema for validating the /status command argument (deal UUID).
 */
const DealIdSchema = z.string().uuid('Deal ID must be a valid UUID');

/**
 * Maps deal status to a readable label with emoji.
 *
 * @param status - Raw deal status from API
 * @returns Human-readable status string
 */
function formatDealStatus(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '📝 Draft — awaiting freelancer agreement',
    AGREED: '🤝 Agreed — awaiting client funding',
    FUNDED: '💰 Funded — work in progress',
    SUBMITTED: '📤 Submitted — awaiting client review',
    APPROVED: '✅ Approved',
    REJECTED: '❌ Rejected — under revision',
    REVISION: '🔄 In Revision',
    COMPLETED: '🏁 Completed',
    CANCELLED: '🚫 Cancelled',
  };
  return map[status] ?? status;
}

/**
 * Maps milestone status to a readable label with emoji.
 *
 * @param status - Raw milestone status
 * @returns Human-readable milestone status
 */
function formatMilestoneStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: '⏳ Pending',
    SUBMITTED: '📤 Submitted',
    APPROVED: '✅ Approved',
    REJECTED: '❌ Rejected',
    REVISION: '🔄 Revision',
  };
  return map[status] ?? status;
}

/**
 * Formats a deal's milestones as a readable list.
 *
 * @param milestones - Array of milestone objects from the deal
 * @returns Formatted markdown string showing all milestones
 */
function formatMilestones(milestones: Milestone[]): string {
  if (!milestones || milestones.length === 0) {
    return '_No milestones._';
  }

  return milestones
    .map(
      (m) =>
        `*${m.sequence}. ${m.title}*\n` +
        `   Status: ${formatMilestoneStatus(m.status)}\n` +
        `   Amount: ${m.amount} tokens`,
    )
    .join('\n\n');
}

/**
 * Builds role-appropriate inline keyboard buttons for a deal.
 * Client sees: approve/reject buttons for SUBMITTED milestones.
 * Freelancer sees: submit button for PENDING/REVISION milestones.
 *
 * @param deal - The full deal object
 * @param userId - The current user's UUID (to determine role)
 * @returns Telegraf InlineKeyboardMarkup or undefined if no actions available
 */
function buildActionKeyboard(
  deal: Deal,
  userId: string,
): ReturnType<typeof Markup.inlineKeyboard> | undefined {
  const isClient = deal.clientId === userId;
  const isFreelancer = deal.freelancerId === userId;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  if (isClient) {
    // Client can approve or reject SUBMITTED milestones
    const submittedMilestones = (deal.milestones ?? []).filter(
      (m) => m.status === 'SUBMITTED',
    );
    for (const m of submittedMilestones) {
      const shortTitle = m.title.slice(0, 20);
      buttons.push([
        Markup.button.callback(`✅ Approve: ${shortTitle}`, `approve:${m.id}`),
        Markup.button.callback(`❌ Reject: ${shortTitle}`, `reject:${m.id}`),
      ]);
    }
  }

  if (isFreelancer) {
    // Freelancer can submit PENDING or REVISION milestones
    const actionableMilestones = (deal.milestones ?? []).filter(
      (m) => m.status === 'PENDING' || m.status === 'REVISION',
    );
    for (const m of actionableMilestones) {
      const shortTitle = m.title.slice(0, 25);
      buttons.push([
        Markup.button.callback(`📤 Submit: ${shortTitle}`, `submit:${m.id}`),
      ]);
    }
  }

  if (buttons.length === 0) return undefined;
  return Markup.inlineKeyboard(buttons);
}

/**
 * Handles the /status <dealId> command.
 * Shows the full deal status, milestones, and appropriate action buttons.
 * Requires the user to be linked.
 *
 * @param ctx - Telegraf context for the /status message
 * @returns Promise<void>
 */
export async function statusCommandHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const telegramUserId = ctx.from?.id;

  log.info(
    { module: 'commands.status', operation: 'statusCommandHandler', telegramUserId, chatId },
    'Handling /status command',
  );

  // Auth check — MUST be first, return immediately if not linked
  const session = await requireLinked(ctx);
  if (!session) return;

  // Extract deal ID argument
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = messageText.trim().split(/\s+/);
  const rawDealId = parts[1];

  if (!rawDealId) {
    await ctx.replyWithMarkdown(
      '❌ *Missing deal ID.*\n\n' +
        'Usage: `/status <dealId>`\n\n' +
        'Use `/deals` to see your deal IDs.',
    );
    return;
  }

  // Validate UUID format
  const parseResult = DealIdSchema.safeParse(rawDealId);
  if (!parseResult.success) {
    log.warn(
      {
        module: 'bot',
        operation: 'statusCommandHandler',
        telegramUserId,
        chatId,
        rawDealId,
        validationError: parseResult.error.issues[0]?.message,
      },
      'Invalid deal ID format in /status',
    );
    await ctx.replyWithMarkdown(
      '❌ *Invalid deal ID format.*\n\n' +
        'Deal IDs are UUIDs (e.g. `550e8400-e29b-41d4-a716-446655440000`).\n\n' +
        'Use `/deals` to see your deal IDs.',
    );
    return;
  }

  const dealId = parseResult.data;

  try {
    const deal = await getDeal(session.jwt, dealId);

    // Check that the user is actually a participant (extra safety — API also enforces this)
    if (deal.clientId !== session.userId && deal.freelancerId !== session.userId) {
      await ctx.reply('You are not a participant in this deal.');
      return;
    }

    const role = deal.clientId === session.userId ? 'Client' : 'Freelancer';
    const shortId = deal.id.slice(0, 8);

    const message =
      `*Deal \`${shortId}...\`*\n\n` +
      `*Status:* ${formatDealStatus(deal.status)}\n` +
      `*Your Role:* ${role}\n` +
      `*Total Amount:* ${deal.totalAmount} tokens\n` +
      `*Created:* ${new Date(deal.createdAt).toLocaleDateString()}\n` +
      (deal.agreedAt ? `*Agreed:* ${new Date(deal.agreedAt).toLocaleDateString()}\n` : '') +
      `\n*Milestones:*\n\n${formatMilestones(deal.milestones ?? [])}\n\n` +
      `_Full ID:_ \`${deal.id}\``;

    const keyboard = buildActionKeyboard(deal, session.userId);

    if (keyboard) {
      await ctx.replyWithMarkdown(message, keyboard);
    } else {
      await ctx.replyWithMarkdown(message);
    }

    log.info(
      {
        module: 'commands.status',
        operation: 'statusCommandHandler',
        telegramUserId,
        chatId,
        dealId,
      },
      'Deal status displayed successfully',
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'statusCommandHandler',
          telegramUserId,
          chatId,
          dealId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error fetching deal status',
      );

      if (err.statusCode === 404) {
        await ctx.reply('Deal not found. Please check the deal ID and try again.');
        return;
      }

      if (err.statusCode === 403) {
        await ctx.reply('You are not a participant in this deal.');
        return;
      }

      if (err.statusCode === 401) {
        await ctx.replyWithMarkdown(
          '🔒 *Session expired.* Please re-link your account via the web dashboard.',
        );
        return;
      }

      await ctx.reply('Failed to fetch deal status. Please try again in a moment.');
      return;
    }

    log.error(
      {
        module: 'bot',
        operation: 'statusCommandHandler',
        telegramUserId,
        chatId,
        dealId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error in /status handler',
    );
    try {
      await ctx.reply('Something went wrong. Please try again.');
    } catch {
      log.error(
        { module: 'bot', operation: 'statusCommandHandler', chatId },
        'Failed to send error reply for /status',
      );
    }
  }
}
