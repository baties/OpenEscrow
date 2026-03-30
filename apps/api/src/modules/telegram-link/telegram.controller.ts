/**
 * modules/telegram-link/telegram.controller.ts — OpenEscrow API
 *
 * Handles: HTTP request/response logic for Telegram linking endpoints.
 *          Delegates all business logic to telegram.service.ts.
 * Does NOT: contain business logic, interact with the database directly,
 *            or interact with the Telegram Bot API.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as telegramService from './telegram.service.js';
import { LinkTelegramSchema } from './telegram.schema.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

const log = logger.child({ module: 'telegram.controller' });

/**
 * POST /api/v1/telegram/generate-code
 * Generates a 15-minute OTP for linking a Telegram account.
 * Only authenticated (wallet-signed-in) users can generate codes.
 *
 * @param request - Fastify request with user JWT
 * @param reply - Fastify reply
 * @returns 200 with { oneTimeCode, expiresAt }
 */
export async function generateCodeHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user.userId;

  log.info(
    {
      module: 'telegram.controller',
      operation: 'generateCodeHandler',
      userId,
    },
    'Handling generate-code request'
  );

  const result = await telegramService.generateLinkCode(userId);
  await reply.status(200).send({
    oneTimeCode: result.oneTimeCode,
    expiresAt: result.expiresAt.toISOString(),
    message: 'Send this code to the OpenEscrow Telegram bot via /link <code>',
  });
}

/**
 * POST /api/v1/telegram/link
 * Verifies the OTP and links the Telegram user ID to the authenticated wallet account.
 * Called by the web dashboard after the user has sent the code to the bot.
 *
 * @param request - Fastify request with body (LinkTelegramInput) and user JWT
 * @param reply - Fastify reply
 * @returns 200 with success message
 */
export async function linkTelegramHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = LinkTelegramSchema.safeParse(request.body);
  if (!parsed.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    });
    return;
  }

  const userId = request.user.userId;

  log.info(
    {
      module: 'telegram.controller',
      operation: 'linkTelegramHandler',
      userId,
    },
    'Handling link-telegram request'
  );

  await telegramService.linkTelegram(userId, parsed.data);
  await reply.status(200).send({ success: true, message: 'Telegram account linked successfully' });
}

/**
 * DELETE /api/v1/telegram/unlink
 * Removes the Telegram link from the authenticated user's account.
 * Revokes bot access immediately.
 *
 * @param request - Fastify request with user JWT
 * @param reply - Fastify reply
 * @returns 200 with success message
 */
export async function unlinkTelegramHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user.userId;

  log.info(
    {
      module: 'telegram.controller',
      operation: 'unlinkTelegramHandler',
      userId,
    },
    'Handling unlink-telegram request'
  );

  await telegramService.unlinkTelegram(userId);
  await reply
    .status(200)
    .send({ success: true, message: 'Telegram account unlinked successfully' });
}

/**
 * GET /api/v1/telegram/status
 * Returns whether the authenticated user has a Telegram account linked,
 * along with the linked Telegram user ID and the time it was linked.
 *
 * @param request - Fastify request with user JWT
 * @param reply - Fastify reply
 * @returns 200 with { linked, telegramUserId, linkedAt }
 */
export async function getStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user.userId;

  log.info(
    {
      module: 'telegram.controller',
      operation: 'getStatusHandler',
      userId,
    },
    'Handling get-status request'
  );

  const status = await telegramService.getTelegramStatus(userId);
  await reply.status(200).send(status);
}

/**
 * GET /api/v1/telegram/bot-sessions
 * Returns all Telegram user IDs currently linked to a wallet account.
 * Authenticated via the X-Bot-Secret header.
 * Used by the bot on startup to restore sessions from the database.
 *
 * @param request - Fastify request with X-Bot-Secret header
 * @param reply - Fastify reply
 * @returns 200 with { telegramUserIds: string[] }
 * @returns 401 if bot secret is wrong
 */
export async function getAllBotSessionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const botSecret = (request.headers as Record<string, string | undefined>)['x-bot-secret'];
  if (!botSecret || botSecret !== env.BOT_API_SECRET) {
    log.warn(
      { module: 'telegram.controller', operation: 'getAllBotSessionsHandler' },
      'Rejected get-all-bot-sessions request: invalid or missing X-Bot-Secret'
    );
    await reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid bot secret' });
    return;
  }

  log.info(
    { module: 'telegram.controller', operation: 'getAllBotSessionsHandler' },
    'Handling get-all-bot-sessions request'
  );

  const telegramUserIds = await telegramService.getAllLinkedTelegramUsers();
  await reply.status(200).send({ telegramUserIds });
}

/**
 * POST /api/v1/telegram/bot-session
 * Issues a JWT for a linked Telegram user.
 * Authenticated via the X-Bot-Secret header (must match BOT_API_SECRET env var).
 * Used by the Telegram bot to obtain user JWTs after the web-based linking flow.
 *
 * @param request - Fastify request with X-Bot-Secret header and body { telegramUserId }
 * @param reply - Fastify reply
 * @returns 200 with { token, userId, walletAddress }
 * @returns 401 if bot secret is wrong
 * @returns 404 if no user is linked with this Telegram ID
 */
export async function getBotSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Authenticate via shared bot secret header.
  const botSecret = (request.headers as Record<string, string | undefined>)['x-bot-secret'];
  if (!botSecret || botSecret !== env.BOT_API_SECRET) {
    log.warn(
      {
        module: 'telegram.controller',
        operation: 'getBotSessionHandler',
      },
      'Rejected bot-session request: invalid or missing X-Bot-Secret'
    );
    await reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid bot secret' });
    return;
  }

  const body = request.body as { telegramUserId?: unknown };
  if (typeof body?.telegramUserId !== 'string' || !body.telegramUserId) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'telegramUserId (string) is required',
    });
    return;
  }

  log.info(
    {
      module: 'telegram.controller',
      operation: 'getBotSessionHandler',
    },
    'Handling bot-session request'
  );

  const user = await telegramService.getUserByTelegramId(body.telegramUserId);
  if (!user) {
    await reply.status(404).send({
      error: 'NOT_LINKED',
      message: 'No user is linked with this Telegram ID',
    });
    return;
  }

  // Issue a JWT using the same Fastify JWT plugin as the SIWE auth flow.
  const token = request.server.jwt.sign({
    userId: user.userId,
    walletAddress: user.walletAddress,
  });

  log.info(
    {
      module: 'telegram.controller',
      operation: 'getBotSessionHandler',
      userId: user.userId,
    },
    'Bot session JWT issued'
  );

  await reply.status(200).send({
    token,
    userId: user.userId,
    walletAddress: user.walletAddress,
  });
}
