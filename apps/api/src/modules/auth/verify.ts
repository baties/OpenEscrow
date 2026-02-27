/**
 * modules/auth/verify.ts — OpenEscrow API
 *
 * Handles: SIWE (Sign-In With Ethereum) message verification and JWT issuance.
 *          Upserts the user record on first sign-in. Returns a signed JWT for session auth.
 * Does NOT: generate nonces (see nonce.ts), manage roles, or interact with deals.
 *
 * SIWE flow:
 *   1. Client calls POST /auth/nonce → gets nonce
 *   2. Client builds SIWE message, signs with wallet
 *   3. Client calls POST /auth/verify with { message, signature }
 *   4. API verifies signature, upserts user, issues JWT
 */

import { SiweMessage } from 'siwe';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../database/index.js';
import { users } from '../../database/schema.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { generateNonce, getNonce, consumeNonce } from './nonce.js';

const log = logger.child({ module: 'modules.auth.verify' });

/**
 * Input shape for the nonce generation request.
 */
export interface GenerateNonceInput {
  walletAddress: string;
}

/**
 * Input shape for the SIWE verification request.
 */
export interface VerifyInput {
  message: string;
  signature: string;
}

/**
 * Generates and stores a nonce for the given wallet address.
 * Returns the nonce string to be embedded in the SIWE message.
 *
 * @param input - Contains walletAddress (0x-prefixed EVM address)
 * @returns The nonce string for the SIWE message
 */
export function handleGenerateNonce(input: GenerateNonceInput): string {
  const nonce = generateNonce(input.walletAddress);
  return nonce;
}

/**
 * Verifies a SIWE-signed message against the stored nonce.
 * On success: upserts the user in the database and issues a JWT.
 * On failure: throws AppError with code INVALID_SIGNATURE or NONCE_NOT_FOUND.
 *
 * @param input - Contains the SIWE message string and hex signature
 * @param fastify - Fastify instance used to call fastify.jwt.sign
 * @returns JWT access token string
 * @throws {AppError} NONCE_NOT_FOUND if no nonce exists for the wallet
 * @throws {AppError} INVALID_SIGNATURE if SIWE verification fails
 * @throws {AppError} USER_CREATE_FAILED if the database upsert fails
 */
export async function handleVerify(
  input: VerifyInput,
  fastify: FastifyInstance,
): Promise<string> {
  let parsedMessage: SiweMessage;

  try {
    parsedMessage = new SiweMessage(input.message);
  } catch (err) {
    log.warn({
      module: 'modules.auth.verify',
      operation: 'handleVerify',
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to parse SIWE message');
    throw new AppError('INVALID_SIGNATURE', 'Invalid SIWE message format');
  }

  const walletAddress = parsedMessage.address.toLowerCase();

  // Retrieve and validate the nonce.
  const storedNonce = getNonce(walletAddress);
  if (!storedNonce) {
    throw new AppError('NONCE_NOT_FOUND', 'No active nonce for this wallet address. Request a new nonce.');
  }

  // Verify the SIWE message signature.
  try {
    const result = await parsedMessage.verify({
      signature: input.signature,
      nonce: storedNonce,
    });

    if (!result.success) {
      throw new Error('SIWE verification returned false');
    }
  } catch (err) {
    log.warn({
      module: 'modules.auth.verify',
      operation: 'handleVerify',
      walletAddress,
      error: err instanceof Error ? err.message : String(err),
    }, 'SIWE signature verification failed');

    // Consume nonce regardless to prevent brute-force attempts.
    consumeNonce(walletAddress);
    throw new AppError('INVALID_SIGNATURE', 'Wallet signature verification failed');
  }

  // Nonce is valid and verified — consume it to prevent replay.
  consumeNonce(walletAddress);

  // Upsert the user: insert on first sign-in, do nothing on subsequent sign-ins.
  let userId: string;

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.walletAddress, walletAddress))
      .limit(1);

    const existingUser = existing[0];
    if (existingUser !== undefined) {
      userId = existingUser.id;
    } else {
      const insertResult = await db
        .insert(users)
        .values({ walletAddress })
        .returning({ id: users.id });
      const newUser = insertResult[0];
      if (!newUser) {
        throw new Error('Insert returned no rows');
      }
      userId = newUser.id;

      log.info({
        module: 'modules.auth.verify',
        operation: 'handleVerify',
        userId,
        walletAddress,
      }, 'New user created on first sign-in');
    }
  } catch (err) {
    log.error({
      module: 'modules.auth.verify',
      operation: 'handleVerify',
      walletAddress,
      error: err instanceof Error ? err.message : String(err),
    }, 'User upsert failed');
    throw new AppError('USER_CREATE_FAILED', 'Failed to create or retrieve user account');
  }

  // Issue JWT with userId and walletAddress in payload.
  const jwt = fastify.jwt.sign({ userId, walletAddress });

  log.info({
    module: 'modules.auth.verify',
    operation: 'handleVerify',
    userId,
    walletAddress,
  }, 'SIWE verified, JWT issued');

  return jwt;
}
