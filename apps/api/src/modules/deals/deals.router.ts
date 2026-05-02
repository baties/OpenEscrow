/**
 * modules/deals/deals.router.ts — OpenEscrow API
 *
 * Handles: Registering all deal-related routes with Fastify.
 *          Applies auth middleware and role checks per route.
 * Does NOT: contain business logic (see deals.service.ts),
 *            perform validation beyond route-level schema (Zod schemas in deals.schema.ts).
 *
 * Routes registered:
 *   GET    /api/v1/deals               — list deals (auth)
 *   POST   /api/v1/deals               — create deal (auth + client)
 *   GET    /api/v1/deals/:id           — get deal detail (auth + participant)
 *   POST   /api/v1/deals/:id/agree     — agree to deal (auth + freelancer)
 *   POST   /api/v1/deals/:id/fund      — fund deal (auth + client)
 *   POST   /api/v1/deals/:id/cancel    — cancel deal (auth + participant)
 *   GET    /api/v1/deals/:id/timeline  — deal timeline (auth + participant)
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role-check.js';
import {
  createDealHandler,
  listDealsHandler,
  getDealHandler,
  agreeToDealHandler,
  fundDealHandler,
  cancelDealHandler,
  getDealTimelineHandler,
} from './deals.controller.js';
// Note: Zod validation is performed manually in each controller handler.
// Fastify's built-in schema option uses AJV (JSON Schema), not Zod.
// See deals.controller.ts for input validation via safeParse().

/**
 * Registers all deal routes on the Fastify instance.
 * Must be called from the main app builder (index.ts).
 *
 * @param fastify - The Fastify application instance
 * @returns Promise<void>
 */
export async function dealsRouter(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/deals — list deals for authenticated user
  fastify.get(
    '/deals',
    {
      preHandler: [requireAuth],
    },
    listDealsHandler
  );

  // POST /api/v1/deals — create a new deal (client role)
  fastify.post(
    '/deals',
    {
      preHandler: [requireAuth],
    },
    createDealHandler
  );

  // GET /api/v1/deals/:id — get deal detail (any participant)
  fastify.get<{ Params: { id: string } }>(
    '/deals/:id',
    {
      preHandler: [requireAuth],
    },
    getDealHandler
  );

  // POST /api/v1/deals/:id/agree — freelancer agrees to deal
  fastify.post<{ Params: { id: string } }>(
    '/deals/:id/agree',
    {
      preHandler: [requireAuth, requireRole('freelancer')],
    },
    agreeToDealHandler
  );

  // POST /api/v1/deals/:id/fund — client records on-chain funding
  fastify.post<{ Params: { id: string } }>(
    '/deals/:id/fund',
    {
      preHandler: [requireAuth, requireRole('client')],
    },
    fundDealHandler
  );

  // POST /api/v1/deals/:id/cancel — either party cancels the deal
  fastify.post<{ Params: { id: string } }>(
    '/deals/:id/cancel',
    {
      preHandler: [requireAuth, requireRole('participant')],
    },
    cancelDealHandler
  );

  // GET /api/v1/deals/:id/timeline — deal audit trail
  fastify.get<{ Params: { id: string }; Querystring: { includeMessages?: string } }>(
    '/deals/:id/timeline',
    {
      preHandler: [requireAuth],
    },
    getDealTimelineHandler
  );
}
