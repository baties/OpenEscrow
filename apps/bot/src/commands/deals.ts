/**
 * commands/deals.ts — OpenEscrow Telegram Bot
 *
 * Handles: /deals command handler.
 *          Lists active deals for the linked user with deal status and role.
 *          Provides inline keyboard actions for each deal based on the user's role.
 * Does NOT: access the database directly, make decisions about deal state,
 *           or perform state transitions (those go through the API).
 *
 * IMPORTANT: This handler checks isLinked() first. If not linked, returns immediately.
 */

import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { requireLinked } from '../middleware/auth.js';
import { listDeals, ApiClientError } from '../api-client/index.js';
import { logger } from '../lib/logger.js';
import type { Deal } from '../api-client/types.js';

const log = logger.child({ module: 'commands.deals' });

/**
 * Maps a deal status to a human-readable emoji label.
 *
 * @param status - The deal status string
 * @returns Emoji + label string for display
 */
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    DRAFT: '📝 Draft',
    AGREED: '🤝 Agreed',
    FUNDED: '💰 Funded',
    SUBMITTED: '📤 Submitted',
    APPROVED: '✅ Approved',
    REJECTED: '❌ Rejected',
    REVISION: '🔄 Revision',
    COMPLETED: '🏁 Completed',
    CANCELLED: '🚫 Cancelled',
  };
  return statusMap[status] ?? status;
}

/**
 * Formats a single deal as a Markdown summary line.
 *
 * @param deal - The deal to format
 * @param userRole - 'client' or 'freelancer' based on userId match
 * @returns Multi-line markdown string for display
 */
function formatDealSummary(deal: Deal, userRole: string): string {
  const shortId = deal.id.slice(0, 8);
  const statusLabel = formatStatus(deal.status);
  const milestoneCount = deal.milestones?.length ?? 0;
  const roleLabel = userRole === 'client' ? '👤 Client' : '💼 Freelancer';

  return (
    `*Deal \`${shortId}...\`*\n` +
    `Status: ${statusLabel} | Role: ${roleLabel}\n` +
    `Milestones: ${milestoneCount} | Amount: ${deal.totalAmount} tokens\n` +
    `ID: \`${deal.id}\``
  );
}

/**
 * Handles the /deals command.
 * Lists all deals for the authenticated linked user.
 * Requires the user to be linked — returns immediately if not linked.
 *
 * @param ctx - Telegraf context for the /deals message
 * @returns Promise<void>
 */
export async function dealsCommandHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const telegramUserId = ctx.from?.id;

  log.info(
    { module: 'commands.deals', operation: 'dealsCommandHandler', telegramUserId, chatId },
    'Handling /deals command'
  );

  // Auth check — MUST be first, return immediately if not linked
  const session = await requireLinked(ctx);
  if (!session) return;

  try {
    const response = await listDeals(session.jwt);

    const deals =
      response.deals ??
      // as unknown as: API may return a bare Deal[] instead of { deals: Deal[] } depending on version.
      (response as unknown as Deal[]);

    if (!Array.isArray(deals) || deals.length === 0) {
      await ctx.replyWithMarkdown(
        '📭 *No deals found.*\n\n' +
          "You don't have any deals yet.\n" +
          'Visit the web dashboard to create a new deal.'
      );
      return;
    }

    // Filter to active deals (not completed or cancelled) for the primary list
    const activeDeals = deals.filter(
      (d: Deal) => d.status !== 'COMPLETED' && d.status !== 'CANCELLED'
    );
    const inactiveDeals = deals.filter(
      (d: Deal) => d.status === 'COMPLETED' || d.status === 'CANCELLED'
    );

    const lines: string[] = ['*Your Deals*\n'];

    if (activeDeals.length > 0) {
      lines.push('*Active Deals:*');
      for (const deal of activeDeals) {
        const role = deal.clientId === session.userId ? 'client' : 'freelancer';
        lines.push('');
        lines.push(formatDealSummary(deal, role));
      }
    }

    if (inactiveDeals.length > 0) {
      lines.push('');
      lines.push(`*Past Deals (${inactiveDeals.length}):*`);
      for (const deal of inactiveDeals) {
        const role = deal.clientId === session.userId ? 'client' : 'freelancer';
        lines.push('');
        lines.push(formatDealSummary(deal, role));
      }
    }

    lines.push('');
    lines.push('_Use /status <dealId> for full details._');

    // Build inline keyboards for active deals
    const dealButtons = activeDeals.slice(0, 5).map((deal: Deal) => {
      const shortId = deal.id.slice(0, 8);
      return [Markup.button.callback(`📋 ${shortId}...`, `deal_status:${deal.id}`)];
    });

    const keyboard = dealButtons.length > 0 ? Markup.inlineKeyboard(dealButtons) : undefined;

    if (keyboard) {
      await ctx.replyWithMarkdown(lines.join('\n'), keyboard);
    } else {
      await ctx.replyWithMarkdown(lines.join('\n'));
    }

    log.info(
      {
        module: 'commands.deals',
        operation: 'dealsCommandHandler',
        telegramUserId,
        chatId,
        dealCount: deals.length,
      },
      'Deals listed successfully'
    );
  } catch (err) {
    if (err instanceof ApiClientError) {
      log.error(
        {
          module: 'bot',
          operation: 'dealsCommandHandler',
          telegramUserId,
          chatId,
          statusCode: err.statusCode,
          error: err.message,
        },
        'API error fetching deals'
      );

      if (err.statusCode === 401) {
        await ctx.replyWithMarkdown(
          '🔒 *Session expired.*\n\n' +
            'Your session has expired. Please re-link your account:\n' +
            '1. Go to web dashboard → Settings → Telegram\n' +
            '2. Generate a new link code\n' +
            '3. Send `/link <code>` here'
        );
        return;
      }

      await ctx.reply('Failed to fetch your deals. Please try again in a moment.');
      return;
    }

    log.error(
      {
        module: 'bot',
        operation: 'dealsCommandHandler',
        telegramUserId,
        chatId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error in /deals handler'
    );
    try {
      await ctx.reply('Something went wrong fetching your deals. Please try again.');
    } catch {
      log.error(
        { module: 'bot', operation: 'dealsCommandHandler', chatId },
        'Failed to send error reply for /deals'
      );
    }
  }
}
