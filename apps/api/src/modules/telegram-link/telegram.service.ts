/**
 * modules/telegram-link/telegram.service.ts — OpenEscrow API
 *
 * Handles: Business logic for Telegram account linking lifecycle.
 *          generate OTP (15-min expiry), verify OTP + link Telegram user ID, unlink.
 * Does NOT: interact with the Telegram Bot API (the bot calls this API),
 *            send notifications, manage sessions, or enforce HTTP access control.
 *
 * OTP flow:
 *   1. User authenticates on web dashboard and calls POST /telegram/generate-code
 *   2. API generates an 8-char hex OTP, stores it with 15-min expiry
 *   3. User sends the OTP to the Telegram bot via /link <code>
 *   4. Bot calls POST /telegram/link with { oneTimeCode, telegramUserId }
 *   5. API verifies OTP (checks expiry, checks not already used), links user
 */

import { randomBytes } from 'crypto';
import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { db } from '../../database/index.js';
import { telegramLinks, users } from '../../database/schema.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { LinkTelegramInput } from './telegram.schema.js';

const log = logger.child({ module: 'telegram.service' });

/** OTP validity window: exactly 15 minutes as required by CLAUDE.md. */
const OTP_TTL_MS = 15 * 60 * 1000;

/**
 * Generates a one-time code for Telegram account linking.
 * Invalidates any existing unused OTPs for this user before generating a new one.
 * The OTP expires exactly 15 minutes from generation.
 *
 * @param userId - UUID of the authenticated user requesting the code
 * @returns Object containing the generated one-time code and its expiry timestamp
 * @throws {AppError} TELEGRAM_GENERATE_FAILED on database error
 */
export async function generateLinkCode(
  userId: string
): Promise<{ oneTimeCode: string; expiresAt: Date }> {
  log.info(
    {
      module: 'telegram.service',
      operation: 'generateLinkCode',
      userId,
    },
    'Generating Telegram link code'
  );

  const oneTimeCode = randomBytes(4).toString('hex'); // 8 hex chars
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  try {
    await db.transaction(async (tx) => {
      // Remove any existing unused OTPs for this user to prevent accumulation.
      await tx
        .delete(telegramLinks)
        .where(and(eq(telegramLinks.userId, userId), isNull(telegramLinks.usedAt)));

      await tx.insert(telegramLinks).values({
        userId,
        oneTimeCode,
        expiresAt,
      });
    });

    log.info(
      {
        module: 'telegram.service',
        operation: 'generateLinkCode',
        userId,
        expiresAt: expiresAt.toISOString(),
      },
      'Telegram link code generated'
    );

    return { oneTimeCode, expiresAt };
  } catch (err) {
    log.error(
      {
        module: 'telegram.service',
        operation: 'generateLinkCode',
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to generate Telegram link code'
    );
    throw new AppError('TELEGRAM_GENERATE_FAILED', 'Failed to generate Telegram link code');
  }
}

/**
 * Verifies a one-time code and links the Telegram user ID to the wallet account.
 * OTP expiry is enforced at verification time (exactly 15 minutes from generation).
 * Used OTPs are rejected; the OTP is marked as used after successful linking.
 *
 * @param userId - UUID of the authenticated user submitting the code
 * @param input - Contains oneTimeCode and telegramUserId
 * @returns void on success
 * @throws {AppError} TELEGRAM_CODE_INVALID if OTP not found
 * @throws {AppError} TELEGRAM_CODE_EXPIRED if OTP has expired (>15 min)
 * @throws {AppError} TELEGRAM_CODE_USED if OTP was already consumed
 * @throws {AppError} TELEGRAM_ALREADY_LINKED if this Telegram ID is already linked to another wallet
 * @throws {AppError} TELEGRAM_LINK_FAILED on database error
 */
export async function linkTelegram(userId: string, input: LinkTelegramInput): Promise<void> {
  log.info(
    {
      module: 'telegram.service',
      operation: 'linkTelegram',
      userId,
    },
    'Attempting Telegram account link'
  );

  // Retrieve the OTP record (match by code AND user to prevent code-stealing).
  const [otpRecord] = await db
    .select()
    .from(telegramLinks)
    .where(and(eq(telegramLinks.oneTimeCode, input.oneTimeCode), eq(telegramLinks.userId, userId)))
    .limit(1);

  if (!otpRecord) {
    throw new AppError('TELEGRAM_CODE_INVALID', 'Invalid one-time code');
  }

  // Check if already used.
  if (otpRecord.usedAt !== null) {
    throw new AppError('TELEGRAM_CODE_USED', 'This code has already been used');
  }

  // Enforce expiry: exactly 15 minutes from generation.
  if (new Date() > otpRecord.expiresAt) {
    throw new AppError(
      'TELEGRAM_CODE_EXPIRED',
      'This code has expired. Please generate a new code.'
    );
  }

  // Check that this Telegram ID is not already linked to a different wallet.
  const [existingLink] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramUserId, input.telegramUserId))
    .limit(1);

  if (existingLink && existingLink.id !== userId) {
    throw new AppError(
      'TELEGRAM_ALREADY_LINKED',
      'This Telegram account is already linked to a different wallet'
    );
  }

  try {
    await db.transaction(async (tx) => {
      // Mark OTP as consumed.
      await tx
        .update(telegramLinks)
        .set({ usedAt: new Date() })
        .where(eq(telegramLinks.id, otpRecord.id));

      // Link the Telegram user ID on the user record.
      await tx
        .update(users)
        .set({ telegramUserId: input.telegramUserId })
        .where(eq(users.id, userId));
    });

    log.info(
      {
        module: 'telegram.service',
        operation: 'linkTelegram',
        userId,
      },
      'Telegram account linked successfully'
    );
  } catch (err) {
    log.error(
      {
        module: 'telegram.service',
        operation: 'linkTelegram',
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to link Telegram account'
    );
    throw new AppError('TELEGRAM_LINK_FAILED', 'Failed to link Telegram account');
  }
}

