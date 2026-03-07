/**
 * tests/callbacks.test.ts — OpenEscrow Telegram Bot
 *
 * Handles: Unit tests for the milestone callback handler (callbacks/milestone.ts).
 *          Tests the approve, reject, submit, confirm_reject, confirm_submit,
 *          deal_status, and cancel_action callbacks with mocked API calls.
 * Does NOT: make real network calls (api-client is mocked),
 *           test real Telegraf callback routing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks (must be before imports) ──────────────────────────────────────────

vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: 'test-token-123456789',
    API_BASE_URL: 'http://localhost:3001',
    POLL_INTERVAL_MS: 30000,
    LOG_LEVEL: 'silent',
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

const mockApproveMilestone = vi.fn();
const mockRejectMilestone = vi.fn();
const mockSubmitMilestone = vi.fn();
const mockGetDeal = vi.fn();

vi.mock('../src/api-client/index.js', () => ({
  approveMilestone: mockApproveMilestone,
  rejectMilestone: mockRejectMilestone,
  submitMilestone: mockSubmitMilestone,
  getDeal: mockGetDeal,
  listDeals: vi.fn(),
  ApiClientError: class MockApiClientError extends Error {
    statusCode: number;
    apiError: { error: string; message: string } | null;
    constructor(
      statusCode: number,
      apiError: { error: string; message: string } | null,
      message: string
    ) {
      super(message);
      this.name = 'ApiClientError';
      this.statusCode = statusCode;
      this.apiError = apiError;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  },
}));

const mockIsLinked = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../src/store/sessions.js', () => ({
  isLinked: mockIsLinked,
  getSession: mockGetSession,
  setSession: vi.fn(),
  removeSession: vi.fn(),
  getAllSessions: vi.fn(() => new Map().entries()),
  sessionCount: vi.fn(() => 0),
  updateLastSeenEventId: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a mock Telegraf context for callback_query updates.
 */
function makeMockCallbackCtx(
  callbackData: string,
  fromId: number = 2000
): {
  from: { id: number };
  chat: { id: number };
  message: undefined;
  callbackQuery: { data: string };
  reply: ReturnType<typeof vi.fn>;
  replyWithMarkdown: ReturnType<typeof vi.fn>;
  answerCbQuery: ReturnType<typeof vi.fn>;
  updateType: string;
} {
  return {
    from: { id: fromId },
    chat: { id: fromId + 1000 },
    message: undefined,
    callbackQuery: { data: callbackData },
    reply: vi.fn().mockResolvedValue(undefined),
    replyWithMarkdown: vi.fn().mockResolvedValue(undefined),
    answerCbQuery: vi.fn().mockResolvedValue(undefined),
    updateType: 'callback_query',
  };
}

