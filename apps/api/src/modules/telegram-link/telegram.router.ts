/**
 * modules/telegram-link/telegram.router.ts — OpenEscrow API
 *
 * Handles: Registering all Telegram linking routes with Fastify.
 * Does NOT: contain business logic (see telegram.service.ts),
 *            interact with the Telegram Bot API.
 *
 * Routes registered:
 *   POST   /api/v1/telegram/generate-code  — generate 15-min OTP (auth)
 *   POST   /api/v1/telegram/link           — verify OTP, link Telegram ID (auth)
 *   DELETE /api/v1/telegram/unlink         — remove Telegram link (auth)
 *   GET    /api/v1/telegram/status         — get current link status (auth)
 *   GET    /api/v1/telegram/bot-sessions   — list all linked Telegram IDs (X-Bot-Secret)
 *   POST   /api/v1/telegram/bot-session    — issue JWT for linked bot user (X-Bot-Secret)
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import {
  generateCodeHandler,
  linkTelegramHandler,
  unlinkTelegramHandler,
  getStatusHandler,
  getAllBotSessionsHandler,
  getBotSessionHandler,
} from './telegram.controller.js';

/**
 * Registers all Telegram linking routes on the Fastify instance.
 * Must be called from the main app builder (index.ts).
 *
 * @param fastify - The Fastify application instance
 * @returns Promise<void>
 */
export async function telegramRouter(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/telegram/generate-code — generate OTP for linking
  fastify.post(
    '/telegram/generate-code',
    {
      preHandler: [requireAuth],
    },
    generateCodeHandler
  );

  // POST /api/v1/telegram/link — submit OTP to link Telegram account
  fastify.post(
    '/telegram/link',
    {
      preHandler: [requireAuth],
    },
    linkTelegramHandler
  );

  // DELETE /api/v1/telegram/unlink — revoke Telegram access
  fastify.delete(
    '/telegram/unlink',
    {
      preHandler: [requireAuth],
    },
    unlinkTelegramHandler
  );

  // GET /api/v1/telegram/status — check if a Telegram account is linked (auth)
  fastify.get(
    '/telegram/status',
    {
      preHandler: [requireAuth],
    },
    getStatusHandler
  );

  // GET /api/v1/telegram/bot-sessions — list all linked Telegram IDs (X-Bot-Secret header auth)
  // Used by the bot on startup to restore sessions from the database.
  fastify.get('/telegram/bot-sessions', getAllBotSessionsHandler);

  // POST /api/v1/telegram/bot-session — issue JWT for the bot (X-Bot-Secret header auth)
  fastify.post('/telegram/bot-session', getBotSessionHandler);
}
