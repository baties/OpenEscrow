/**
 * tests/commands.test.ts — OpenEscrow Telegram Bot
 *
 * Handles: Unit tests for all bot command handlers (/start, /link, /deals, /status).
 *          Uses mocked Telegraf context (ctx) to simulate user messages.
 *          Tests the isLinked guard, input validation, and API error handling.
 * Does NOT: make real network calls (api-client is mocked),
 *           test real Telegraf routing, or test notification polling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock environment first ───────────────────────────────────────────────────

vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: 'test-token-123456789',
    API_BASE_URL: 'http://localhost:3001',
    BOT_API_SECRET: 'test-secret-32-chars-minimum-ok',
    POLL_INTERVAL_MS: 30000,
    LOG_LEVEL: 'silent',
    USDC_ADDRESS: '',
    USDT_ADDRESS: '',
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

// ─── Mock API client ──────────────────────────────────────────────────────────

const mockListDeals = vi.fn();
const mockGetDeal = vi.fn();

vi.mock('../src/api-client/index.js', () => ({
  listDeals: mockListDeals,
  getDeal: mockGetDeal,
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

// ─── Mock sessions store ──────────────────────────────────────────────────────

const mockIsLinked = vi.fn();
const mockGetSession = vi.fn();
const mockSetSession = vi.fn();

vi.mock('../src/store/sessions.js', () => ({
  isLinked: mockIsLinked,
  getSession: mockGetSession,
  setSession: mockSetSession,
  removeSession: vi.fn(),
  getAllSessions: vi.fn(() => new Map().entries()),
  sessionCount: vi.fn(() => 0),
  updateLastSeenEventId: vi.fn(),
}));

// ─── Telegraf Context Mock ────────────────────────────────────────────────────

/**
 * Creates a minimal mock of a Telegraf Context for testing command handlers.
 */
function makeMockCtx(
  overrides: {
    fromId?: number;
    chatId?: number;
    messageText?: string;
  } = {}
): {
  from: { id: number } | undefined;
  chat: { id: number } | undefined;
  message: { text: string } | undefined;
  reply: ReturnType<typeof vi.fn>;
  replyWithMarkdown: ReturnType<typeof vi.fn>;
  answerCbQuery: ReturnType<typeof vi.fn>;
  callbackQuery: undefined;
  updateType: string;
} {
  return {
    from: overrides.fromId !== undefined ? { id: overrides.fromId } : undefined,
    chat: overrides.chatId !== undefined ? { id: overrides.chatId } : { id: 100 },
    message: overrides.messageText !== undefined ? { text: overrides.messageText } : undefined,
    reply: vi.fn().mockResolvedValue(undefined),
    replyWithMarkdown: vi.fn().mockResolvedValue(undefined),
    answerCbQuery: vi.fn().mockResolvedValue(undefined),
    callbackQuery: undefined,
    updateType: 'message',
  };
}

// ─── Reset mocks ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── /start command tests ─────────────────────────────────────────────────────

describe('/start command', () => {
  it('shows link instructions when user is not linked', async () => {
    mockIsLinked.mockReturnValue(false);
    const ctx = makeMockCtx({ fromId: 111, messageText: '/start' });

    const { startCommandHandler } = await import('../src/commands/start.js');
    await startCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Welcome');
    expect(call).toContain('/link');
  });

  it('shows linked status message when user is linked', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'user-1',
      jwt: 'jwt-token',
      walletAddress: '0xdeadbeef',
      lastSeenEventAt: null,
    });
    const ctx = makeMockCtx({ fromId: 222, messageText: '/start' });

    const { startCommandHandler } = await import('../src/commands/start.js');
    await startCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Linked');
    expect(call).toContain('0xdeadbeef');
  });
});

// ─── /link command tests ──────────────────────────────────────────────────────

describe('/link command', () => {
  it('sends usage instructions when no code argument is provided', async () => {
    const ctx = makeMockCtx({ fromId: 333, messageText: '/link' });

    const { linkCommandHandler } = await import('../src/commands/link.js');
    await linkCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Missing link code');
  });

  it('rejects non-hex code format', async () => {
    const ctx = makeMockCtx({ fromId: 444, messageText: '/link not-valid-code!' });

    const { linkCommandHandler } = await import('../src/commands/link.js');
    await linkCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Invalid code format');
  });

  it('shows Telegram ID and instructs web dashboard on valid code', async () => {
    const ctx = makeMockCtx({ fromId: 555, messageText: '/link a1b2c3d4' });

    const { linkCommandHandler } = await import('../src/commands/link.js');
    await linkCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Code received');
    expect(call).toContain('a1b2c3d4');
    expect(call).toContain('555'); // Telegram user ID shown to user
  });

  it('handles missing ctx.from.id gracefully', async () => {
    const ctx = makeMockCtx({ messageText: '/link a1b2c3d4' });
    (ctx as { from: undefined }).from = undefined;

    const { linkCommandHandler } = await import('../src/commands/link.js');
    await linkCommandHandler(ctx as never);

    expect(ctx.reply).toHaveBeenCalledOnce();
    const call = ctx.reply.mock.calls[0]?.[0] as string;
    expect(call).toContain('Telegram user ID');
  });
});

// ─── /deals command tests ─────────────────────────────────────────────────────

