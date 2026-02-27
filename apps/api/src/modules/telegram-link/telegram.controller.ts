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
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user.userId;

  log.info({
    module: 'telegram.controller',
    operation: 'generateCodeHandler',
    userId,
  }, 'Handling generate-code request');

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
  reply: FastifyReply,
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

  log.info({
    module: 'telegram.controller',
    operation: 'linkTelegramHandler',
    userId,
  }, 'Handling link-telegram request');

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
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user.userId;

  log.info({
    module: 'telegram.controller',
    operation: 'unlinkTelegramHandler',
    userId,
  }, 'Handling unlink-telegram request');

  await telegramService.unlinkTelegram(userId);
  await reply.status(200).send({ success: true, message: 'Telegram account unlinked successfully' });
}
