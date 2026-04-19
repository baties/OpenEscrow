/**
 * modules/users/users.service.ts — OpenEscrow API
 *
 * Handles: Business logic for user profile management.
 *          getUserProfile — fetch the current user's public profile.
 *          updateUsername — change the user's platform username (4–10 alphanumeric chars, unique).
 * Does NOT: handle HTTP request/response (see users.controller.ts),
 *            manage authentication or wallet linking.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../database/index.js';
import { users } from '../../database/schema.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const log = logger.child({ module: 'users.service' });

/**
 * Returns the public profile for the authenticated user.
 *
 * @param userId - UUID of the authenticated user
 * @returns User profile object with username and wallet address
 * @throws {AppError} USER_NOT_FOUND if the user record does not exist
 */
export async function getUserProfile(
  userId: string
): Promise<{ id: string; walletAddress: string; username: string | null; createdAt: string }> {
  const [user] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      username: users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'User not found');
  }

  return {
    id: user.id,
    walletAddress: user.walletAddress,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Updates the platform username for the authenticated user.
 * Username must be 4–10 alphanumeric characters and unique across all users.
 *
 * @param userId - UUID of the authenticated user
 * @param newUsername - Desired new username (already validated by Zod in controller)
 * @returns void on success
 * @throws {AppError} USER_NOT_FOUND if the user record does not exist
 * @throws {AppError} USERNAME_TAKEN if the requested username is already in use
 * @throws {AppError} USER_UPDATE_FAILED on database error
 */
export async function updateUsername(userId: string, newUsername: string): Promise<void> {
  log.info(
    { module: 'users.service', operation: 'updateUsername', userId },
    'Updating platform username'
  );

  // Check uniqueness before attempting the update.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, newUsername))
    .limit(1);

  if (existing && existing.id !== userId) {
    throw new AppError('USERNAME_TAKEN', 'This username is already taken. Please choose another.');
  }

  try {
    await db.update(users).set({ username: newUsername }).where(eq(users.id, userId));

    log.info(
      { module: 'users.service', operation: 'updateUsername', userId, newUsername },
      'Username updated successfully'
    );
  } catch (err) {
    log.error(
      {
        module: 'users.service',
        operation: 'updateUsername',
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to update username'
    );
    throw new AppError('USER_UPDATE_FAILED', 'Failed to update username');
  }
}
