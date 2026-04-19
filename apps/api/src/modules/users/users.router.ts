/**
 * modules/users/users.router.ts — OpenEscrow API
 *
 * Handles: Registering user profile routes under /api/v1/users.
 * Does NOT: contain business logic (see users.service.ts), perform authentication
 *            (enforced by requireAuth preHandler from middleware).
 *
 * Routes registered:
 *   PATCH /api/v1/users/me/username — update the current user's platform username
 *   GET   /api/v1/users/me          — get current user profile (username, etc.)
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { updateUsernameHandler, getMeHandler } from './users.controller.js';

/**
 * Registers all user profile routes on the Fastify instance.
 *
 * @param fastify - Fastify instance to register routes on
 * @returns Promise<void>
 */
export async function usersRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/users/me', { preHandler: [requireAuth] }, getMeHandler);
  fastify.patch('/users/me/username', { preHandler: [requireAuth] }, updateUsernameHandler);
}
