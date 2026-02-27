/**
 * auth-storage.test.ts — OpenEscrow Web Dashboard Tests
 *
 * Unit tests for the auth storage utilities.
 * Handles: testing localStorage save/read/clear operations.
 * Does NOT: test API calls, React components, or real auth flows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveAuth,
  getAuthToken,
  getStoredWalletAddress,
  isAuthenticated,
  clearAuth,
} from '../src/lib/auth-storage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock window
Object.defineProperty(global, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
});

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('saveAuth', () => {
  it('stores the token in localStorage', () => {
    saveAuth('my-token', '0xABC');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('open_escrow_jwt', 'my-token');
  });

  it('stores the wallet address in lowercase', () => {
    saveAuth('my-token', '0xABCdef');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'open_escrow_wallet',
      '0xabcdef'
    );
  });
});

describe('getAuthToken', () => {
  it('returns null when no token is stored', () => {
    expect(getAuthToken()).toBeNull();
  });

  it('returns the stored token', () => {
    saveAuth('stored-token', '0xabc');
    expect(getAuthToken()).toBe('stored-token');
  });
});

describe('getStoredWalletAddress', () => {
  it('returns null when no address is stored', () => {
    expect(getStoredWalletAddress()).toBeNull();
  });

  it('returns the stored wallet address', () => {
    saveAuth('token', '0xwalletAddress');
    expect(getStoredWalletAddress()).toBe('0xwalletaddress'); // stored lowercase
  });
});

describe('isAuthenticated', () => {
  it('returns false when no token is stored', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('returns true after saving auth', () => {
    saveAuth('token', '0xabc');
    expect(isAuthenticated()).toBe(true);
  });
});

describe('clearAuth', () => {
  it('removes both token and wallet address from storage', () => {
    saveAuth('token', '0xabc');
    clearAuth();
    expect(getAuthToken()).toBeNull();
    expect(getStoredWalletAddress()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});
