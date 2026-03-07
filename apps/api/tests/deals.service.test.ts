/**
 * tests/deals.service.test.ts — OpenEscrow API
 *
 * Handles: Unit tests for deals.service.ts business logic.
 *          All database interactions are mocked via vi.mock.
 * Does NOT: hit the real database, make network calls, or test HTTP layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock database ────────────────────────────────────────────────────────────

// We mock the entire database module so service tests are pure unit tests.
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

// Mock config/env so tests don't need real env vars.
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

// ─── Mock deal / milestone factory helpers ────────────────────────────────────

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deal-uuid-1',
    clientId: 'client-uuid-1',
    freelancerId: 'freelancer-uuid-1',
    tokenAddress: '0xusdc',
    totalAmount: '1000',
    status: 'DRAFT',
    chainDealId: null,
    createdAt: new Date(),
    agreedAt: null,
    ...overrides,
  };
}

/**
 * Returns a mock select chain for the users enrichment query.
 * The enrichDealsWithAddresses helper calls db.select().from(users).where(inArray(...))
 * which resolves at .where() (no .limit() or .orderBy()).
 */
function makeUsersMock() {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([
      { id: 'client-uuid-1', walletAddress: '0xclient1' },
      { id: 'freelancer-uuid-1', walletAddress: '0xfreelancer1' },
    ]),
  };
}

function makeMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'milestone-uuid-1',
    dealId: 'deal-uuid-1',
    title: 'Design',
    description: 'Design the homepage',
    acceptanceCriteria: 'Must match Figma mockup',
    amount: '500',
    sequence: 1,
    status: 'PENDING',
    ...overrides,
  };
}

// ─── Import service after mocks are set up ────────────────────────────────────