/**
 * Removes the Telegram link from a user account.
 * Revokes bot access immediately — bot isLinked() check will fail after this.
 *
 * @param userId - UUID of the authenticated user requesting unlink
 * @returns void on success
 * @throws {AppError} TELEGRAM_NOT_LINKED if user does not have a Telegram ID linked
 * @throws {AppError} TELEGRAM_UNLINK_FAILED on database error
 */
export async function unlinkTelegram(userId: string): Promise<void> {
  log.info(
    {
      module: 'telegram.service',
      operation: 'unlinkTelegram',
      userId,
    },
    'Unlinking Telegram account'
  );

  // Verify there is actually a link to remove.
  const [user] = await db
    .select({ telegramUserId: users.telegramUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.telegramUserId) {
    throw new AppError('TELEGRAM_NOT_LINKED', 'No Telegram account is linked to this wallet');
  }

  try {
    await db.update(users).set({ telegramUserId: null }).where(eq(users.id, userId));

    log.info(
      {
        module: 'telegram.service',
        operation: 'unlinkTelegram',
        userId,
      },
      'Telegram account unlinked successfully'
    );
  } catch (err) {
    log.error(
      {
        module: 'telegram.service',
        operation: 'unlinkTelegram',
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to unlink Telegram account'
    );
    throw new AppError('TELEGRAM_UNLINK_FAILED', 'Failed to unlink Telegram account');
  }
}

/**
 * Returns the Telegram link status for an authenticated user.
 * Derives `linkedAt` from the most recently consumed OTP record.
 *
 * @param userId - UUID of the authenticated user
 * @returns Object with `linked` flag, `telegramUserId` (or null), and `linkedAt` ISO string (or null)
 * @throws {AppError} TELEGRAM_STATUS_FAILED on database error
 */
export async function getTelegramStatus(userId: string): Promise<{
  linked: boolean;
  telegramUserId: string | null;
  linkedAt: string | null;
}> {
  try {
    const [user] = await db
      .select({ telegramUserId: users.telegramUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.telegramUserId) {
      return { linked: false, telegramUserId: null, linkedAt: null };
    }

    // Derive linkedAt from the most recently used OTP for this user.
    const [lastLink] = await db
      .select({ usedAt: telegramLinks.usedAt })
      .from(telegramLinks)
      .where(and(eq(telegramLinks.userId, userId), isNotNull(telegramLinks.usedAt)))
      .orderBy(desc(telegramLinks.usedAt))
      .limit(1);

    return {
      linked: true,
      telegramUserId: user.telegramUserId,
      linkedAt: lastLink?.usedAt?.toISOString() ?? null,
    };
  } catch (err) {
    log.error(
      {
        module: 'telegram.service',
        operation: 'getTelegramStatus',
        userId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to fetch Telegram status'
    );
    throw new AppError('TELEGRAM_STATUS_FAILED', 'Failed to fetch Telegram link status');
  }
}

/**
 * Looks up a user by their Telegram user ID.
 * Used by the bot's bot-session endpoint to issue JWTs for linked users.
 *
 * @param telegramUserId - The Telegram numeric user ID as a string
 * @returns `{ userId, walletAddress }` if found, or null if no user is linked with this ID
 * @throws {AppError} TELEGRAM_STATUS_FAILED on database error
 */
export async function getUserByTelegramId(
  telegramUserId: string
): Promise<{ userId: string; walletAddress: string } | null> {
  try {
    const [user] = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId))
      .limit(1);

    if (!user) return null;
    return { userId: user.id, walletAddress: user.walletAddress };
  } catch (err) {
    log.error(
      {
        module: 'telegram.service',
        operation: 'getUserByTelegramId',
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to look up user by Telegram ID'
    );
    throw new AppError('TELEGRAM_STATUS_FAILED', 'Failed to look up Telegram user');
  }
}
