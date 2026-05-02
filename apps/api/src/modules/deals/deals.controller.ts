/**
 * modules/deals/deals.controller.ts — OpenEscrow API
 *
 * Handles: HTTP request/response logic for deal-related endpoints.
 *          Validates inputs, calls service layer, formats responses.
 * Does NOT: contain business logic (see deals.service.ts),
 *            interact with the database directly, or enforce roles
 *            (role enforcement is in middleware/role-check.ts and deals.router.ts).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as dealsService from './deals.service.js';
import { CreateDealSchema, FundDealSchema } from './deals.schema.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'deals.controller' });

/**
 * POST /api/v1/deals
 * Creates a new deal. Caller must be authenticated (client role implied by auth).
 *
 * @param request - Fastify request with validated body (CreateDealInput) and user JWT
 * @param reply - Fastify reply
 * @returns 201 with created deal + milestones
 */
export async function createDealHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const parsed = CreateDealSchema.safeParse(request.body);
  if (!parsed.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    });
    return;
  }

  const clientId = request.user.userId;

  log.info(
    {
      module: 'deals.controller',
      operation: 'createDealHandler',
      clientId,
    },
    'Handling create deal request'
  );

  const deal = await dealsService.createDeal(clientId, parsed.data);
  await reply.status(201).send(deal);
}

/**
 * GET /api/v1/deals
 * Lists all deals for the authenticated user (client or freelancer).
 *
 * @param request - Fastify request with user JWT
 * @param reply - Fastify reply
 * @returns 200 with array of deal objects
 */
export async function listDealsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user.userId;

  const result = await dealsService.listDeals(userId);
  await reply.status(200).send(result);
}

/**
 * GET /api/v1/deals/:id
 * Returns deal detail including milestones. Both client and freelancer can access.
 * Returns 404 if deal does not exist or caller is not a participant.
 *
 * @param request - Fastify request with params.id and user JWT
 * @param reply - Fastify reply
 * @returns 200 with deal + milestones, or 404
 */
export async function getDealHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const dealId = request.params.id;
  const userId = request.user.userId;

  const deal = await dealsService.getDeal(dealId);
  if (!deal) {
    await reply.status(404).send({
      error: 'DEAL_NOT_FOUND',
      message: `Deal ${dealId} not found`,
    });
    return;
  }

  // Ensure caller is a participant in this deal.
  if (deal.clientId !== userId && deal.freelancerId !== userId) {
    await reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You are not a participant in this deal',
    });
    return;
  }

  await reply.status(200).send(deal);
}

/**
 * POST /api/v1/deals/:id/agree
 * Freelancer confirms the deal terms. Transitions DRAFT → AGREED.
 *
 * @param request - Fastify request with params.id and freelancer JWT
 * @param reply - Fastify reply
 * @returns 200 with updated deal, or 400 on invalid transition
 */
export async function agreeToDealHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const dealId = request.params.id;
  const freelancerId = request.user.userId;

  const deal = await dealsService.agreeToDeal(dealId, freelancerId);
  await reply.status(200).send(deal);
}

/**
 * POST /api/v1/deals/:id/fund
 * Client records on-chain funding. Transitions AGREED → FUNDED.
 *
 * @param request - Fastify request with params.id, body (FundDealInput), and client JWT
 * @param reply - Fastify reply
 * @returns 200 with updated deal, or 400 on invalid transition
 */
export async function fundDealHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const parsed = FundDealSchema.safeParse(request.body);
  if (!parsed.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    });
    return;
  }

  const dealId = request.params.id;
  const clientId = request.user.userId;

  const deal = await dealsService.fundDeal(dealId, clientId, parsed.data);
  await reply.status(200).send(deal);
}

/**
 * POST /api/v1/deals/:id/cancel
 * Either party cancels the deal. Refund rules from CLAUDE.md Section C are applied.
 *
 * @param request - Fastify request with params.id and actor JWT
 * @param reply - Fastify reply
 * @returns 200 with cancelled deal, or 400 on invalid transition
 */
export async function cancelDealHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  const dealId = request.params.id;
  const actorId = request.user.userId;

  const deal = await dealsService.cancelDeal(dealId, actorId);
  await reply.status(200).send(deal);
}

/**
 * GET /api/v1/deals/:id/timeline
 * Returns the full ordered audit trail for a deal (deal_events table).
 *
 * @param request - Fastify request with params.id and user JWT
 * @param reply - Fastify reply
 * @returns 200 with array of DealEvent objects
 */
export async function getDealTimelineHandler(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { includeMessages?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const dealId = request.params.id;
  const userId = request.user.userId;
  const includeMessages = request.query.includeMessages === 'true';

  // Verify caller is a participant before returning timeline.
  const deal = await dealsService.getDeal(dealId);
  if (!deal) {
    await reply.status(404).send({
      error: 'DEAL_NOT_FOUND',
      message: `Deal ${dealId} not found`,
    });
    return;
  }

  if (deal.clientId !== userId && deal.freelancerId !== userId) {
    await reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'You are not a participant in this deal',
    });
    return;
  }

  const timeline = await dealsService.getDealTimeline(dealId, includeMessages);
  await reply.status(200).send(timeline);
}
