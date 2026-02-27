/**
 * siwe.ts — OpenEscrow Web Dashboard
 *
 * SIWE (Sign-In With Ethereum) message construction helpers.
 * Handles: building EIP-4361 compliant SIWE message strings for wallet signing.
 * Does NOT: perform signing (that's the wallet's job), call the API,
 *            or store any auth state.
 *
 * Dependency: siwe — EIP-4361 message construction and parsing.
 * Why: siwe is the standard library for this purpose, maintained by the
 *      EIP-4361 authors. Security impact: low (no private key handling).
 *      Bundle cost: ~12KB minified+gzipped, acceptable for auth flow.
 */

import { SiweMessage } from 'siwe';

/**
 * Input parameters for building a SIWE message.
 */
export interface BuildSiweMessageParams {
  /** Wallet address performing the sign-in (checksummed EIP-55 format) */
  address: string;
  /** Chain ID of the network the wallet is connected to */
  chainId: number;
  /** Nonce received from the API via POST /auth/nonce — prevents replay attacks */
  nonce: string;
}

/**
 * Builds an EIP-4361 compliant SIWE message string ready for wallet signing.
 * The resulting string must be passed to wallet.signMessage() and then the
 * signature submitted to POST /api/v1/auth/verify together with the message.
 *
 * @param params - Address, chainId, and nonce for the SIWE message
 * @returns The formatted SIWE message string
 */
export function buildSiweMessage(params: BuildSiweMessageParams): string {
  const { address, chainId, nonce } = params;

  const message = new SiweMessage({
    domain: typeof window !== 'undefined' ? window.location.host : 'localhost',
    address,
    statement: 'Sign in to OpenEscrow — Milestone-based Escrow for Web3',
    uri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
    // 10-minute expiry to prevent replay attacks on stale signatures
    expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  return message.prepareMessage();
}