describe('/deals command', () => {
  it('sends link instructions when user is not linked', async () => {
    mockIsLinked.mockReturnValue(false);
    mockGetSession.mockReturnValue(undefined);
    const ctx = makeMockCtx({ fromId: 666, messageText: '/deals' });

    const { dealsCommandHandler } = await import('../src/commands/deals.js');
    await dealsCommandHandler(ctx as never);

    // requireLinked sends the link instructions message
    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    expect(mockListDeals).not.toHaveBeenCalled();
  });

  it('shows no deals message when API returns empty list', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'user-2',
      jwt: 'jwt-2',
      walletAddress: '0xfeed',
      lastSeenEventAt: null,
    });
    mockListDeals.mockResolvedValueOnce({ deals: [] });

    const ctx = makeMockCtx({ fromId: 777, messageText: '/deals' });

    const { dealsCommandHandler } = await import('../src/commands/deals.js');
    await dealsCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('No deals found');
  });

  it('lists deals when API returns data', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'client-uid',
      jwt: 'jwt-3',
      walletAddress: '0xaaaa',
      lastSeenEventAt: null,
    });
    mockListDeals.mockResolvedValueOnce({
      deals: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'FUNDED',
          clientId: 'client-uid',
          freelancerId: 'freelancer-uid',
          totalAmount: '2000',
          milestones: [{ id: 'ms-1', title: 'Phase 1', status: 'PENDING' }],
          createdAt: new Date().toISOString(),
          agreedAt: null,
          tokenAddress: '0xusdc',
          chainDealId: null,
        },
      ],
    });

    const ctx = makeMockCtx({ fromId: 888, messageText: '/deals' });

    const { dealsCommandHandler } = await import('../src/commands/deals.js');
    await dealsCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Deals');
  });

  it('handles 401 API error gracefully', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'user-3',
      jwt: 'expired-jwt',
      walletAddress: '0xbbbb',
      lastSeenEventAt: null,
    });

    const { ApiClientError } = await import('../src/api-client/index.js');
    mockListDeals.mockRejectedValueOnce(
      new ApiClientError(401, { error: 'UNAUTHORIZED', message: 'Token expired' }, 'API error 401')
    );

    const ctx = makeMockCtx({ fromId: 999, messageText: '/deals' });

    const { dealsCommandHandler } = await import('../src/commands/deals.js');
    await dealsCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalled();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Session expired');
  });
});

// ─── /status command tests ────────────────────────────────────────────────────

describe('/status command', () => {
  it('sends link instructions when user is not linked', async () => {
    mockIsLinked.mockReturnValue(false);
    mockGetSession.mockReturnValue(undefined);

    const ctx = makeMockCtx({
      fromId: 1001,
      messageText: '/status 550e8400-e29b-41d4-a716-446655440000',
    });

    const { statusCommandHandler } = await import('../src/commands/status.js');
    await statusCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    expect(mockGetDeal).not.toHaveBeenCalled();
  });

  it('shows error when deal ID is missing', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'user-4',
      jwt: 'jwt-4',
      walletAddress: '0xcccc',
      lastSeenEventAt: null,
    });

    const ctx = makeMockCtx({ fromId: 1002, messageText: '/status' });

    const { statusCommandHandler } = await import('../src/commands/status.js');
    await statusCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Missing deal ID');
  });

  it('shows error when deal ID is not a valid UUID', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'user-5',
      jwt: 'jwt-5',
      walletAddress: '0xdddd',
      lastSeenEventAt: null,
    });

    const ctx = makeMockCtx({ fromId: 1003, messageText: '/status not-a-uuid' });

    const { statusCommandHandler } = await import('../src/commands/status.js');
    await statusCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('Invalid deal ID format');
  });

  it('displays deal status when API returns deal data', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'client-uid-5',
      jwt: 'jwt-6',
      walletAddress: '0xeeee',
      lastSeenEventAt: null,
    });
    mockGetDeal.mockResolvedValueOnce({
      id: '550e8400-e29b-41d4-a716-446655440001',
      status: 'FUNDED',
      clientId: 'client-uid-5',
      freelancerId: 'freelancer-uid-5',
      totalAmount: '3000',
      milestones: [
        {
          id: 'ms-10',
          dealId: '550e8400-e29b-41d4-a716-446655440001',
          title: 'Milestone One',
          description: 'First milestone',
          acceptanceCriteria: 'Test passing',
          amount: '1500',
          sequence: 1,
          status: 'PENDING',
        },
      ],
      createdAt: new Date().toISOString(),
      agreedAt: new Date().toISOString(),
      tokenAddress: '0xusdc',
      chainDealId: 'chain-1',
    });

    const ctx = makeMockCtx({
      fromId: 1004,
      messageText: '/status 550e8400-e29b-41d4-a716-446655440001',
    });

    const { statusCommandHandler } = await import('../src/commands/status.js');
    await statusCommandHandler(ctx as never);

    expect(ctx.replyWithMarkdown).toHaveBeenCalledOnce();
    const call = ctx.replyWithMarkdown.mock.calls[0]?.[0] as string;
    expect(call).toContain('550e840');
    expect(call).toContain('Milestone One');
  });

  it('handles 404 from API with friendly message', async () => {
    mockIsLinked.mockReturnValue(true);
    mockGetSession.mockReturnValue({
      userId: 'user-6',
      jwt: 'jwt-7',
      walletAddress: '0xffff',
      lastSeenEventAt: null,
    });

    const { ApiClientError } = await import('../src/api-client/index.js');
    mockGetDeal.mockRejectedValueOnce(
      new ApiClientError(404, { error: 'DEAL_NOT_FOUND', message: 'Not found' }, 'API error 404')
    );

    const ctx = makeMockCtx({
      fromId: 1005,
      messageText: '/status 550e8400-e29b-41d4-a716-446655440002',
    });

    const { statusCommandHandler } = await import('../src/commands/status.js');
    await statusCommandHandler(ctx as never);

    expect(ctx.reply).toHaveBeenCalledOnce();
    const call = ctx.reply.mock.calls[0]?.[0] as string;
    expect(call).toContain('not found');
  });
});
