/**
 * modules/milestones/milestones.controller.ts — OpenEscrow API
 *
 * Handles: HTTP request/response logic for milestone endpoints.
 *          Delegates all business logic to milestones.service.ts.
 * Does NOT: contain business logic, interact with the database directly,
 *            enforce role-based access (role enforcement is in milestones.router.ts).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as milestonesService from './milestones.service.js';
import { SubmitMilestoneSchema, RejectMilestoneSchema } from './milestones.schema.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'milestones.controller' });

/**
 * POST /api/v1/milestones/:id/submit
 * Freelancer submits milestone deliverables. Transitions PENDING/REVISION → SUBMITTED.
 *
 * @param request - Fastify request with params.id, body (SubmitMilestoneInput), and freelancer JWT
 * @param reply - Fastify reply
 * @returns 200 with created submission record
 */
export async function submitMilestoneHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const parsed = SubmitMilestoneSchema.safeParse(request.body);
  if (!parsed.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    });
    return;
  }

  const milestoneId = request.params.id;
  const freelancerId = request.user.userId;

  log.info({
    module: 'milestones.controller',
    operation: 'submitMilestoneHandler',
    milestoneId,
    freelancerId,
  }, 'Handling milestone submit request');

  const submission = await milestonesService.submitMilestone(milestoneId, freelancerId, parsed.data);
  await reply.status(200).send(submission);
}

/**
 * POST /api/v1/milestones/:id/approve
 * Client approves a submitted milestone. Transitions SUBMITTED → APPROVED.
 * If all milestones are approved, auto-transitions deal to COMPLETED.
 *
 * @param request - Fastify request with params.id and client JWT
 * @param reply - Fastify reply
 * @returns 200 with updated milestone record
 */
export async function approveMilestoneHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const milestoneId = request.params.id;
  const clientId = request.user.userId;

  log.info({
    module: 'milestones.controller',
    operation: 'approveMilestoneHandler',
    milestoneId,
    clientId,
  }, 'Handling milestone approve request');

  const milestone = await milestonesService.approveMilestone(milestoneId, clientId);
  await reply.status(200).send(milestone);
}

/**
 * POST /api/v1/milestones/:id/reject
 * Client rejects a submitted milestone with structured reasons.
 * Transitions SUBMITTED → REJECTED → REVISION (auto).
 *
 * @param request - Fastify request with params.id, body (RejectMilestoneInput), and client JWT
 * @param reply - Fastify reply
 * @returns 200 with created rejection note record
 */
export async function rejectMilestoneHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const parsed = RejectMilestoneSchema.safeParse(request.body);
  if (!parsed.success) {
    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parsed.error.flatten(),
    });
    return;
  }

  const milestoneId = request.params.id;
  const clientId = request.user.userId;

  log.info({
    module: 'milestones.controller',
    operation: 'rejectMilestoneHandler',
    milestoneId,
    clientId,
  }, 'Handling milestone reject request');

  const rejectionNote = await milestonesService.rejectMilestone(milestoneId, clientId, parsed.data);
  await reply.status(200).send(rejectionNote);
}
