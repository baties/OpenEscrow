/**
 * callbacks/milestone-actions.ts — OpenEscrow Telegram Bot
 *
 * Handles: Individual milestone action handlers for inline keyboard callbacks:
 *          handleApprove, handleReject, handleConfirmReject,
 *          handleSubmit, handleConfirmSubmit, handleDealStatus, handleCancelAction.
 * Does NOT: dispatch callbacks (see milestone.ts), access the database,
 *           or contain Telegraf wiring.
 *
 * Each handler checks isLinked() first via requireLinked().
 * All API calls go through api-client/index.ts.
 */

import type { Context as TelegrafContext } from 'telegraf';
import { Markup } from 'telegraf';
import { requireLinked } from '../middleware/auth.js';
import {
  approveMilestone,
  rejectMilestone,
  submitMilestone,
  getDeal,
  ApiClientError,
} from '../api-client/index.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'callbacks.milestone-actions' });

// ─── Approve handler ──────────────────────────────────────────────────────────

/**
 * Handles the approve:<milestoneId> callback action.
 * Calls POST /api/v1/milestones/:id/approve on behalf of the client.
 *
 * @param ctx - Telegraf context with callback_query
 * @param milestoneId - UUID of the milestone to approve
 * @returns Promise<void>
 */
export async function handleApprove(ctx: TelegrafContext, milestoneId: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Processing approval...');
    const result = await approveMilestone(session.jwt, milestoneId);

    log.info(
      {
        module: 'callbacks.milestone-actions',
        operation: 'handleApprove',
        telegramUserId,
        chatId,
        milestoneId,
        newStatus: result.status,
      },
      'Milestone approved successfully'
    );

    await ctx.replyWithMarkdown(
      `✅ *Milestone approved!*\n\n` +
        `Milestone \`${milestoneId.slice(0, 8)}...\` has been approved.\n` +
        `_Use /status <dealId> to check if all milestones are now complete._`
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'handleApprove',
          telegramUserId,
          chatId,
          milestoneId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error approving milestone'
      );
      const msg =
        err.statusCode === 400
          ? `Cannot approve: ${err.apiError?.message ?? 'Invalid state transition.'}`
          : 'Failed to approve milestone. Please try again.';
      await ctx.reply(msg);
      return;
    }
    log.error(
      {
        module: 'bot',
        operation: 'handleApprove',
        telegramUserId,
        chatId,
        milestoneId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error approving milestone'
    );
    await ctx.reply('Something went wrong approving the milestone. Please try again.');
  }
}

// ─── Reject handler ───────────────────────────────────────────────────────────

/**
 * Handles the reject:<milestoneId> callback.
 * Shows a confirmation prompt with confirm/cancel buttons.
 * Quick rejections use reason code INCOMPLETE; detailed feedback via web dashboard.
 *
 * @param ctx - Telegraf context with callback_query
 * @param milestoneId - UUID of the milestone to reject
 * @returns Promise<void>
 */
export async function handleReject(ctx: TelegrafContext, milestoneId: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Preparing rejection...');
    const shortId = milestoneId.slice(0, 8);
    await ctx.replyWithMarkdown(
      `❌ *Reject Milestone \`${shortId}...\`?*\n\n` +
        `Quick rejection uses reason: \`INCOMPLETE\`\n\n` +
        `_For detailed feedback, use the web dashboard._`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Confirm Reject', `confirm_reject:${milestoneId}`),
          Markup.button.callback('🚫 Cancel', `cancel_action:${milestoneId}`),
        ],
      ])
    );
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'handleReject',
        telegramUserId,
        chatId,
        milestoneId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Error showing reject confirmation'
    );
    await ctx.reply('Something went wrong. Please try again.');
  }
}

// ─── Confirm reject handler ───────────────────────────────────────────────────

/**
 * Handles the confirm_reject:<milestoneId> callback.
 * Executes the rejection with a default reason code of INCOMPLETE.
 *
 * @param ctx - Telegraf context with callback_query
 * @param milestoneId - UUID of the milestone to reject
 * @returns Promise<void>
 */
