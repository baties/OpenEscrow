/**
 * modules/milestones/milestones.router.ts — OpenEscrow API
 *
 * Handles: Registering all milestone-related routes with Fastify.
 *          Applies auth middleware and role checks per route.
 * Does NOT: contain business logic (see milestones.service.ts),
 *            perform validation beyond route-level schema (Zod schemas in milestones.schema.ts).
 *
 * Routes registered:
 *   POST /api/v1/milestones/:id/submit   — submit deliverables (auth + freelancer of deal)
 *   POST /api/v1/milestones/:id/approve  — approve milestone (auth + client of deal)
 *   POST /api/v1/milestones/:id/reject   — reject milestone (auth + client of deal)
 *
 * Role enforcement for milestones requires looking up the parent deal.
 * The milestone-level role check is handled in the service layer via deal lookup,
 * and enforced via the milestoneRoleCheck middleware below.
 */

import type { FastifyInstance } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../../middleware/auth.js';
import { db } from '../../database/index.js';
import { milestones, deals } from '../../database/schema.js';
import { logger } from '../../lib/logger.js';
import {
  submitMilestoneHandler,
  approveMilestoneHandler,
  rejectMilestoneHandler,
} from './milestones.controller.js';
// Zod schemas imported for reference — validation occurs in controller handlers.
// Fastify's schema option uses AJV (JSON Schema), not Zod.

const log = logger.child({ module: 'milestones.router' });

type MilestoneRole = 'client' | 'freelancer';

/**
 * Creates a preHandler that resolves the parent deal of a milestone
 * and enforces the required role (client or freelancer).
 * Requires `requireAuth` to have already run.
 *
 * @param role - 'client' or 'freelancer'
 * @returns Fastify preHandler function
 */
function requireMilestoneRole(role: MilestoneRole) {
  return async function checkMilestoneRole(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const milestoneId = request.params.id;
    const userId = request.user.userId;

    try {
      const [milestone] = await db
        .select({ dealId: milestones.dealId })
        .from(milestones)
        .where(eq(milestones.id, milestoneId))
        .limit(1);

      if (!milestone) {
        await reply.status(404).send({
          error: 'MILESTONE_NOT_FOUND',
          message: `Milestone ${milestoneId} not found`,
        });
        return;
      }

      const [deal] = await db
        .select({ clientId: deals.clientId, freelancerId: deals.freelancerId })
        .from(deals)
        .where(eq(deals.id, milestone.dealId))
        .limit(1);

      if (!deal) {
        await reply.status(404).send({
          error: 'DEAL_NOT_FOUND',
          message: 'Parent deal not found',
        });
        return;
      }

      const allowed = role === 'client' ? deal.clientId === userId : deal.freelancerId === userId;

      if (!allowed) {
        log.warn(
          {
            module: 'milestones.router',
            operation: 'checkMilestoneRole',
            milestoneId,
            userId,
            requiredRole: role,
          },
          'Milestone role check failed'
        );

        await reply.status(403).send({
          error: 'FORBIDDEN',
          message: `This action requires the ${role} role`,
        });
      }
    } catch (err) {
      log.error(
        {
          module: 'milestones.router',
          operation: 'checkMilestoneRole',
          milestoneId,
          userId,
          error: err instanceof Error ? err.message : String(err),
        },
        'Milestone role check database error'
      );

      await reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Role verification failed',
      });
    }
  };
}

/**
 * Registers all milestone routes on the Fastify instance.
 * Must be called from the main app builder (index.ts).
 *
 * @param fastify - The Fastify application instance
 * @returns Promise<void>
 */
export async function milestonesRouter(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/milestones/:id/submit — freelancer submits milestone
  fastify.post<{ Params: { id: string } }>(
    '/milestones/:id/submit',
    {
      preHandler: [requireAuth, requireMilestoneRole('freelancer')],
    },
    submitMilestoneHandler
  );

  // POST /api/v1/milestones/:id/approve — client approves milestone
  fastify.post<{ Params: { id: string } }>(
    '/milestones/:id/approve',
    {
      preHandler: [requireAuth, requireMilestoneRole('client')],
    },
    approveMilestoneHandler
  );

  // POST /api/v1/milestones/:id/reject — client rejects milestone
  fastify.post<{ Params: { id: string } }>(
    '/milestones/:id/reject',
    {
      preHandler: [requireAuth, requireMilestoneRole('client')],
    },
    rejectMilestoneHandler
  );
}
