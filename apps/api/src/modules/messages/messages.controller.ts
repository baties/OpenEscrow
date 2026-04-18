/**
 * modules/messages/messages.controller.ts — OpenEscrow API
 *
 * Handles: HTTP request/response logic for deal chat message endpoints.
 *          Validates inputs, enforces participant access, calls service layer.
 * Does NOT: contain business logic (see messages.service.ts),
 *            interact with the database directly, or enforce JWT auth
 *            (JWT auth is enforced by requireAuth middleware in the router).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as messagesService from './messages.service.js';
import { SendMessageSchema, GetMessagesQuerySchema } from './messages.schema.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'messages.controller' });

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/deals/:id/messages
 * Sends a chat message from the authenticated user to the counterparty on a deal.
 * The sender must be a participant (client or freelancer) on the deal.
 *
 * @param request - Fastify request with params.id, body (SendMessageInput), and user JWT
 * @param reply   - Fastify reply
 * @returns 201 with the created message record
 */
export async function sendMessageHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const dealId = request.params.id;
  const senderId = request.user.userId;

  const parsed = SendMessageSchema.safeParse(request.body);
  if (!parsed.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    });
    return;
  }

  log.info(
    { module: 'messages.controller', operation: 'sendMessageHandler', dealId, senderId },
    'Handling send message request'
  );

  // Verify the sender is a participant on this deal.
  const participant = await messagesService.isParticipant(dealId, senderId);
  if (!participant) {
    await reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You are not a participant in this deal',
    });
    return;
  }

  const message = await messagesService.sendMessage(dealId, senderId, parsed.data.content);
  await reply.status(201).send(message);
}

/**
 * GET /api/v1/deals/:id/messages
 * Returns paginated chat history for a deal in chronological order (oldest first).
 * Both client and freelancer can read messages. Cursor-based pagination via `cursor` query param.
 *
 * Query params:
 *   cursor - ISO 8601 timestamp: returns messages older than this (load-older pagination)
 *   limit  - Number of messages to return (default 20, max 50)
 *
 * @param request - Fastify request with params.id, optional query params, and user JWT
 * @param reply   - Fastify reply
 * @returns 200 with array of message objects in ascending created_at order
 */
export async function getMessagesHandler(
  request: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, unknown> }>,
  reply: FastifyReply
): Promise<void> {
  const dealId = request.params.id;
  const userId = request.user.userId;

  const parsedQuery = GetMessagesQuerySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid query parameters',
      details: parsedQuery.error.flatten(),
    });
    return;
  }

  log.info(
    {
      module: 'messages.controller',
      operation: 'getMessagesHandler',
      dealId,
      userId,
      cursor: parsedQuery.data.cursor,
      limit: parsedQuery.data.limit,
    },
    'Handling get messages request'
  );

  // Verify the requester is a participant on this deal.
  const participant = await messagesService.isParticipant(dealId, userId);
  if (!participant) {
    await reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You are not a participant in this deal',
    });
    return;
  }

  const msgs = await messagesService.getMessages(
    dealId,
    parsedQuery.data.cursor,
    parsedQuery.data.limit
  );
  await reply.status(200).send(msgs);
}
