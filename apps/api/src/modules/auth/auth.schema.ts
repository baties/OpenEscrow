/**
 * modules/auth/auth.schema.ts — OpenEscrow API
 *
 * Handles: Zod validation schemas for SIWE authentication request bodies.
 * Does NOT: contain business logic, database queries, or HTTP handler logic.
 */

import { z } from 'zod';

/**
 * Schema for POST /api/v1/auth/nonce request body.
 * Wallet address must be a valid 0x-prefixed EVM address.
 */
export const GenerateNonceInputSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'walletAddress must be a valid EVM address (0x + 40 hex chars)'),
});

/**
 * Schema for POST /api/v1/auth/verify request body.
 * Both fields are required strings (SIWE message is multi-line, signature is hex).
 */
export const VerifyInputSchema = z.object({
  /** The full SIWE message string as constructed by the frontend. */
  message: z.string().min(1, 'SIWE message is required'),
  /** Hex-encoded ECDSA signature (0x-prefixed). */
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, 'signature must be a hex string'),
});

export type GenerateNonceInput = z.infer<typeof GenerateNonceInputSchema>;
export type VerifyInput = z.infer<typeof VerifyInputSchema>;
