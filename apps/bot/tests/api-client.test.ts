/**
 * tests/api-client.test.ts — OpenEscrow Telegram Bot
 *
 * Handles: Unit tests for the typed API client (api-client/index.ts).
 *          Tests retry logic, timeout handling, error mapping, and
 *          correct request formation for each API function.
 * Does NOT: make real network calls — all fetch calls are mocked.
 *           Tests do NOT require a running API server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClientError } from '../src/api-client/index.js';

// ─── Mock environment ─────────────────────────────────────────────────────────

// Must mock env BEFORE importing the api-client module so it sees our values
vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: 'test-token-123456789',
    API_BASE_URL: 'http://localhost:3001',
    POLL_INTERVAL_MS: 30000,
    LOG_LEVEL: 'silent',
  },
}));

// Mock pino logger to suppress output during tests
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

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// Replace global fetch with our mock
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a mock Response object that resolves with JSON body.
 */
function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name === 'content-type' ? 'application/json' : null),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('api-client', () => {
  const TEST_JWT = 'eyJhbGciOiJIUzI1NiJ9.test.signature';

  describe('listDeals', () => {
    it('returns deals on 200 response', async () => {
      const mockDeals = {
        deals: [
          {
            id: 'deal-001',
            status: 'FUNDED',
            clientId: 'client-1',
            freelancerId: 'freelancer-1',
            totalAmount: '1000',
            milestones: [],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, mockDeals));

      const { listDeals } = await import('../src/api-client/index.js');
      const result = await listDeals(TEST_JWT);
      expect(result.deals).toHaveLength(1);
      expect(result.deals[0]?.id).toBe('deal-001');
    });

    it('sends Authorization header with bearer token', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { deals: [] }));

      const { listDeals } = await import('../src/api-client/index.js');
      await listDeals(TEST_JWT);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    });

    it('throws ApiClientError on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(401, { error: 'UNAUTHORIZED', message: 'Valid JWT token required' }),
      );

      const { listDeals } = await import('../src/api-client/index.js');
      await expect(listDeals(TEST_JWT)).rejects.toBeInstanceOf(ApiClientError);
    });

    it('ApiClientError has correct statusCode and apiError on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(401, { error: 'UNAUTHORIZED', message: 'Valid JWT token required' }),
      );

      const { listDeals } = await import('../src/api-client/index.js');

      try {
        await listDeals(TEST_JWT);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(401);
        expect(apiErr.apiError?.error).toBe('UNAUTHORIZED');
      }
    });

    it('does not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValue(
        mockJsonResponse(404, { error: 'NOT_FOUND', message: 'Not found' }),
      );

      const { listDeals } = await import('../src/api-client/index.js');

      await expect(listDeals(TEST_JWT)).rejects.toBeInstanceOf(ApiClientError);
      // Should only be called once (no retries on 4xx)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDeal', () => {
    it('calls correct endpoint with deal ID', async () => {
      const mockDeal = {
        id: 'deal-abc',
        status: 'DRAFT',
        clientId: 'c1',
        freelancerId: 'f1',
        totalAmount: '500',
        milestones: [],
      };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, mockDeal));

      const { getDeal } = await import('../src/api-client/index.js');
      const result = await getDeal(TEST_JWT, 'deal-abc');

      expect(result.id).toBe('deal-abc');
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/deals/deal-abc');
    });

    it('throws ApiClientError with 404 status when deal not found', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(404, { error: 'DEAL_NOT_FOUND', message: 'Deal not found' }),
      );

      const { getDeal } = await import('../src/api-client/index.js');

      try {
        await getDeal(TEST_JWT, 'nonexistent-deal');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as ApiClientError).statusCode).toBe(404);
      }
    });
  });

  describe('approveMilestone', () => {
    it('posts to correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, { id: 'ms-001', dealId: 'deal-001', status: 'APPROVED' }),
      );

      const { approveMilestone } = await import('../src/api-client/index.js');
      const result = await approveMilestone(TEST_JWT, 'ms-001');

      expect(result.status).toBe('APPROVED');
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/milestones/ms-001/approve');
      expect(options.method).toBe('POST');
    });

    it('throws ApiClientError on 400 invalid transition', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(400, {
          error: 'INVALID_TRANSITION',
          message: 'Cannot transition from PENDING to APPROVED',
        }),
      );

      const { approveMilestone } = await import('../src/api-client/index.js');

      try {
        await approveMilestone(TEST_JWT, 'ms-002');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as ApiClientError).statusCode).toBe(400);
        expect((err as ApiClientError).apiError?.error).toBe('INVALID_TRANSITION');
      }
    });
  });

  describe('rejectMilestone', () => {
    it('posts correct body to reject endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, {
          id: 'rejection-001',
          submissionId: 'sub-001',
          reasonCodes: ['INCOMPLETE'],
          freeText: 'Not done',
          createdAt: new Date().toISOString(),
        }),
      );

      const { rejectMilestone } = await import('../src/api-client/index.js');
      const result = await rejectMilestone(TEST_JWT, 'ms-003', {
        reasonCodes: ['INCOMPLETE'],
        freeText: 'Not done',
      });

      expect(result.reasonCodes).toContain('INCOMPLETE');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/milestones/ms-003/reject');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string) as { reasonCodes: string[]; freeText: string };
      expect(body.reasonCodes).toContain('INCOMPLETE');
      expect(body.freeText).toBe('Not done');
    });
  });

  describe('submitMilestone', () => {
    it('posts correct body to submit endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, {
          id: 'sub-002',
          milestoneId: 'ms-004',
          submittedBy: 'user-1',
          summary: 'Done',
          links: [],
          createdAt: new Date().toISOString(),
        }),
      );

      const { submitMilestone } = await import('../src/api-client/index.js');
      await submitMilestone(TEST_JWT, 'ms-004', { summary: 'Done', links: [] });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/milestones/ms-004/submit');
    });
  });

  describe('agreeToDeal', () => {
    it('posts to agree endpoint with no body', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, {
          id: 'deal-005',
          status: 'AGREED',
          clientId: 'c1',
          freelancerId: 'f1',
          totalAmount: '1000',
          milestones: [],
        }),
      );

      const { agreeToDeal } = await import('../src/api-client/index.js');
      const result = await agreeToDeal(TEST_JWT, 'deal-005');

      expect(result.status).toBe('AGREED');
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/deals/deal-005/agree');
      expect(options.method).toBe('POST');
    });
  });

  describe('cancelDeal', () => {
    it('posts to cancel endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, {
          id: 'deal-006',
          status: 'CANCELLED',
          clientId: 'c1',
          freelancerId: 'f1',
          totalAmount: '1000',
          milestones: [],
        }),
      );

      const { cancelDeal } = await import('../src/api-client/index.js');
      const result = await cancelDeal(TEST_JWT, 'deal-006');

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('getDealTimeline', () => {
    it('returns events on 200', async () => {
      const mockTimeline = {
        events: [
          {
            id: 'evt-001',
            dealId: 'deal-007',
            actorId: 'user-1',
            eventType: 'DEAL_CREATED',
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, mockTimeline));

      const { getDealTimeline } = await import('../src/api-client/index.js');
      const result = await getDealTimeline(TEST_JWT, 'deal-007');

      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.eventType).toBe('DEAL_CREATED');
    });
  });
});
