/**
 * schemas.ts — OpenEscrow Web Dashboard
 *
 * Zod validation schemas for all client-side form inputs.
 * Handles: field-level validation before API submission, error message generation.
 * Does NOT: perform API calls, interact with auth state, or contain React components.
 *
 * Every form in the web app MUST validate its input via a schema from this file
 * before calling the API client. This prevents invalid requests from reaching
 * the API and gives users immediate feedback.
 *
 * Dependency: zod — schema validation.
 * Why: specified in CLAUDE.md Section E as the validation library for the project.
 * Security: prevents malformed inputs from being sent to the API.
 * Bundle cost: ~14KB minified+gzipped.
 */

import { z } from 'zod';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates that a string is a valid Ethereum address (starts with 0x, 42 chars).
 * Does NOT checksum-validate — the API is authoritative on that.
 */
const ethereumAddress = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid Ethereum address (0x followed by 40 hex chars)');

/**
 * Validates that a string represents a positive decimal number suitable as a token amount.
 * USDC/USDT amounts must be > 0 and have at most 6 decimal places.
 */
const tokenAmount = z
  .string()
  .trim()
  .refine(
    (val) => {
      const num = parseFloat(val);
      return Number.isFinite(num) && num > 0;
    },
    { message: 'Amount must be a positive number' }
  )
  .refine(
    (val) => {
      const parts = val.split('.');
      // No decimal or at most 6 decimal places
      return parts.length === 1 || (parts[1]?.length ?? 0) <= 6;
    },
    { message: 'Amount can have at most 6 decimal places' }
  );

/**
 * Validates that a string is a plausible HTTPS or HTTP URL.
 */
const httpUrl = z.string().trim().url('Must be a valid URL');

// ─── Form Schemas ─────────────────────────────────────────────────────────────

/**
 * Schema for a single milestone entry in the create deal form.
 */
export const milestoneInputSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(100, 'Title too long'),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description too long'),
  acceptanceCriteria: z
    .string()
    .trim()
    .min(10, 'Acceptance criteria must be at least 10 characters')
    .max(2000, 'Acceptance criteria too long'),
  amount: tokenAmount,
});

export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

/**
 * Schema for the create deal form (POST /api/v1/deals).
 * Validates freelancer address, token selection, and at least one milestone.
 */
export const createDealSchema = z.object({
  freelancerAddress: ethereumAddress,
  tokenAddress: ethereumAddress,
  milestones: z
    .array(milestoneInputSchema)
    .min(1, 'A deal must have at least one milestone')
    .max(20, 'A deal can have at most 20 milestones'),
});

export type CreateDealFormValues = z.infer<typeof createDealSchema>;

/**
 * Schema for the milestone submission form (POST /api/v1/milestones/:id/submit).
 * Validates summary text and optional delivery links (HTTPS URLs only).
 */
export const submitMilestoneSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(10, 'Summary must be at least 10 characters')
    .max(2000, 'Summary too long'),
  links: z.array(httpUrl).max(10, 'Maximum 10 links allowed').default([]),
});

export type SubmitMilestoneFormValues = z.infer<typeof submitMilestoneSchema>;

/**
 * Schema for the milestone rejection form (POST /api/v1/milestones/:id/reject).
 */
export const REJECTION_REASON_CODES = [
  'INCOMPLETE_DELIVERABLE',
  'DOESNT_MATCH_CRITERIA',
  'BUG_OR_ERROR',
  'POOR_QUALITY',
  'MISSING_DOCUMENTATION',
  'OTHER',
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

export const rejectMilestoneSchema = z.object({
  reasonCodes: z
    .array(z.enum(REJECTION_REASON_CODES))
    .min(1, 'Select at least one rejection reason'),
  freeText: z.string().trim().max(2000, 'Feedback too long').default(''),
});

export type RejectMilestoneFormValues = z.infer<typeof rejectMilestoneSchema>;

/**
 * Schema for the Telegram OTP linking form.
 */
export const telegramLinkSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, 'Code must be at least 6 characters')
    .max(64, 'Code too long')
    .regex(/^[a-zA-Z0-9]+$/, 'Code must be alphanumeric'),
  telegramUserId: z
    .string()
    .trim()
    .min(1, 'Telegram user ID is required')
    .regex(/^\d+$/, 'Telegram user ID must be a numeric ID (shown by the bot)'),
});

export type TelegramLinkFormValues = z.infer<typeof telegramLinkSchema>;

/**
 * Schema for the manual fund deal form.
 * Requires both the deposit tx hash and the on-chain deal ID returned by createDeal().
 */
export const fundDealSchema = z.object({
  /** Deposit transaction hash (0x + 64 hex chars). */
  transactionHash: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a valid transaction hash (0x followed by 64 hex chars)'),
  /** On-chain deal ID — the uint256 returned by the contract createDeal() call. */
  chainDealId: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Must be a positive integer (the deal ID returned by createDeal)'),
});

export type FundDealFormValues = z.infer<typeof fundDealSchema>;
