/**
 * modules/messages/messages.service.ts — OpenEscrow API
 *
 * Handles: Business logic for deal chat messages.
 *          sendMessage — stores the message and emits a MESSAGE_RECEIVED deal event.
 *          getMessages — cursor-based pagination, returns messages oldest-first.
 *          isParticipant — participant access check used by the controller.
 * Does NOT: enforce HTTP request/response (see messages.controller.ts),
 *            verify participant access (enforced in the controller before calling here),
 *            expose Telegram user IDs (privacy relay lives in apps/bot).
 *
 * Privacy note: MESSAGE_RECEIVED deal events are filtered from the timeline endpoint
 * (deals.service.ts#getDealTimeline) so they never appear in the public audit trail.
 * They exist solely to drive bot push notifications via the existing poller.
 */

import { eq, lt, desc, and } from 'drizzle-orm';
import { db } from '../../database/index.js';
import { messages, deals, dealEvents, type Message } from '../../database/schema.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'messages.service' });

// ─── Service functions ─────────────────────────────────────────────────────────

/**
 * Checks whether a user is a participant (client or freelancer) in a deal.
 * Used by the controller before calling sendMessage or getMessages.
 *
 * @param dealId - UUID of the deal
 * @param userId - UUID of the user to check
 * @returns true if user is client or freelancer on this deal, false if not or deal missing
 * @throws {AppError} MESSAGE_ACCESS_FAILED on database error
 */
export async function isParticipant(dealId: string, userId: string): Promise<boolean> {
  try {
    const [deal] = await db
      .select({ clientId: deals.clientId, freelancerId: deals.freelancerId })
      .from(deals)
      .where(eq(deals.id, dealId))
      .limit(1);

    if (!deal) return false;
    return deal.clientId === userId || deal.freelancerId === userId;
  } catch (err) {
    log.error(
      {
        module: 'messages.service',
        operation: 'isParticipant',
        dealId,
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to check deal participant'
    );
    throw new AppError('MESSAGE_ACCESS_FAILED', 'Failed to verify deal access');
  }
}

/**
 * Stores a new chat message for a deal and emits a MESSAGE_RECEIVED deal_event
 * so the Telegram bot notification poller can deliver it to the counterparty.
 * Both the message insert and the event insert are wrapped in a transaction.
 *
 * @param dealId   - UUID of the deal this message belongs to
 * @param senderId - UUID of the user sending the message (must be client or freelancer)
 * @param content  - Message text (1–2000 chars, already validated by controller)
 * @returns The newly created message record
 * @throws {AppError} MESSAGE_SEND_FAILED on database error
 */
export async function sendMessage(
  dealId: string,
  senderId: string,
  content: string
): Promise<Message> {
  log.info(
    { module: 'messages.service', operation: 'sendMessage', dealId, senderId },
    'Sending deal message'
  );

  try {
    const result = await db.transaction(async (tx) => {
      // Insert the message.
      const [msg] = await tx.insert(messages).values({ dealId, senderId, content }).returning();

      if (!msg) {
        throw new Error('Message insert returned no rows');
      }

      // Determine sender role for the event metadata so the bot notifier can
      // render the correct icon (🧑‍💼 / 🛠️) without an extra DB lookup.
      const [deal] = await tx
        .select({ clientId: deals.clientId, freelancerId: deals.freelancerId })
        .from(deals)
        .where(eq(deals.id, dealId))
        .limit(1);

      const senderRole = deal?.clientId === senderId ? 'client' : 'freelancer';

      // Emit MESSAGE_RECEIVED — consumed by polling/notifier.ts to push a Telegram
      // notification to the counterparty. Filtered out of the timeline API response.
      await tx.insert(dealEvents).values({
        dealId,
        actorId: senderId,
        eventType: 'MESSAGE_RECEIVED',
        metadata: {
          messageId: msg.id,
          senderRole,
          // Truncated preview for bot notification display (keeps payload small).
          preview: content.slice(0, 100),
        },
      });

      return msg;
    });

    log.info(
      {
        module: 'messages.service',
        operation: 'sendMessage',
        dealId,
        senderId,
        messageId: result.id,
      },
      'Message sent successfully'
    );

    return result;
  } catch (err) {
    log.error(
      {
        module: 'messages.service',
        operation: 'sendMessage',
        dealId,
        senderId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to send message'
    );
    throw new AppError('MESSAGE_SEND_FAILED', 'Failed to send message');
  }
}

/**
 * Retrieves paginated chat history for a deal in chronological order (oldest first).
 *
 * Pagination strategy: cursor-based on created_at.
 * - No cursor  → returns the `limit` most recent messages.
 * - With cursor → returns up to `limit` messages with created_at strictly before cursor
 *   (i.e. the page of messages immediately older than the current oldest visible message).
 * Results are always returned ascending (oldest → newest) for display.
 *
 * @param dealId - UUID of the deal whose messages to fetch
 * @param cursor - Optional ISO 8601 timestamp; returns messages older than this point
 * @param limit  - Maximum number of messages to return (default 20, max 50)
 * @returns Array of messages in ascending created_at order (oldest first)
 * @throws {AppError} MESSAGE_LIST_FAILED on database error
 */
export async function getMessages(
  dealId: string,
  cursor?: string,
  limit: number = 20
): Promise<Message[]> {
  log.info(
    { module: 'messages.service', operation: 'getMessages', dealId, cursor, limit },
    'Fetching deal messages'
  );

  try {
    const whereClause = cursor
      ? and(eq(messages.dealId, dealId), lt(messages.createdAt, new Date(cursor)))
      : eq(messages.dealId, dealId);

    // Fetch newest-first so DESC + LIMIT gives the correct page window,
    // then reverse to return chronological (ascending) order.
    const rows = await db
      .select()
      .from(messages)
      .where(whereClause)
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.reverse();
  } catch (err) {
    log.error(
      {
        module: 'messages.service',
        operation: 'getMessages',
        dealId,
        cursor,
        limit,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to fetch messages'
    );
    throw new AppError('MESSAGE_LIST_FAILED', 'Failed to retrieve messages');
  }
}
