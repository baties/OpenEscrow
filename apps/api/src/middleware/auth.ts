/**
 * middleware/auth.ts — OpenEscrow API
 *
 * Handles: JWT verification on protected routes. Attaches the decoded user payload
 *          to request context for downstream handlers and services.
 * Does NOT: issue JWTs (see modules/auth/verify.ts), enforce role-based access
 *            (see role-check.ts), or interact with the database.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'middleware.auth' });

/**
 * The shape of the JWT payload issued by the auth/verify endpoint.
 * Attached to `request.user` after successful verification.
 */
export interface JwtPayload {
  /** Database user UUID. */
  userId: string;
  /** Lowercase EVM wallet address. */
  walletAddress: string;
}

/**
 * Fastify preHandler hook that verifies the Bearer JWT on protected routes.
 * Attaches the decoded payload to `request.user`.
 * Returns 401 if the token is missing, expired, or invalid.
 *
 * @param request - Fastify request object (must have jwtVerify from @fastify/jwt)
 * @param reply - Fastify reply object (used to send 401 on failure)
 * @returns Promise<void> — resolves if auth passes, sends reply on failure
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify<JwtPayload>();
  } catch (err) {
    log.warn(
      {
        module: 'middleware.auth',
        operation: 'requireAuth',
        path: request.url,
        error: err instanceof Error ? err.message : String(err),
      },
      'JWT verification failed'
    );

    await reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Valid JWT token required',
    });
  }
}

// Extend @fastify/jwt types to declare our JWT payload shape.
// This makes request.user typed as JwtPayload across all handlers.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: JwtPayload;
  }
}
