/**
 * tests/sessions.test.ts — OpenEscrow Telegram Bot
 *
 * Handles: Unit tests for the in-memory session store (store/sessions.ts).
 *          Tests CRUD operations, isLinked, updateLastSeenEventAt, getAllSessions.
 * Does NOT: test API calls, Telegraf wiring, or command handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { UserSession } from '../src/api-client/types.js';

// We import the module functions directly; the module-level Map is reset
// by re-importing in each test via module isolation. We use beforeEach to
// manually clear state instead.

// Dynamic import trick: we can't easily reset the module-level Map between
// tests in vitest without module mocking. Instead, we use a stable import
// and sequence tests so they don't interfere. This is acceptable for a Map
// with set/delete operations (we reset in beforeEach by removing keys).

let getSession: (id: number | string) => UserSession | undefined;
let setSession: (id: number | string, session: UserSession) => void;
let removeSession: (id: number | string) => void;
let isLinked: (id: number | string) => boolean;
let updateLastSeenEventAt: (id: number | string, eventAt: string) => boolean;
let getAllSessions: () => IterableIterator<[string, UserSession]>;
let sessionCount: () => number;

// Vitest module caching means the Map is shared across tests in this file.
// We use unique Telegram IDs per test group to avoid cross-test pollution.

beforeEach(async () => {
  // Re-import each time to get fresh function references (module is cached, Map is same instance)
  const mod = await import('../src/store/sessions.js');
  getSession = mod.getSession;
  setSession = mod.setSession;
  removeSession = mod.removeSession;
  isLinked = mod.isLinked;
  updateLastSeenEventAt = mod.updateLastSeenEventAt;
  getAllSessions = mod.getAllSessions;
  sessionCount = mod.sessionCount;
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Creates a minimal valid UserSession fixture.
 */
function makeSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    userId: 'user-uuid-001',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.test',
    walletAddress: '0xabc123',
    lastSeenEventAt: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('store/sessions', () => {
  const BASE_ID = 1_000_000; // Large base to avoid collision with other tests

  describe('setSession / getSession', () => {
    it('stores and retrieves a session by numeric Telegram user ID', () => {
      const session = makeSession();
      setSession(BASE_ID + 1, session);

      const retrieved = getSession(BASE_ID + 1);
      expect(retrieved).toBeDefined();
      expect(retrieved?.userId).toBe('user-uuid-001');
      expect(retrieved?.walletAddress).toBe('0xabc123');

      // cleanup
      removeSession(BASE_ID + 1);
    });

    it('stores and retrieves a session by string Telegram user ID', () => {
      const id = String(BASE_ID + 2);
      const session = makeSession({ userId: 'user-002' });
      setSession(id, session);

      const retrieved = getSession(id);
      expect(retrieved?.userId).toBe('user-002');

      // cleanup
      removeSession(id);
    });

    it('treats numeric and string IDs as equivalent', () => {
      const numId = BASE_ID + 3;
      const session = makeSession({ userId: 'user-003' });
      setSession(numId, session);

      // Retrieve using string form of same ID
      const retrieved = getSession(String(numId));
      expect(retrieved?.userId).toBe('user-003');

      // cleanup
      removeSession(numId);
    });

    it('returns undefined for a missing key', () => {
      expect(getSession(BASE_ID + 999)).toBeUndefined();
    });

    it('overwrites existing session on setSession', () => {
      const id = BASE_ID + 4;
      setSession(id, makeSession({ userId: 'user-004a' }));
      setSession(id, makeSession({ userId: 'user-004b' }));

      const retrieved = getSession(id);
      expect(retrieved?.userId).toBe('user-004b');

      // cleanup
      removeSession(id);
    });
  });

  describe('removeSession', () => {
    it('removes a session so isLinked returns false', () => {
      const id = BASE_ID + 5;
      setSession(id, makeSession());
      expect(isLinked(id)).toBe(true);

      removeSession(id);
      expect(isLinked(id)).toBe(false);
      expect(getSession(id)).toBeUndefined();
    });

    it('does not throw when removing a non-existent session', () => {
      expect(() => removeSession(BASE_ID + 888)).not.toThrow();
    });
  });

  describe('isLinked', () => {
    it('returns false when user has no session', () => {
      expect(isLinked(BASE_ID + 6)).toBe(false);
    });

    it('returns true when user has a session', () => {
      const id = BASE_ID + 7;
      setSession(id, makeSession());
      expect(isLinked(id)).toBe(true);

      // cleanup
      removeSession(id);
    });
  });

  describe('updateLastSeenEventAt', () => {
    it('updates lastSeenEventAt and returns true for linked user', () => {
      const id = BASE_ID + 8;
      setSession(id, makeSession({ lastSeenEventAt: null }));

      const updated = updateLastSeenEventAt(id, '2024-01-15T10:00:00.000Z');
      expect(updated).toBe(true);

      const session = getSession(id);
      expect(session?.lastSeenEventAt).toBe('2024-01-15T10:00:00.000Z');

      // cleanup
      removeSession(id);
    });

    it('returns false for non-linked user', () => {
      const result = updateLastSeenEventAt(BASE_ID + 9, '2024-01-15T10:00:00.000Z');
      expect(result).toBe(false);
    });

    it('overwrites existing lastSeenEventAt with a newer timestamp', () => {
      const id = BASE_ID + 10;
      setSession(id, makeSession({ lastSeenEventAt: '2024-01-10T08:00:00.000Z' }));

      updateLastSeenEventAt(id, '2024-01-15T10:00:00.000Z');
      const session = getSession(id);
      expect(session?.lastSeenEventAt).toBe('2024-01-15T10:00:00.000Z');

      // cleanup
      removeSession(id);
    });
  });

  describe('getAllSessions', () => {
    it('returns all stored sessions', () => {
      const ids = [BASE_ID + 11, BASE_ID + 12, BASE_ID + 13];

      for (const id of ids) {
        setSession(id, makeSession({ userId: `user-${id}` }));
      }

      const entries = [...getAllSessions()];
      const storedIds = entries.map(([k]) => k);

      for (const id of ids) {
        expect(storedIds).toContain(String(id));
      }

      // cleanup
      for (const id of ids) {
        removeSession(id);
      }
    });
  });

  describe('sessionCount', () => {
    it('returns correct count after add and remove', () => {
      const before = sessionCount();
      const id = BASE_ID + 14;
      setSession(id, makeSession());

      expect(sessionCount()).toBe(before + 1);

      removeSession(id);
      expect(sessionCount()).toBe(before);
    });
  });
});
