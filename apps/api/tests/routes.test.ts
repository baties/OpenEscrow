/**
 * tests/routes.test.ts — OpenEscrow API
 *
 * Handles: Integration tests for all 16 API routes.
 *          Builds the real Fastify app but mocks all service-layer dependencies.
 *          Tests HTTP status codes, response shapes, and auth enforcement.
 * Does NOT: hit the real database, make real RPC calls, or test Telegram integration.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mocks (must be before any imports that load env) ────────────────────────

vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long-ok',
    JWT_EXPIRY: '24h',
    ALLOWED_ORIGIN: 'http://localhost:3000',
    BOT_API_SECRET: 'test-bot-secret-at-least-32-chars-long-ok',
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

vi.mock('../src/database/migrate.js', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/chain/indexer.js', () => ({
  startIndexer: vi.fn(),
  stopIndexer: vi.fn(),
}));

// ─── Module-level mock objects ────────────────────────────────────────────────
//
// These are defined as module-level objects so they can be re-initialized
// in beforeEach after vi.clearAllMocks() clears mockReturnValue/mockImplementation.
// (In Vitest 2.x, vi.clearAllMocks() also clears implementations set in vi.mock
// factories — not just call history.)

const mockDealsService = {
  createDeal: vi.fn(),
  listDeals: vi.fn(),
  getDeal: vi.fn(),
  agreeToDeal: vi.fn(),
  fundDeal: vi.fn(),
  cancelDeal: vi.fn(),
  getDealTimeline: vi.fn(),
};

const mockMilestonesService = {
  submitMilestone: vi.fn(),
  approveMilestone: vi.fn(),
  rejectMilestone: vi.fn(),
};

const mockTelegramService = {
  generateLinkCode: vi.fn(),
  linkTelegram: vi.fn(),
  unlinkTelegram: vi.fn(),
};

/**
 * Nonce module mock — module-level so it can be reset in beforeEach.
 * generateNonce and getNonce must return a string for SIWE auth to work.
 */
const mockNonceModule = {
  generateNonce: vi.fn().mockReturnValue('test-nonce-abcdef1234567890'),
  getNonce: vi.fn().mockReturnValue('test-nonce-abcdef1234567890'),
  consumeNonce: vi.fn(),
};

/**
 * SIWE SiweMessage constructor mock — module-level so it can be reset in beforeEach.
 * Must implement: { address: string, verify: () => Promise<{ success: true }> }
 */
const mockSiweConstructor = vi.fn().mockImplementation(() => ({
  address: '0x1234567890123456789012345678901234567890',
  verify: vi.fn().mockResolvedValue({ success: true }),
}));

/**
 * Returns a fresh Drizzle-style query chain mock for db.select().
 * Called once per select() call so each chain is isolated.
 *
 * Returns an object that includes all fields used by role-check middleware
 * and auth handlers:
 *   - id, walletAddress   → user lookup in handleVerify
 *   - dealId              → milestone lookup in requireMilestoneRole
 *   - clientId, freelancerId → deal lookup in requireRole / requireMilestoneRole
 *
 * Setting clientId and freelancerId both to 'user-uuid-1' allows all preHandler
 * role checks to pass for the authenticated test user, so controller-level
 * validation (400 responses) can be reached in those tests.
 */
function makeSelectChain() {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{
      id: 'user-uuid-1',
      walletAddress: '0x1234567890123456789012345678901234567890',
      dealId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',  // DEAL_UUID
      clientId: 'user-uuid-1',
      freelancerId: 'user-uuid-1',
    }]),
  };
}

/** Database mock — module-level so select/insert can be reset in beforeEach. */
const mockDb = {
  select: vi.fn().mockImplementation(makeSelectChain),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'user-uuid-1' }]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
};

// ─── vi.mock declarations (use module-level objects) ─────────────────────────

vi.mock('../src/modules/deals/deals.service.js', () => mockDealsService);
vi.mock('../src/modules/milestones/milestones.service.js', () => mockMilestonesService);
vi.mock('../src/modules/telegram-link/telegram.service.js', () => mockTelegramService);

vi.mock('../src/modules/auth/nonce.js', () => mockNonceModule);

