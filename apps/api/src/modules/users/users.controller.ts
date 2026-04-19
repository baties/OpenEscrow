/**
 * modules/users/users.controller.ts — OpenEscrow API
 *
 * Handles: HTTP handler functions for user profile routes.
 *          getMeHandler  — GET /api/v1/users/me
 *          updateUsernameHandler — PATCH /api/v1/users/me/username
 * Does NOT: contain business logic (see users.service.ts),
 *            manage authentication state.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getUserProfile, updateUsername } from './users.service.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'users.controller' });

/**
 * Zod schema for the username update request body.
 * 4–10 characters, alphanumeric only (no spaces or special chars).
 */
const UpdateUsernameSchema = z.object({
  username: z
    .string()
    .min(4, 'Username must be at least 4 characters')
    .max(10, 'Username must be at most 10 characters')
    .regex(/^[a-zA-Z0-9]+$/, 'Username may only contain letters and digits'),
});

/**
 * GET /api/v1/users/me
 * Returns the authenticated user's profile.
 *
 * @param request - Fastify request (auth payload injected by requireAuth)
 * @param reply - Fastify reply
 * @returns 200 with profile object
 */
export async function getMeHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (request as any).user?.userId as string;
  const chatId = undefined; // HTTP context — no chat ID

  log.info(
    { module: 'users.controller', operation: 'getMeHandler', userId },
    'Fetching user profile'
  );

  try {
    const profile = await getUserProfile(userId);
    return reply.code(200).send(profile);
  } catch (err) {
    if (err instanceof AppError) {
      log.error(
        { module: 'users.controller', operation: 'getMeHandler', userId, error: err.message },
        'Failed to fetch user profile'
      );
      return reply.code(err.code === 'USER_NOT_FOUND' ? 404 : 500).send({
        error: err.code,
        message: err.message,
      });
    }
    log.error(
      {
        module: 'users.controller',
        operation: 'getMeHandler',
        userId,
        chatId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error in GET /users/me'
    );
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

/**
 * PATCH /api/v1/users/me/username
 * Updates the authenticated user's platform username.
 * Body: { username: string } — 4–10 alphanumeric characters, unique.
 *
 * @param request - Fastify request with username in body
 * @param reply - Fastify reply
 * @returns 200 with { username } on success
 */
export async function updateUsernameHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (request as any).user?.userId as string;

  log.info(
    { module: 'users.controller', operation: 'updateUsernameHandler', userId },
    'Updating platform username'
  );

  const parseResult = UpdateUsernameSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.code(400).send({
      error: 'VALIDATION_ERROR',
      message: parseResult.error.issues[0]?.message ?? 'Invalid request body',
    });
  }

  const { username } = parseResult.data;

  try {
    await updateUsername(userId, username);
    return reply.code(200).send({ username });
  } catch (err) {
    if (err instanceof AppError) {
      log.error(
        {
          module: 'users.controller',
          operation: 'updateUsernameHandler',
          userId,
          error: err.message,
        },
        'Failed to update username'
      );
      const statusCode = err.code === 'USERNAME_TAKEN' ? 409 : 500;
      return reply.code(statusCode).send({ error: err.code, message: err.message });
    }
    log.error(
      {
        module: 'users.controller',
        operation: 'updateUsernameHandler',
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Unexpected error in PATCH /users/me/username'
    );
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}
