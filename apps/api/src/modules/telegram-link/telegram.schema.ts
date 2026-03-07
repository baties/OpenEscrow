/**
 * modules/telegram-link/telegram.schema.ts — OpenEscrow API
 *
 * Handles: Zod validation schemas for Telegram linking API request bodies.
 * Does NOT: contain business logic, database queries, or HTTP handler logic.
 */

import { z } from 'zod';

/**
 * Schema for POST /api/v1/telegram/link
 * The user submits the OTP they received from the Telegram bot.
 */
export const LinkTelegramSchema = z.object({
  /**
   * The one-time code displayed by the Telegram bot via /link command.
   * Format: 8 hex characters (4 bytes).
   */
  oneTimeCode: z
    .string()
    .min(6, 'One-time code must be at least 6 characters')
    .max(64, 'One-time code must be at most 64 characters'),
  /**
   * The Telegram user ID of the account to link.
   * This is provided by the bot when the user runs /link.
   */
  telegramUserId: z.string().min(1, 'Telegram user ID is required'),
});

export type LinkTelegramInput = z.infer<typeof LinkTelegramSchema>;