export async function handleConfirmReject(
  ctx: TelegrafContext,
  milestoneId: string
): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Processing rejection...');
    const result = await rejectMilestone(session.jwt, milestoneId, {
      reasonCodes: ['INCOMPLETE'],
      freeText: 'Rejected via Telegram bot. Please check the web dashboard for detailed feedback.',
    });

    log.info(
      {
        module: 'callbacks.milestone-actions',
        operation: 'handleConfirmReject',
        telegramUserId,
        chatId,
        milestoneId,
        rejectionNoteId: result.id,
      },
      'Milestone rejected successfully'
    );

    await ctx.replyWithMarkdown(
      `❌ *Milestone rejected.*\n\n` +
        `Milestone \`${milestoneId.slice(0, 8)}...\` has been rejected and moved to revision.\n` +
        `_The freelancer will be notified._`
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'handleConfirmReject',
          telegramUserId,
          chatId,
          milestoneId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error rejecting milestone'
      );
      const msg =
        err.statusCode === 400
          ? `Cannot reject: ${err.apiError?.message ?? 'Invalid state transition.'}`
          : 'Failed to reject milestone. Please try again.';
      await ctx.reply(msg);
      return;
    }
    log.error(
      {
        module: 'bot',
        operation: 'handleConfirmReject',
        telegramUserId,
        chatId,
        milestoneId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error rejecting milestone'
    );
    await ctx.reply('Something went wrong rejecting the milestone. Please try again.');
  }
}

// ─── Submit handler ───────────────────────────────────────────────────────────

/**
 * Handles the submit:<milestoneId> callback.
 * Shows a confirmation prompt with confirm/cancel buttons.
 * Quick submissions use a default summary; detailed submissions via web dashboard.
 *
 * @param ctx - Telegraf context with callback_query
 * @param milestoneId - UUID of the milestone to submit
 * @returns Promise<void>
 */
export async function handleSubmit(ctx: TelegrafContext, milestoneId: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Preparing submission...');
    const shortId = milestoneId.slice(0, 8);
    await ctx.replyWithMarkdown(
      `📤 *Submit Milestone \`${shortId}...\`?*\n\n` +
        `Quick submission with message: _"Submitted via Telegram bot"_\n\n` +
        `_For detailed submissions with links, use the web dashboard._`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Confirm Submit', `confirm_submit:${milestoneId}`),
          Markup.button.callback('🚫 Cancel', `cancel_action:${milestoneId}`),
        ],
      ])
    );
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'handleSubmit',
        telegramUserId,
        chatId,
        milestoneId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Error showing submit confirmation'
    );
    await ctx.reply('Something went wrong. Please try again.');
  }
}

// ─── Confirm submit handler ───────────────────────────────────────────────────

/**
 * Handles the confirm_submit:<milestoneId> callback.
 * Executes the milestone submission with a default summary message.
 *
 * @param ctx - Telegraf context with callback_query
 * @param milestoneId - UUID of the milestone to submit
 * @returns Promise<void>
 */
export async function handleConfirmSubmit(
  ctx: TelegrafContext,
  milestoneId: string
): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Processing submission...');
    await submitMilestone(session.jwt, milestoneId, {
      summary: 'Submitted via Telegram bot. See web dashboard for full details.',
      links: [],
    });

    log.info(
      {
        module: 'callbacks.milestone-actions',
        operation: 'handleConfirmSubmit',
        telegramUserId,
        chatId,
        milestoneId,
      },
      'Milestone submitted successfully'
    );

    await ctx.replyWithMarkdown(
      `📤 *Milestone submitted!*\n\n` +
        `Milestone \`${milestoneId.slice(0, 8)}...\` has been submitted for review.\n` +
        `_The client will be notified._`
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'handleConfirmSubmit',
          telegramUserId,
          chatId,
          milestoneId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error submitting milestone'
      );
      const msg =
        err.statusCode === 400
          ? `Cannot submit: ${err.apiError?.message ?? 'Invalid state transition.'}`
          : 'Failed to submit milestone. Please try again.';
      await ctx.reply(msg);
      return;
    }
    log.error(
      {
        module: 'bot',
        operation: 'handleConfirmSubmit',
        telegramUserId,
        chatId,
        milestoneId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error submitting milestone'
    );
    await ctx.reply('Something went wrong submitting the milestone. Please try again.');
  }
}

