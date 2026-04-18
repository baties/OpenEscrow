/**
 * modules/messages/messages.schema.ts — OpenEscrow API
 *
 * Handles: Zod validation schemas for the messages API endpoints.
 *          Validates request bodies and query parameters for send and list operations.
 * Does NOT: contain business logic, database queries, or HTTP handler logic.
 */

import { z } from 'zod';

/**
 * Schema for the POST /api/v1/deals/:id/messages request body.
 * Content must be non-empty and at most 2000 characters.
 */
export const SendMessageSchema = z.object({
  /** The message text to send. Minimum 1 character, maximum 2000. */
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long (max 2000)'),
});

/**
 * Schema for GET /api/v1/deals/:id/messages query parameters.
 * Supports cursor-based pagination via an ISO 8601 timestamp.
 */
export const GetMessagesQuerySchema = z.object({
  /**
   * ISO 8601 timestamp cursor.
   * When provided, returns messages with created_at < cursor (i.e. older than this point).
   * When omitted, returns the most recent messages.
   */
  cursor: z.string().datetime({ offset: true }).optional(),
  /**
   * Maximum number of messages to return.
   * Defaults to 20. Maximum 50.
   */
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;
