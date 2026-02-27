/**
 * tests/auth.nonce.test.ts — OpenEscrow API
 *
 * Handles: Unit tests for the SIWE nonce generation and management module.
 * Does NOT: test SIWE signature verification (that's covered in routes.test.ts),
 *            hit the database, or make network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: 'test-secret-that-is-at-least-32-chars-long',
    JWT_EXPIRY: '24h',
    ALLOWED_ORIGIN: 'http://localhost:3000',
    BOT_API_SECRET: 'test-bot-secret-at-least-32-chars-long',
    CHAIN_ID: 11155111,
    CONTRACT_ADDRESS: '0x1234567890123456789012345678901234567890',
    RPC_URL: 'https://sepolia.infura.io/v3/test',
    USDC_ADDRESS: '0x1234567890123456789012345678901234567891',
    USDT_ADDRESS: '0x1234567890123456789012345678901234567892',
    INDEXER_POLL_INTERVAL_MS: 12000,
    API_PORT: 3001,
    LOG_LEVEL: 'error',
  },
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const { generateNonce, getNonce, consumeNonce } = await import('../src/modules/auth/nonce.js');

describe('auth.nonce', () => {
  const TEST_WALLET = '0xabcdef1234567890abcdef1234567890abcdef12';

  beforeEach(() => {
    // Consume any leftover nonces between tests.
    consumeNonce(TEST_WALLET);
  });

  describe('generateNonce', () => {
    it('generates a 32-character hex nonce', () => {
      const nonce = generateNonce(TEST_WALLET);
      expect(nonce).toHaveLength(32);
      expect(nonce).toMatch(/^[0-9a-f]+$/);
    });

    it('generates different nonces on each call', () => {
      const nonce1 = generateNonce(TEST_WALLET);
      const nonce2 = generateNonce(TEST_WALLET);
      expect(nonce1).not.toBe(nonce2);
    });

    it('normalizes wallet address to lowercase', () => {
      const upper = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
      generateNonce(upper);
      const retrieved = getNonce(upper.toLowerCase());
      expect(retrieved).not.toBeNull();
    });
  });

  describe('getNonce', () => {
    it('returns the stored nonce after generation', () => {
      const nonce = generateNonce(TEST_WALLET);
      const retrieved = getNonce(TEST_WALLET);
      expect(retrieved).toBe(nonce);
    });

    it('returns null when no nonce exists for the wallet', () => {
      const result = getNonce('0x0000000000000000000000000000000000000000');
      expect(result).toBeNull();
    });
  });

  describe('consumeNonce', () => {
    it('removes the nonce so subsequent getNonce returns null', () => {
      generateNonce(TEST_WALLET);
      consumeNonce(TEST_WALLET);
      const result = getNonce(TEST_WALLET);
      expect(result).toBeNull();
    });

    it('is safe to call even when no nonce exists', () => {
      expect(() => consumeNonce('0x0000000000000000000000000000000000000001')).not.toThrow();
    });
  });
});