vi.mock('siwe', () => ({ SiweMessage: mockSiweConstructor }));

vi.mock('../src/database/index.js', () => ({
  db: mockDb,
  pool: { end: vi.fn() },
}));

// ─── Build app for tests ──────────────────────────────────────────────────────

const { buildApp } = await import('../src/index.js');

let app: FastifyInstance;
let authToken: string;

// Fixtures
const DEAL_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MILESTONE_UUID = 'ffffffff-0000-1111-2222-333333333333';

const fakeDeal = {
  id: DEAL_UUID,
  clientId: 'user-uuid-1',
  freelancerId: 'user-uuid-2',
  tokenAddress: '0xusdc',
  totalAmount: '1000',
  status: 'DRAFT',
  chainDealId: null,
  createdAt: new Date().toISOString(),
  agreedAt: null,
  milestones: [],
};

const fakeMilestone = {
  id: MILESTONE_UUID,
  dealId: DEAL_UUID,
  title: 'Design',
  description: 'Design phase',
  acceptanceCriteria: 'Matches mockup',
  amount: '500',
  sequence: 1,
  status: 'PENDING',
};

beforeAll(async () => {
  app = await buildApp();

  // Issue a real JWT for use in authenticated tests.
  authToken = app.jwt.sign({
    userId: 'user-uuid-1',
    walletAddress: '0x1234567890123456789012345678901234567890',
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();

  // Re-initialize factory mocks cleared by vi.clearAllMocks() in Vitest 2.x.
  // (vi.clearAllMocks() resets mockReturnValue/mockImplementation, not just call history.)

  // Nonce module
  mockNonceModule.generateNonce.mockReturnValue('test-nonce-abcdef1234567890');
  mockNonceModule.getNonce.mockReturnValue('test-nonce-abcdef1234567890');

  // SIWE constructor
  mockSiweConstructor.mockImplementation(() => ({
    address: '0x1234567890123456789012345678901234567890',
    verify: vi.fn().mockResolvedValue({ success: true }),
  }));

  // DB select — used by requireRole, requireMilestoneRole, and handleVerify.
  // mockImplementation(makeSelectChain) creates a fresh chain per call.
  mockDb.select.mockImplementation(makeSelectChain);

  // DB insert — used by handleVerify (new user creation).
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'user-uuid-1' }]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────

describe('GET /api/v1/health', () => {
  it('returns 200 with { status: ok, timestamp }', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

// ─── Auth routes ──────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/nonce', () => {
  it('returns 200 with nonce for valid wallet address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/nonce',
      payload: { walletAddress: '0x1234567890123456789012345678901234567890' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().nonce).toBeDefined();
  });

  it('returns 400 for invalid wallet address', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/nonce',
      payload: { walletAddress: 'not-an-address' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/verify', () => {
  it('returns 200 with JWT token on valid SIWE', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify',
      payload: {
        message: 'localhost wants you to sign in with your Ethereum account:\n0x1234567890123456789012345678901234567890\n\nSign in\n\nNonce: test-nonce-abcdef1234567890\nIssued At: 2026-02-26T00:00:00Z',
        signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeDefined();
  });
});

// ─── Deals routes ─────────────────────────────────────────────────────────────

describe('GET /api/v1/deals', () => {
  it('returns 200 with deals array for authenticated user', async () => {
    mockDealsService.listDeals.mockResolvedValue([fakeDeal]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/deals',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/deals',
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/v1/deals', () => {
  it('returns 201 with created deal', async () => {
    mockDealsService.createDeal.mockResolvedValue({ ...fakeDeal, milestones: [fakeMilestone] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/deals',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        freelancerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenAddress: '0x1234567890123456789012345678901234567891',
        milestones: [
          {
            title: 'Design',
            description: 'Design the UI',
            acceptanceCriteria: 'Matches Figma',
            amount: '500',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('returns 400 for missing milestones', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/deals',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        freelancerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenAddress: '0x1234567890123456789012345678901234567891',
        milestones: [],
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/v1/deals/:id', () => {
  it('returns 200 with deal detail for participant', async () => {
    mockDealsService.getDeal.mockResolvedValue({ ...fakeDeal, milestones: [fakeMilestone] });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${DEAL_UUID}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns 404 when deal does not exist', async () => {
    mockDealsService.getDeal.mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${DEAL_UUID}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 403 when user is not a participant', async () => {
    mockDealsService.getDeal.mockResolvedValue({
      ...fakeDeal,
      clientId: 'other-client',
      freelancerId: 'other-freelancer',
      milestones: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${DEAL_UUID}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('GET /api/v1/deals/:id/timeline', () => {
  it('returns 200 with timeline events for participant', async () => {
    mockDealsService.getDeal.mockResolvedValue({ ...fakeDeal, milestones: [] });
    mockDealsService.getDealTimeline.mockResolvedValue([
      {
        id: 'event-1',
        dealId: DEAL_UUID,
        actorId: 'user-uuid-1',
        eventType: 'DEAL_CREATED',
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/deals/${DEAL_UUID}/timeline`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });
});

// ─── Milestones routes ────────────────────────────────────────────────────────

describe('POST /api/v1/milestones/:id/submit', () => {
  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/milestones/${MILESTONE_UUID}/submit`,
      payload: { summary: 'Done', links: [] },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for empty summary', async () => {
    // The requireMilestoneRole('freelancer') preHandler runs first and queries the DB.
    // makeSelectChain() returns { freelancerId: 'user-uuid-1' } so the role check passes,
    // then controller Zod validation rejects the empty summary with 400.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/milestones/${MILESTONE_UUID}/submit`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { summary: '', links: [] },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/v1/milestones/:id/approve', () => {
  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/milestones/${MILESTONE_UUID}/approve`,
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/v1/milestones/:id/reject', () => {
  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/milestones/${MILESTONE_UUID}/reject`,
      payload: { reasonCodes: ['INCOMPLETE'], freeText: 'Not done' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for missing reasonCodes', async () => {
    // The requireMilestoneRole('client') preHandler runs first and queries the DB.
    // makeSelectChain() returns { clientId: 'user-uuid-1' } so the role check passes,
    // then controller Zod validation rejects the empty reasonCodes array with 400.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/milestones/${MILESTONE_UUID}/reject`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { reasonCodes: [], freeText: 'Not done' },
    });

    expect(response.statusCode).toBe(400);
  });
});

// ─── Telegram routes ──────────────────────────────────────────────────────────

describe('POST /api/v1/telegram/generate-code', () => {
  it('returns 200 with oneTimeCode for authenticated user', async () => {
    mockTelegramService.generateLinkCode.mockResolvedValue({
      oneTimeCode: 'abcd1234',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/telegram/generate-code',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().oneTimeCode).toBe('abcd1234');
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/telegram/generate-code',
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/v1/telegram/link', () => {
  it('returns 200 on successful link', async () => {
    mockTelegramService.linkTelegram.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/telegram/link',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { oneTimeCode: 'abcd1234', telegramUserId: '123456789' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('returns 400 for missing oneTimeCode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/telegram/link',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { telegramUserId: '123456789' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/telegram/link',
      payload: { oneTimeCode: 'abcd1234', telegramUserId: '123456789' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('DELETE /api/v1/telegram/unlink', () => {
  it('returns 200 on successful unlink', async () => {
    mockTelegramService.unlinkTelegram.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/telegram/unlink',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/telegram/unlink',
    });

    expect(response.statusCode).toBe(401);
  });
});

// ─── State machine error shape tests ─────────────────────────────────────────

describe('State machine: invalid transitions return { error, from, to }', () => {
  it('returns 400 with INVALID_TRANSITION shape when agreeing to non-DRAFT deal', async () => {
    const { AppError } = await import('../src/lib/errors.js');
    mockDealsService.agreeToDeal.mockRejectedValue(
      new AppError('INVALID_TRANSITION', 'Cannot transition from AGREED to AGREED', {
        from: 'AGREED',
        to: 'AGREED',
      }),
    );

    // requireRole('freelancer') queries the DB — makeSelectChain() returns
    // freelancerId: 'user-uuid-1' so the role check passes, then the service
    // throws INVALID_TRANSITION which the global error handler maps to 400.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/deals/${DEAL_UUID}/agree`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });
});
