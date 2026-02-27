/**
 * modules/milestones/milestones.schema.ts — OpenEscrow API
 *
 * Handles: Zod validation schemas for milestone-related API request bodies and parameters.
 * Does NOT: contain business logic, database queries, or HTTP handler logic.
 */

import { z } from 'zod';

/**
 * Schema for submitting a milestone deliverable (POST /milestones/:id/submit).
 */
export const SubmitMilestoneSchema = z.object({
  /** Summary of the work done for this milestone. */
  summary: z.string().min(1).max(5000),
  /** Array of URLs pointing to deliverables (GitHub PR, Figma, etc.). Max 20 links. */
  links: z
    .array(z.string().url('Each link must be a valid URL'))
    .max(20, 'Maximum 20 links allowed')
    .default([]),
});

/**
 * Schema for rejecting a milestone submission (POST /milestones/:id/reject).
 * Requires structured reason codes and a free-text explanation.
 */
export const RejectMilestoneSchema = z.object({
  /**
   * Structured rejection reason codes.
   * Short machine-readable strings (e.g. "INCOMPLETE", "QUALITY", "WRONG_SCOPE").
   */
  reasonCodes: z
    .array(z.string().min(1).max(50))
    .min(1, 'At least one reason code is required')
    .max(10, 'Maximum 10 reason codes allowed'),
  /** Human-readable explanation of why the milestone was rejected. */
  freeText: z.string().min(1).max(5000),
});

/**
 * Schema for milestone route params (all milestone routes use :id).
 */
export const MilestoneParamsSchema = z.object({
  id: z.string().uuid('Milestone ID must be a valid UUID'),
});

export type SubmitMilestoneInput = z.infer<typeof SubmitMilestoneSchema>;
export type RejectMilestoneInput = z.infer<typeof RejectMilestoneSchema>;
export type MilestoneParams = z.infer<typeof MilestoneParamsSchema>;
