/**
 * tests/milestones.service.test.ts — OpenEscrow API
 *
 * Handles: Unit tests for milestones.service.ts business logic.
 *          All database interactions are mocked via vi.mock.
 * Does NOT: hit the real database, make network calls, or test HTTP layer.
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMilestone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'milestone-uuid-1',
    dealId: 'deal-uuid-1',
    title: 'Design',
    description: 'Design phase',
    acceptanceCriteria: 'Matches mockup',
    amount: '500',
    sequence: 1,
    status: 'PENDING',
    ...overrides,
  };
}

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deal-uuid-1',
    clientId: 'client-uuid-1',
    freelancerId: 'freelancer-uuid-1',
    tokenAddress: '0xusdc',
    totalAmount: '1000',
    status: 'FUNDED',
    chainDealId: '42',
    createdAt: new Date(),
    agreedAt: new Date(),
    ...overrides,
  };
}

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'submission-uuid-1',
    milestoneId: 'milestone-uuid-1',
    submittedBy: 'freelancer-uuid-1',
    summary: 'Done',
    links: [],
    aiSummary: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Helper: sets up select mocks in sequence (first call returns milestone, second returns deal).
 */
function mockMilestoneWithDeal(
  milestone: ReturnType<typeof makeMilestone>,
  deal: ReturnType<typeof makeDeal>
) {
  mockDb.select
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([milestone]),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([deal]),
    });
}

// ─── Import after mocks ────────────────────────────────────────────────────────

const milestonesService = await import('../src/modules/milestones/milestones.service.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('milestones.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── submitMilestone ────────────────────────────────────────────────────────

  describe('submitMilestone', () => {
    it('submits a PENDING milestone and returns the submission', async () => {
      const milestone = makeMilestone({ status: 'PENDING' });
      const deal = makeDeal({ status: 'FUNDED' });
      const submission = makeSubmission();

      mockMilestoneWithDeal(milestone, deal);

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([submission]),
          }),
        };
        return await fn(txMock);
      });

      const result = await milestonesService.submitMilestone(
        'milestone-uuid-1',
        'freelancer-uuid-1',
        { summary: 'Done', links: ['https://github.com/pr/1'] }
      );

      expect(result.id).toBe('submission-uuid-1');
    });

    it('submits a REVISION milestone successfully', async () => {
      const milestone = makeMilestone({ status: 'REVISION' });
      const deal = makeDeal({ status: 'FUNDED' });
      const submission = makeSubmission();

      mockMilestoneWithDeal(milestone, deal);

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([submission]),
          }),
        };
        return await fn(txMock);
      });

      const result = await milestonesService.submitMilestone(
        'milestone-uuid-1',
        'freelancer-uuid-1',
        { summary: 'Revised', links: [] }
      );

      expect(result.id).toBe('submission-uuid-1');
    });

    it('throws INVALID_TRANSITION when deal is not FUNDED', async () => {
      const milestone = makeMilestone({ status: 'PENDING' });
      const deal = makeDeal({ status: 'AGREED' }); // Not funded yet

      mockMilestoneWithDeal(milestone, deal);

      await expect(
        milestonesService.submitMilestone('milestone-uuid-1', 'freelancer-uuid-1', {
          summary: 'Done',
          links: [],
        })
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('throws MILESTONE_NOT_FOUND when milestone does not exist', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      await expect(
        milestonesService.submitMilestone('nonexistent', 'freelancer-uuid-1', {
          summary: 'Done',
          links: [],
        })
      ).rejects.toMatchObject({ code: 'MILESTONE_NOT_FOUND' });
    });
  });

  // ── approveMilestone ───────────────────────────────────────────────────────

  describe('approveMilestone', () => {
    it('approves a SUBMITTED milestone', async () => {
      const milestone = makeMilestone({ status: 'SUBMITTED' });
      const deal = makeDeal({ status: 'FUNDED' });
      const approvedMilestone = makeMilestone({ status: 'APPROVED' });

      mockMilestoneWithDeal(milestone, deal);

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

      // areAllMilestonesApproved is called INSIDE the transaction via db.select() (not tx.select()).
      // It uses db.select().from().where() with NO .limit(), so where() must resolve to an array.
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ status: 'APPROVED' }]),
      });

      // After transaction: select updated milestone record
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([approvedMilestone]),
      });

      const result = await milestonesService.approveMilestone('milestone-uuid-1', 'client-uuid-1');
      expect(result.status).toBe('APPROVED');
    });

    it('throws INVALID_TRANSITION when milestone is not SUBMITTED', async () => {
      const milestone = makeMilestone({ status: 'PENDING' });
      const deal = makeDeal({ status: 'FUNDED' });

      mockMilestoneWithDeal(milestone, deal);

      await expect(
        milestonesService.approveMilestone('milestone-uuid-1', 'client-uuid-1')
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });
  });

  // ── rejectMilestone ────────────────────────────────────────────────────────

  describe('rejectMilestone', () => {
    it('rejects a SUBMITTED milestone and auto-sets REVISION', async () => {
      const milestone = makeMilestone({ status: 'SUBMITTED' });
      const deal = makeDeal({ status: 'FUNDED' });
      const submission = makeSubmission();
      const rejectionNote = {
        id: 'rejection-note-uuid-1',
        submissionId: 'submission-uuid-1',
        reasonCodes: ['INCOMPLETE'],
        freeText: 'Not finished yet',
        aiRevisionNotes: null,
        createdAt: new Date(),
      };

      mockMilestoneWithDeal(milestone, deal);

      // submissions select
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([submission]),
      });

      mockDb.transaction.mockImplementation(async (fn: Function) => {
        const txMock = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([rejectionNote]),
          }),
        };
        return await fn(txMock);
      });

      const result = await milestonesService.rejectMilestone('milestone-uuid-1', 'client-uuid-1', {
        reasonCodes: ['INCOMPLETE'],
        freeText: 'Not finished yet',
      });

      expect(result.id).toBe('rejection-note-uuid-1');
    });

    it('throws INVALID_TRANSITION when milestone is not SUBMITTED', async () => {
      const milestone = makeMilestone({ status: 'PENDING' });
      const deal = makeDeal({ status: 'FUNDED' });

      mockMilestoneWithDeal(milestone, deal);

      await expect(
        milestonesService.rejectMilestone('milestone-uuid-1', 'client-uuid-1', {
          reasonCodes: ['INCOMPLETE'],
          freeText: 'Not done',
        })
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('throws MILESTONE_NO_SUBMISSION when no submission exists', async () => {
      const milestone = makeMilestone({ status: 'SUBMITTED' });
      const deal = makeDeal({ status: 'FUNDED' });

      mockMilestoneWithDeal(milestone, deal);

      // No submission found
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      await expect(
        milestonesService.rejectMilestone('milestone-uuid-1', 'client-uuid-1', {
          reasonCodes: ['INCOMPLETE'],
          freeText: 'Not done',
        })
      ).rejects.toMatchObject({ code: 'MILESTONE_NO_SUBMISSION' });
    });
  });
});
