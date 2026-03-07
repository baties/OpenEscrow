/**
 * api-client.test.ts — OpenEscrow Web Dashboard Tests
 *
 * Unit tests for the API client module.
 * Handles: testing request construction, error parsing, auth header injection,
 *          401 auth-expiry handling.
 * Does NOT: make real HTTP requests (all fetch calls are mocked),
 *            test React components or hooks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi, dealsApi, milestonesApi, telegramApi } from '../src/lib/api-client';
import * as authStorage from '../src/lib/auth-storage';

// ─── Setup ────────────────────────────────────────────────────────────────────

// Mock the fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock auth storage module
vi.mock('../src/lib/auth-storage', () => ({
  getAuthToken: vi.fn(() => null),
  clearAuth: vi.fn(),
  saveAuth: vi.fn(),
  getStoredWalletAddress: vi.fn(() => null),
  isAuthenticated: vi.fn(() => false),
}));

// Mock the config module (prevents env var validation from failing)
vi.mock('../src/lib/config', () => ({
  config: {
    apiUrl: 'http://localhost:3001',
    chainId: 11155111,
    contractAddress: '0x1234567890123456789012345678901234567890',
    usdcAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    usdtAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    walletConnectProjectId: 'test-project-id',
  },
}));

/**
 * Creates a mock Response object.
 *
 * @param status - HTTP status code
 * @param body - Response body (will be JSON.stringified)
 * @returns A partial Response-like object
 */
function mockResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset auth token to unauthenticated by default
  vi.mocked(authStorage.getAuthToken).mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Auth API tests ────────────────────────────────────────────────────────────

describe('authApi.getNonce', () => {
  it('makes a POST request to /api/v1/auth/nonce with wallet address', async () => {
    const mockNonce = { nonce: 'abc123def456' };
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockNonce));

    const result = await authApi.getNonce('0x1234567890abcdef');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/auth/nonce');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ walletAddress: '0x1234567890abcdef' });
    expect(result).toEqual(mockNonce);
  });

  it('throws ApiCallError on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(500, { error: 'INTERNAL_ERROR', message: 'Server error' })
    );

    const { ApiCallError } = await import('../src/lib/errors');
    await expect(authApi.getNonce('0xabc')).rejects.toThrow(ApiCallError);
  });
});

describe('authApi.verify', () => {
  it('makes a POST request to /api/v1/auth/verify with message and signature', async () => {
    const mockResult = { token: 'jwt.token.here', userId: 'user-1', walletAddress: '0xabc' };
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockResult));

    const result = await authApi.verify('siwe message', '0xsig');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ message: 'siwe message', signature: '0xsig' });
    expect(result.token).toBe('jwt.token.here');
  });
});

// ─── Request auth header tests ─────────────────────────────────────────────────

describe('API client auth headers', () => {
  it('includes Authorization header when a token is stored', async () => {
    vi.mocked(authStorage.getAuthToken).mockReturnValue('my-jwt-token');
    mockFetch.mockResolvedValueOnce(mockResponse(200, []));

    await dealsApi.list();

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('does not include Authorization header when no token is stored', async () => {
    vi.mocked(authStorage.getAuthToken).mockReturnValue(null);
    mockFetch.mockResolvedValueOnce(mockResponse(200, []));

    await dealsApi.list();

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});

// ─── 401 handling ─────────────────────────────────────────────────────────────

describe('401 auth expiry handling', () => {
  it('clears auth and throws AuthExpiredError on 401 response', async () => {
    vi.mocked(authStorage.getAuthToken).mockReturnValue('expired-token');
    mockFetch.mockResolvedValueOnce(mockResponse(401, { error: 'UNAUTHORIZED', message: 'Token expired' }));

    // Mock window.dispatchEvent
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    const { AuthExpiredError } = await import('../src/lib/errors');
    await expect(dealsApi.list()).rejects.toThrow(AuthExpiredError);

    expect(authStorage.clearAuth).toHaveBeenCalledOnce();
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth:expired' })
    );
  });
});

// ─── Deals API tests ───────────────────────────────────────────────────────────

describe('dealsApi.list', () => {
  it('makes a GET request to /api/v1/deals', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, []));

    await dealsApi.list();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/deals');
    expect(opts.method).toBeUndefined(); // GET is default
  });
});