// ─── Deal status shortcut handler ─────────────────────────────────────────────

/**
 * Handles the deal_status:<dealId> callback (triggered from /deals keyboard).
 * Fetches and displays a brief deal status summary.
 *
 * @param ctx - Telegraf context with callback_query
 * @param dealId - UUID of the deal to display
 * @returns Promise<void>
 */
export async function handleDealStatus(ctx: TelegrafContext, dealId: string): Promise<void> {
  const telegramUserId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const session = await requireLinked(ctx);
  if (!session) {
    await ctx.answerCbQuery('Please link your account first.');
    return;
  }

  try {
    await ctx.answerCbQuery('Fetching deal...');
    const deal = await getDeal(session.jwt, dealId);

    const shortId = deal.id.slice(0, 8);
    const isClient = deal.clientId === session.userId;
    const isFreelancer = deal.freelancerId === session.userId;

    const milestoneLines = (deal.milestones ?? [])
      .map((m) => `  ${m.sequence}. ${m.title}: ${m.status}`)
      .join('\n');

    const message =
      `*Deal \`${shortId}...\`*\n\n` +
      `Status: ${deal.status}\n` +
      `Amount: ${deal.totalAmount} tokens\n\n` +
      `*Milestones:*\n${milestoneLines.length > 0 ? milestoneLines : '_None_'}\n\n` +
      `_Use the web dashboard for detailed submissions and feedback._`;

    // Build action buttons so the user doesn't need to type /status <UUID>
    const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

    if (isClient) {
      const submittedMilestones = (deal.milestones ?? []).filter((m) => m.status === 'SUBMITTED');
      for (const m of submittedMilestones) {
        const shortTitle = m.title.slice(0, 20);
        buttons.push([
          Markup.button.callback(`✅ Approve: ${shortTitle}`, `approve:${m.id}`),
          Markup.button.callback(`❌ Reject: ${shortTitle}`, `reject:${m.id}`),
        ]);
      }
    }

    if (isFreelancer && deal.status === 'FUNDED') {
      const actionableMilestones = (deal.milestones ?? []).filter(
        (m) => m.status === 'PENDING' || m.status === 'REVISION'
      );
      for (const m of actionableMilestones) {
        const shortTitle = m.title.slice(0, 25);
        buttons.push([Markup.button.callback(`📤 Submit: ${shortTitle}`, `submit:${m.id}`)]);
      }
    }

    if (buttons.length > 0) {
      await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons));
    } else {
      await ctx.replyWithMarkdown(message);
    }
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'handleDealStatus',
          telegramUserId,
          chatId,
          dealId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error in deal_status callback'
      );
      await ctx.reply('Failed to fetch deal. Please try /status <dealId>.');
      return;
    }
    log.error(
      {
        module: 'bot',
        operation: 'handleDealStatus',
        telegramUserId,
        chatId,
        dealId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error in deal_status callback'
    );
    await ctx.reply('Something went wrong. Please try /status <dealId>.');
  }
}

// ─── Cancel action handler ────────────────────────────────────────────────────

/**
 * Handles the cancel_action:<id> callback.
 * Dismisses a pending confirmation prompt with no action taken.
 *
 * @param ctx - Telegraf context with callback_query
 * @returns Promise<void>
 */
export async function handleCancelAction(ctx: TelegrafContext): Promise<void> {
  try {
    await ctx.answerCbQuery('Cancelled.');
    await ctx.reply('Action cancelled.');
  } catch (err) {
    log.error(
      {
        module: 'bot',
        operation: 'handleCancelAction',
        chatId: ctx.chat?.id,
        error: err instanceof Error ? err.message : String(err),
      },
      'Error handling cancel_action callback'
    );
  }
}
