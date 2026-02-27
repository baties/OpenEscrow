/**
 * modules/telegram-link/telegram.router.ts — OpenEscrow API
 *
 * Handles: Registering all Telegram linking routes with Fastify.
 *          All routes require authentication.
 * Does NOT: contain business logic (see telegram.service.ts),
 *            interact with the Telegram Bot API.
 *
 * Routes registered:
 *   POST   /api/v1/telegram/generate-code — generate 15-min OTP (auth)
 *   POST   /api/v1/telegram/link          — verify OTP, link Telegram ID (auth)
 *   DELETE /api/v1/telegram/unlink        — remove Telegram link (auth)
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import {
  generateCodeHandler,
  linkTelegramHandler,
  unlinkTelegramHandler,
} from './telegram.controller.js';
// Zod validation occurs in telegram.controller.ts — Fastify schema option uses AJV, not Zod.

/**
 * Registers all Telegram linking routes on the Fastify instance.
 * Must be called from the main app builder (index.ts).
 *
 * @param fastify - The Fastify application instance
 * @returns Promise<void>
 */
export async function telegramRouter(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/telegram/generate-code — generate OTP for linking
  fastify.post('/telegram/generate-code', {
    preHandler: [requireAuth],
  }, generateCodeHandler);

  // POST /api/v1/telegram/link — submit OTP to link Telegram account
  fastify.post('/telegram/link', {
    preHandler: [requireAuth],
  }, linkTelegramHandler);

  // DELETE /api/v1/telegram/unlink — revoke Telegram access
  fastify.delete('/telegram/unlink', {
    preHandler: [requireAuth],
  }, unlinkTelegramHandler);
}
