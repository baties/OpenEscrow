/**
 * modules/messages/messages.router.ts — OpenEscrow API
 *
 * Handles: Registering deal chat message routes with Fastify.
 *          Both routes require JWT authentication. Participant access is checked
 *          in the controller (not via requireRole — any participant can chat).
 * Does NOT: contain business logic (see messages.service.ts),
 *            perform validation beyond route-level (Zod schemas in messages.schema.ts).
 *
 * Routes registered:
 *   POST  /api/v1/deals/:id/messages  — send a message (auth + participant)
 *   GET   /api/v1/deals/:id/messages  — list messages with cursor pagination (auth + participant)
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { sendMessageHandler, getMessagesHandler } from './messages.controller.js';

/**
 * Registers all deal message routes on the Fastify instance.
 * Must be called from the main app builder (index.ts).
 *
 * @param fastify - The Fastify application instance
 * @returns Promise<void>
 */
export async function messagesRouter(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/deals/:id/messages — send a chat message
  fastify.post<{ Params: { id: string } }>(
    '/deals/:id/messages',
    { preHandler: [requireAuth] },
    sendMessageHandler
  );

  // GET /api/v1/deals/:id/messages — get message history (cursor-paginated)
  fastify.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    '/deals/:id/messages',
    { preHandler: [requireAuth] },
    getMessagesHandler
  );
}