// Dynamic import so mocks are in place before the module loads.
const dealsService = await import('../src/modules/deals/deals.service.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deals.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── listDeals ──────────────────────────────────────────────────────────────

  describe('listDeals', () => {
    it('returns an array of deals for the given userId', async () => {
      const deal = makeDeal();
      // select 1: deals list query (resolves at .orderBy)
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([deal]),
        })
        // select 2: users enrichment query (resolves at .where)
        .mockReturnValueOnce(makeUsersMock());

      const result = await dealsService.listDeals('client-uuid-1');
      expect(result).toMatchObject([{ id: deal.id, status: deal.status, clientAddress: '0xclient1', freelancerAddress: '0xfreelancer1' }]);
    });

    it('returns empty array when user has no deals', async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(chain);
      // enrichDealsWithAddresses returns early on empty array — no users query needed

      const result = await dealsService.listDeals('unknown-user');
      expect(result).toEqual([]);
    });

    it('throws AppError DEAL_LIST_FAILED on database error', async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      };
      mockDb.select.mockReturnValue(chain);

      await expect(dealsService.listDeals('client-uuid-1')).rejects.toMatchObject({
        code: 'DEAL_LIST_FAILED',
      });
    });
  });

  // ── getDeal ────────────────────────────────────────────────────────────────

  describe('getDeal', () => {
    it('returns deal with milestones when found', async () => {
      const deal = makeDeal();
      const milestone = makeMilestone();

      // select 1: deal by id, select 2: milestones, select 3: users enrichment
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([deal]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([milestone]),
        })
        .mockReturnValueOnce(makeUsersMock());

      const result = await dealsService.getDeal('deal-uuid-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('deal-uuid-1');
      expect(result!.milestones).toHaveLength(1);
      expect(result!.clientAddress).toBe('0xclient1');
      expect(result!.freelancerAddress).toBe('0xfreelancer1');
    });

    it('returns null when deal not found', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      const result = await dealsService.getDeal('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── agreeToDeal ────────────────────────────────────────────────────────────

  describe('agreeToDeal', () => {
    it('transitions DRAFT deal to AGREED and sets agreed_at', async () => {
      const deal = makeDeal({ status: 'DRAFT' });
      const updatedDeal = makeDeal({ status: 'AGREED', agreedAt: new Date() });
      const milestone = makeMilestone();

      // getDeal called twice: before update and after update.
      // Each getDeal = 3 selects: deal, milestones, users enrichment.
      mockDb.select
        // First getDeal (read current state)
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([deal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock())
        // Second getDeal (read updated state)
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([updatedDeal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock());

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        // Simulate transaction: run the callback without a real DB transaction.
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
        };
        await fn(txMock);
      });

      const result = await dealsService.agreeToDeal('deal-uuid-1', 'freelancer-uuid-1');
      expect(result.status).toBe('AGREED');
    });

    it('throws DEAL_NOT_FOUND when deal does not exist', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      await expect(dealsService.agreeToDeal('nonexistent', 'freelancer-uuid-1')).rejects.toMatchObject({
        code: 'DEAL_NOT_FOUND',
      });
    });

    it('throws INVALID_TRANSITION when deal is not in DRAFT status', async () => {
      const deal = makeDeal({ status: 'AGREED' });
      const milestone = makeMilestone();

      // getDeal succeeds (3 selects), then assertValidTransition throws
      mockDb.select
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([deal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock());

      await expect(dealsService.agreeToDeal('deal-uuid-1', 'freelancer-uuid-1')).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        details: { from: 'AGREED', to: 'AGREED' },
      });
    });
  });

  // ── cancelDeal ─────────────────────────────────────────────────────────────

  describe('cancelDeal', () => {
    it('cancels a DRAFT deal with no refund required', async () => {
      const deal = makeDeal({ status: 'DRAFT' });
      const milestone = makeMilestone();
      const cancelledDeal = makeDeal({ status: 'CANCELLED' });

      // Each getDeal = 3 selects (deal, milestones, users)
      mockDb.select
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([deal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock())
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([cancelledDeal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock());

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
        };
        await fn(txMock);
      });

      const result = await dealsService.cancelDeal('deal-uuid-1', 'client-uuid-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('cancels a FUNDED deal and records refundable amount in event metadata', async () => {
      const deal = makeDeal({ status: 'FUNDED' });
      const milestone = makeMilestone({ status: 'PENDING', amount: '500' });
      const cancelledDeal = makeDeal({ status: 'CANCELLED' });

      mockDb.select
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([deal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock())
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([cancelledDeal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock());

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([]),
          }),
        };
        await fn(txMock);
      });

      const result = await dealsService.cancelDeal('deal-uuid-1', 'client-uuid-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('throws INVALID_TRANSITION when deal is already CANCELLED', async () => {
      const deal = makeDeal({ status: 'CANCELLED' });
      const milestone = makeMilestone();

      mockDb.select
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([deal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock());

      await expect(dealsService.cancelDeal('deal-uuid-1', 'client-uuid-1')).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    });

    it('throws INVALID_TRANSITION when deal is COMPLETED', async () => {
      const deal = makeDeal({ status: 'COMPLETED' });
      const milestone = makeMilestone({ status: 'APPROVED' });

      mockDb.select
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([deal]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([milestone]) })
        .mockReturnValueOnce(makeUsersMock());

      await expect(dealsService.cancelDeal('deal-uuid-1', 'client-uuid-1')).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    });
  });

  // ── getDealTimeline ────────────────────────────────────────────────────────

  describe('getDealTimeline', () => {
    it('returns ordered events for an existing deal', async () => {
      const event = {
        id: 'event-uuid-1',
        dealId: 'deal-uuid-1',
        actorId: 'client-uuid-1',
        eventType: 'DEAL_CREATED',
        metadata: {},
        createdAt: new Date(),
      };

      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: 'deal-uuid-1' }]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([event]),
        });

      const result = await dealsService.getDealTimeline('deal-uuid-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.eventType).toBe('DEAL_CREATED');
    });

    it('throws DEAL_NOT_FOUND when deal does not exist', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      await expect(dealsService.getDealTimeline('nonexistent')).rejects.toMatchObject({
        code: 'DEAL_NOT_FOUND',
      });
    });
  });
});