const TEST_SESSION = {
  userId: 'client-uid',
  jwt: 'jwt-test',
  walletAddress: '0xtest',
  lastSeenEventAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: user is linked
  mockIsLinked.mockReturnValue(true);
  mockGetSession.mockReturnValue(TEST_SESSION);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('milestone callbacks', () => {
  describe('approve callback', () => {
    it('calls approveMilestone and sends confirmation', async () => {
      mockApproveMilestone.mockResolvedValueOnce({
        id: 'ms-001',
        dealId: 'deal-001',
        status: 'APPROVED',
      });

      const ctx = makeMockCallbackCtx('approve:ms-001');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(mockApproveMilestone).toHaveBeenCalledOnce();
      expect(mockApproveMilestone).toHaveBeenCalledWith('jwt-test', 'ms-001');
      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Processing approval...');
      expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
      const msg = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
      expect(msg).toContain('approved');
    });

    it('handles 400 API error with user-friendly message', async () => {
      const { ApiClientError } = await import('../src/api-client/index.js');
      mockApproveMilestone.mockRejectedValueOnce(
        new ApiClientError(
          400,
          { error: 'INVALID_TRANSITION', message: 'Cannot approve from PENDING' },
          'API error 400'
        )
      );

      const ctx = makeMockCallbackCtx('approve:ms-002');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.reply).toHaveBeenCalledOnce();
      const msg = ctx.reply.mock.calls[0]?.[0] as string;
      expect(msg).toContain('Cannot approve');
    });

    it('sends link instructions when user is not linked', async () => {
      mockIsLinked.mockReturnValue(false);
      mockGetSession.mockReturnValue(undefined);

      const ctx = makeMockCallbackCtx('approve:ms-003');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Please link your account first.');
      expect(mockApproveMilestone).not.toHaveBeenCalled();
    });
  });

  describe('reject callback', () => {
    it('shows confirmation prompt with confirm/cancel buttons', async () => {
      const ctx = makeMockCallbackCtx('reject:ms-004');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Preparing rejection...');
      expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
      const [msg] = ctx.replyWithMarkdown.mock.calls[0] as [string, unknown];
      expect(msg).toContain('Reject Milestone');
    });
  });

  describe('confirm_reject callback', () => {
    it('calls rejectMilestone with default reason codes', async () => {
      mockRejectMilestone.mockResolvedValueOnce({
        id: 'rejection-001',
        submissionId: 'sub-001',
        reasonCodes: ['INCOMPLETE'],
        freeText: 'Rejected via bot',
        createdAt: new Date().toISOString(),
      });

      const ctx = makeMockCallbackCtx('confirm_reject:ms-005');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(mockRejectMilestone).toHaveBeenCalledOnce();
      const [jwt, milestoneId, body] = mockRejectMilestone.mock.calls[0] as [
        string,
        string,
        { reasonCodes: string[]; freeText: string },
      ];
      expect(jwt).toBe('jwt-test');
      expect(milestoneId).toBe('ms-005');
      expect(body.reasonCodes).toContain('INCOMPLETE');

      expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
      const msg = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
      expect(msg).toContain('rejected');
    });
  });

  describe('submit callback', () => {
    it('shows confirmation prompt with confirm/cancel buttons', async () => {
      const ctx = makeMockCallbackCtx('submit:ms-006');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Preparing submission...');
      expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
      const [msg] = ctx.replyWithMarkdown.mock.calls[0] as [string, unknown];
      expect(msg).toContain('Submit Milestone');
    });
  });

  describe('confirm_submit callback', () => {
    it('calls submitMilestone with default summary', async () => {
      mockSubmitMilestone.mockResolvedValueOnce({
        id: 'sub-002',
        milestoneId: 'ms-007',
        submittedBy: 'user-1',
        summary: 'Submitted via bot',
        links: [],
        createdAt: new Date().toISOString(),
      });

      const ctx = makeMockCallbackCtx('confirm_submit:ms-007');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(mockSubmitMilestone).toHaveBeenCalledOnce();
      const [jwt, milestoneId, body] = mockSubmitMilestone.mock.calls[0] as [
        string,
        string,
        { summary: string; links: string[] },
      ];
      expect(jwt).toBe('jwt-test');
      expect(milestoneId).toBe('ms-007');
      expect(typeof body.summary).toBe('string');
      expect(body.links).toEqual([]);

      expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
      const msg = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
      expect(msg).toContain('submitted');
    });
  });

  describe('deal_status callback', () => {
    it('fetches and displays deal status', async () => {
      mockGetDeal.mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440009',
        status: 'FUNDED',
        clientId: 'client-uid',
        freelancerId: 'f-uid',
        totalAmount: '5000',
        milestones: [],
        createdAt: new Date().toISOString(),
        agreedAt: null,
        tokenAddress: '0xusdc',
        chainDealId: null,
      });

      const ctx = makeMockCallbackCtx('deal_status:550e8400-e29b-41d4-a716-446655440009');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(mockGetDeal).toHaveBeenCalledOnce();
      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Fetching deal...');
      expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
      const msg = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
      expect(msg).toContain('550e840');
    });
  });

  describe('cancel_action callback', () => {
    it('sends cancelled message', async () => {
      const ctx = makeMockCallbackCtx('cancel_action:ms-999');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Cancelled.');
      expect(ctx.reply).toHaveBeenCalledWith('Action cancelled.');
    });
  });

  describe('unknown callback', () => {
    it('answers query with unknown action message', async () => {
      const ctx = makeMockCallbackCtx('unknown_action:some-id');
      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith('Unknown action.');
    });
  });

  describe('missing callback data', () => {
    it('answers query and returns gracefully', async () => {
      const ctx = {
        from: { id: 9000 },
        chat: { id: 9001 },
        callbackQuery: {}, // no 'data' property
        reply: vi.fn().mockResolvedValue(undefined),
        replyWithMarkdown: vi.fn().mockResolvedValue(undefined),
        answerCbQuery: vi.fn().mockResolvedValue(undefined),
        updateType: 'callback_query',
      };

      const { milestoneCallbackHandler } = await import('../src/callbacks/milestone.js');
      await milestoneCallbackHandler(ctx as never);

      expect(ctx.answerCbQuery).toHaveBeenCalledOnce();
    });
  });
});
