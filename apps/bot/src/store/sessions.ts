/**
 * store/sessions.ts — OpenEscrow Telegram Bot
 *
 * Handles: In-memory session store mapping Telegram user IDs to their
 *          linked wallet sessions (userId, JWT, walletAddress, lastSeenEventAt).
 *          This is the bot's only state — all persistent state is in the API/DB.
 * Does NOT: persist sessions to disk or database (intentional — sessions are
 *           re-established on bot restart via /link flow),
 *           store private keys or sensitive on-chain data,
 *           interact with the API or Telegraf directly.
 *
 * Architecture note: JWT tokens stored here belong to linked users, obtained
 * via the /link flow. They are stored only in-memory and cleared on bot restart.
 * Users must re-link if the bot restarts (acceptable MVP trade-off).
 */

import type { UserSession } from '../api-client/types.js';

/**
 * In-memory map from Telegram user ID (string) to the user's session data.
 * Telegram user IDs are used as strings for consistent key type.
 */
const sessionStore = new Map<string, UserSession>();

/**
 * Retrieves the session for a Telegram user, or undefined if not linked.
 *
 * @param telegramUserId - The Telegram user ID (from ctx.from.id)
 * @returns The UserSession if the user is linked, undefined otherwise
 */
export function getSession(telegramUserId: number | string): UserSession | undefined {
  return sessionStore.get(String(telegramUserId));
}

/**
 * Stores or updates a user session for a Telegram user.
 * Overwrites any existing session for the same Telegram user ID.
 *
 * @param telegramUserId - The Telegram user ID to associate with this session
 * @param session - The session data to store
 */
export function setSession(telegramUserId: number | string, session: UserSession): void {
  sessionStore.set(String(telegramUserId), session);
}

/**
 * Removes the session for a Telegram user (effectively "unlinking" them in-memory).
 * Called when the bot detects the user has unlinked via the API.
 *
 * @param telegramUserId - The Telegram user ID whose session to remove
 */
export function removeSession(telegramUserId: number | string): void {
  sessionStore.delete(String(telegramUserId));
}

/**
 * Checks whether a Telegram user has a valid linked session.
 * This is the primary `isLinked` check used by every command handler entry point.
 *
 * @param telegramUserId - The Telegram user ID to check
 * @returns true if a session exists for this Telegram user ID, false otherwise
 */
export function isLinked(telegramUserId: number | string): boolean {
  return sessionStore.has(String(telegramUserId));
}

/**
 * Updates the lastSeenEventAt timestamp for a linked user's session.
 * Called by the notification poller after processing new events.
 * Stores an ISO 8601 timestamp (from DealEvent.createdAt) for reliable
 * chronological filtering — UUID v4 IDs are random and not monotonically ordered.
 *
 * @param telegramUserId - The Telegram user ID whose lastSeenEventAt to update
 * @param eventAt - ISO 8601 createdAt timestamp of the most recently seen deal event
 * @returns true if the session was found and updated, false if user is not linked
 */
export function updateLastSeenEventAt(
  telegramUserId: number | string,
  eventAt: string,
): boolean {
  const key = String(telegramUserId);
  const session = sessionStore.get(key);
  if (!session) return false;
  sessionStore.set(key, { ...session, lastSeenEventAt: eventAt });
  return true;
}

/**
 * Returns an iterable of all currently linked sessions.
 * Used by the notification poller to iterate over all users to notify.
 *
 * @returns Iterator over [telegramUserId, UserSession] pairs
 */
export function getAllSessions(): IterableIterator<[string, UserSession]> {
  return sessionStore.entries();
}

/**
 * Returns the number of currently linked users.
 * Useful for diagnostics and health logging.
 *
 * @returns Count of linked sessions
 */
export function sessionCount(): number {
  return sessionStore.size;
}
