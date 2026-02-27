/**
 * tests/telegram.service.test.ts — OpenEscrow API
 *
 * Handles: Unit tests for telegram.service.ts business logic.
 *          All database interactions are mocked via vi.mock.
 * Does NOT: hit the real database, call the Telegram API, or test HTTP layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock database ────────────────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('../src/database/index.js', () => ({
  db: mockDb,
}));

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

// ─── Import after mocks ────────────────────────────────────────────────────────

const telegramService = await import('../src/modules/telegram-link/telegram.service.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeOtpRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'otp-uuid-1',
    userId: 'user-uuid-1',
    oneTimeCode: 'abcd1234',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min from now (still valid)
    usedAt: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('telegram.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── generateLinkCode ───────────────────────────────────────────────────────

  describe('generateLinkCode', () => {
    it('generates a code and returns oneTimeCode and expiresAt', async () => {
      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
        };
        await fn(txMock);
      });

      const result = await telegramService.generateLinkCode('user-uuid-1');

      expect(result.oneTimeCode).toBeDefined();
      expect(result.oneTimeCode).toHaveLength(8); // 4 bytes = 8 hex chars
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Expiry should be approximately 15 minutes from now.
      const diffMs = result.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(14 * 60 * 1000);
      expect(diffMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
    });

    it('throws TELEGRAM_GENERATE_FAILED on database error', async () => {
      mockDb.transaction.mockRejectedValue(new Error('DB error'));

      await expect(telegramService.generateLinkCode('user-uuid-1')).rejects.toMatchObject({
        code: 'TELEGRAM_GENERATE_FAILED',
      });
    });
  });

  // ── linkTelegram ───────────────────────────────────────────────────────────

  describe('linkTelegram', () => {
    it('links successfully with a valid, unexpired OTP', async () => {
      const otpRecord = makeOtpRecord();

      // OTP lookup
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([otpRecord]),
        })
        // Check for existing Telegram link on another user
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        });

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
        };
        await fn(txMock);
      });

      await expect(
        telegramService.linkTelegram('user-uuid-1', {
          oneTimeCode: 'abcd1234',
          telegramUserId: '123456789',
        }),
      ).resolves.toBeUndefined();
    });

    it('throws TELEGRAM_CODE_INVALID when OTP not found', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      await expect(
        telegramService.linkTelegram('user-uuid-1', {
          oneTimeCode: 'invalid',
          telegramUserId: '123456789',
        }),
      ).rejects.toMatchObject({ code: 'TELEGRAM_CODE_INVALID' });
    });

    it('throws TELEGRAM_CODE_USED when OTP was already consumed', async () => {
      const usedOtp = makeOtpRecord({ usedAt: new Date(Date.now() - 5000) });

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([usedOtp]),
      });

      await expect(
        telegramService.linkTelegram('user-uuid-1', {
          oneTimeCode: 'abcd1234',
          telegramUserId: '123456789',
        }),
      ).rejects.toMatchObject({ code: 'TELEGRAM_CODE_USED' });
    });

    it('throws TELEGRAM_CODE_EXPIRED when OTP has expired (past 15 minutes)', async () => {
      const expiredOtp = makeOtpRecord({
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        usedAt: null,
      });

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([expiredOtp]),
      });

      await expect(
        telegramService.linkTelegram('user-uuid-1', {
          oneTimeCode: 'abcd1234',
          telegramUserId: '123456789',
        }),
      ).rejects.toMatchObject({ code: 'TELEGRAM_CODE_EXPIRED' });
    });

    it('throws TELEGRAM_ALREADY_LINKED when Telegram ID is linked to a different wallet', async () => {
      const otpRecord = makeOtpRecord();

      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([otpRecord]),
        })
        // Different user already owns this Telegram ID
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: 'different-user-uuid' }]),
        });

      await expect(
        telegramService.linkTelegram('user-uuid-1', {
          oneTimeCode: 'abcd1234',
          telegramUserId: '999999999',
        }),
      ).rejects.toMatchObject({ code: 'TELEGRAM_ALREADY_LINKED' });
    });
  });

  // ── unlinkTelegram ─────────────────────────────────────────────────────────

  describe('unlinkTelegram', () => {
    it('unlinks successfully when a Telegram ID is linked', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ telegramUserId: '123456789' }]),
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });

      await expect(telegramService.unlinkTelegram('user-uuid-1')).resolves.toBeUndefined();
    });

    it('throws TELEGRAM_NOT_LINKED when no Telegram ID is linked', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ telegramUserId: null }]),
      });

      await expect(telegramService.unlinkTelegram('user-uuid-1')).rejects.toMatchObject({
        code: 'TELEGRAM_NOT_LINKED',
      });
    });

    it('throws TELEGRAM_NOT_LINKED when user does not exist', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      await expect(telegramService.unlinkTelegram('nonexistent-user')).rejects.toMatchObject({
        code: 'TELEGRAM_NOT_LINKED',
      });
    });
  });
});