describe('dealsApi.get', () => {
  it('encodes the deal ID in the URL', async () => {
    const deal = { id: 'deal-123', status: 'DRAFT', milestones: [] };
    mockFetch.mockResolvedValueOnce(mockResponse(200, deal));

    await dealsApi.get('deal-123');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/deals/deal-123');
  });
});

describe('dealsApi.agree', () => {
  it('makes a POST to /api/v1/deals/:id/agree', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { deal: { status: 'AGREED' } }));

    await dealsApi.agree('deal-abc');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/deals/deal-abc/agree');
    expect(opts.method).toBe('POST');
  });
});

describe('dealsApi.cancel', () => {
  it('makes a POST to /api/v1/deals/:id/cancel', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { deal: { status: 'CANCELLED' } }));

    await dealsApi.cancel('deal-xyz');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/deals/deal-xyz/cancel');
    expect(opts.method).toBe('POST');
  });
});

describe('dealsApi.getTimeline', () => {
  it('makes a GET to /api/v1/deals/:id/timeline', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, []));

    await dealsApi.getTimeline('deal-timeline-test');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/deals/deal-timeline-test/timeline');
  });
});

// ─── Milestones API tests ──────────────────────────────────────────────────────

describe('milestonesApi.submit', () => {
  it('makes a POST to /api/v1/milestones/:id/submit with summary and links', async () => {
    const mockResult = {
      milestone: { id: 'm-1', status: 'SUBMITTED' },
      submission: { id: 's-1' },
    };
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockResult));

    await milestonesApi.submit('m-1', {
      summary: 'Completed the feature',
      links: ['https://github.com/repo'],
    });

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/milestones/m-1/submit');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      summary: 'Completed the feature',
      links: ['https://github.com/repo'],
    });
  });
});

describe('milestonesApi.approve', () => {
  it('makes a POST to /api/v1/milestones/:id/approve', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { milestone: { id: 'm-2', status: 'APPROVED' } })
    );

    await milestonesApi.approve('m-2');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/milestones/m-2/approve');
    expect(opts.method).toBe('POST');
  });
});

describe('milestonesApi.reject', () => {
  it('makes a POST to /api/v1/milestones/:id/reject with reason codes', async () => {
    const mockResult = {
      milestone: { id: 'm-3', status: 'REJECTED' },
      rejectionNote: { id: 'rn-1' },
    };
    mockFetch.mockResolvedValueOnce(mockResponse(200, mockResult));

    await milestonesApi.reject('m-3', {
      reasonCodes: ['INCOMPLETE_DELIVERABLE'],
      freeText: 'Missing tests',
    });

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/milestones/m-3/reject');
    expect(JSON.parse(opts.body as string)).toEqual({
      reasonCodes: ['INCOMPLETE_DELIVERABLE'],
      freeText: 'Missing tests',
    });
  });
});

// ─── Telegram API tests ────────────────────────────────────────────────────────

describe('telegramApi.generateCode', () => {
  it('makes a POST to /api/v1/telegram/generate-code', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { code: 'ABC123', expiresAt: '2024-01-01T00:00:00Z' })
    );

    const result = await telegramApi.generateCode();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/telegram/generate-code');
    expect(opts.method).toBe('POST');
    expect(result.code).toBe('ABC123');
  });
});

describe('telegramApi.link', () => {
  it('makes a POST to /api/v1/telegram/link with oneTimeCode and telegramUserId', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true, message: 'Linked' })
    );

    await telegramApi.link('LINK-CODE', '123456789');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/telegram/link');
    expect(JSON.parse(opts.body as string)).toEqual({ oneTimeCode: 'LINK-CODE', telegramUserId: '123456789' });
  });
});

describe('telegramApi.unlink', () => {
  it('makes a DELETE to /api/v1/telegram/unlink', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(204, null));

    await telegramApi.unlink();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/telegram/unlink');
    expect(opts.method).toBe('DELETE');
  });
});
