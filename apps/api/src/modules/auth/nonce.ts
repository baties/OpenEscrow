/**
 * modules/auth/nonce.ts — OpenEscrow API
 *
 * Handles: Generating and storing SIWE (Sign-In With Ethereum) nonces for wallet authentication.
 *          Nonces are single-use random strings that prevent replay attacks.
 * Does NOT: verify signatures (see verify.ts), issue JWTs, or manage sessions.
 *
 * The nonce is stored in a short-lived in-memory Map keyed by wallet address.
 * For production scale this should be moved to Redis, but for single-server MVP
 * an in-memory store with TTL cleanup is sufficient.
 */

import { randomBytes } from 'crypto';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'modules.auth.nonce' });

/**
 * In-memory nonce store: walletAddress (lowercase) → { nonce, expiresAt }.
 * TTL: 5 minutes. Cleaned up on every read.
 *
 * Decision: In-memory is acceptable for the single-server MVP deployment.
 * Post-MVP: Replace with Redis for multi-instance support.
 */
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generates a cryptographically random nonce for a given wallet address,
 * stores it in the in-memory TTL map, and returns the nonce string.
 * Overwrites any existing nonce for the same address.
 *
 * @param walletAddress - Lowercase EVM wallet address (0x...)
 * @returns The generated nonce string (16 bytes hex = 32 chars)
 */
export function generateNonce(walletAddress: string): string {
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + NONCE_TTL_MS;
  nonceStore.set(walletAddress.toLowerCase(), { nonce, expiresAt });

  log.info({
    module: 'modules.auth.nonce',
    operation: 'generateNonce',
    walletAddress: walletAddress.toLowerCase(),
  }, 'Nonce generated');

  return nonce;
}

/**
 * Retrieves and validates the nonce for a wallet address.
 * Returns null if the nonce does not exist or has expired.
 * Expired entries are cleaned up on access.
 *
 * @param walletAddress - Lowercase EVM wallet address (0x...)
 * @returns The stored nonce string, or null if not found / expired
 */
export function getNonce(walletAddress: string): string | null {
  const key = walletAddress.toLowerCase();
  const entry = nonceStore.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(key);
    log.warn({
      module: 'modules.auth.nonce',
      operation: 'getNonce',
      walletAddress: key,
    }, 'Nonce expired');
    return null;
  }

  return entry.nonce;
}

/**
 * Consumes (removes) the nonce for a wallet address after successful verification.
 * Must be called after a nonce is verified to prevent replay attacks.
 *
 * @param walletAddress - Lowercase EVM wallet address (0x...)
 */
export function consumeNonce(walletAddress: string): void {
  nonceStore.delete(walletAddress.toLowerCase());
}
