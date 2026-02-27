/**
 * middleware/role-check.ts — OpenEscrow API
 *
 * Handles: Role-based access enforcement for deal-scoped routes.
 *          Ensures only the client or freelancer for a specific deal can perform role-gated actions.
 * Does NOT: issue tokens, verify JWT signatures (see auth.ts),
 *            or perform business logic beyond "is this user the client/freelancer?".
 *
 * Role enforcement is centralised here to keep service layers free of auth concerns.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { deals } from '../database/schema.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'middleware.role-check' });

/**
 * Role identifiers used in deal-scoped authorization.
 */
export type DealRole = 'client' | 'freelancer' | 'participant';

/**
 * Creates a Fastify preHandler that enforces the caller's role for a specific deal.
 * Reads the deal from the database and compares `deal.clientId` or `deal.freelancerId`
 * against `request.user.userId`.
 *
 * Assumes `requireAuth` has already run and `request.user` is populated.
 * Assumes the deal ID is in `request.params.id`.
 *
 * @param role - 'client', 'freelancer', or 'participant' (either role)
 * @returns Fastify preHandler function
 *
 * @example
 * router.post('/:id/agree', { preHandler: [requireAuth, requireRole('freelancer')] }, handler);
 */
export function requireRole(role: DealRole) {
  return async function checkRole(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const dealId = request.params.id;
    const userId = request.user.userId;

    try {
      const [deal] = await db
        .select({ clientId: deals.clientId, freelancerId: deals.freelancerId })
        .from(deals)
        .where(eq(deals.id, dealId))
        .limit(1);

      if (!deal) {
        await reply.status(404).send({
          error: 'DEAL_NOT_FOUND',
          message: `Deal ${dealId} not found`,
        });
        return;
      }

      const isClient = deal.clientId === userId;
      const isFreelancer = deal.freelancerId === userId;

      let allowed = false;
      if (role === 'client') allowed = isClient;
      else if (role === 'freelancer') allowed = isFreelancer;
      else if (role === 'participant') allowed = isClient || isFreelancer;

      if (!allowed) {
        log.warn({
          module: 'middleware.role-check',
          operation: 'checkRole',
          dealId,
          userId,
          requiredRole: role,
          isClient,
          isFreelancer,
        }, 'Role check failed');

        await reply.status(403).send({
          error: 'FORBIDDEN',
          message: `This action requires the ${role} role for deal ${dealId}`,
        });
      }
    } catch (err) {
      log.error({
        module: 'middleware.role-check',
        operation: 'checkRole',
        dealId,
        userId,
        requiredRole: role,
        error: err instanceof Error ? err.message : String(err),
      }, 'Role check database error');

      await reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Role verification failed',
      });
    }
  };
}
