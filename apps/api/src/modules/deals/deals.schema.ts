/**
 * modules/deals/deals.schema.ts — OpenEscrow API
 *
 * Handles: Zod validation schemas for all deal-related API request bodies and parameters.
 *          Every route input is validated against these schemas before reaching the service layer.
 * Does NOT: contain business logic, database queries, or HTTP handler logic.
 */

import { z } from 'zod';

/**
 * Schema for a single milestone when creating a deal.
 * All fields are required; amount must be a positive numeric string (BigInt safe).
 */
export const CreateMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  acceptanceCriteria: z.string().min(1).max(2000),
  /** Amount as a positive integer string (wei / token units). */
  amount: z
    .string()
    .regex(/^\d+$/, 'amount must be a positive integer string')
    .refine((v) => BigInt(v) > 0n, 'amount must be greater than 0'),
});

/**
 * Schema for the POST /api/v1/deals request body.
 * At least one milestone is required; token address must be a valid EVM address.
 */
export const CreateDealSchema = z.object({
  /** EVM wallet address of the freelancer (0x-prefixed, 40 hex chars). */
  freelancerAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'freelancerAddress must be a valid EVM address'),
  /** Token contract address (must be USDC or USDT on the configured chain). */
  tokenAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'tokenAddress must be a valid EVM address'),
  /** Ordered list of milestones. Minimum 1, maximum 20. */
  milestones: z
    .array(CreateMilestoneSchema)
    .min(1, 'At least one milestone is required')
    .max(20, 'Maximum 20 milestones allowed'),
});

/**
 * Schema for the POST /api/v1/deals/:id/fund request body.
 * Records the on-chain transaction hash after the client deposits funds.
 */
export const FundDealSchema = z.object({
  /** Transaction hash of the deposit on-chain (0x-prefixed, 64 hex chars). */
  transactionHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'transactionHash must be a valid 32-byte hex hash'),
  /** On-chain deal ID returned by the contract's createDeal function. */
  chainDealId: z
    .string()
    .regex(/^\d+$/, 'chainDealId must be a non-negative integer string'),
});

/**
 * Schema for deal route params (all deal routes use :id).
 */
export const DealParamsSchema = z.object({
  id: z.string().uuid('Deal ID must be a valid UUID'),
});

export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export type FundDealInput = z.infer<typeof FundDealSchema>;
export type DealParams = z.infer<typeof DealParamsSchema>;
