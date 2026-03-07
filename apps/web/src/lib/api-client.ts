/**
 * api-client.ts — OpenEscrow Web Dashboard
 *
 * Single API client for ALL HTTP calls from the web dashboard to the OpenEscrow API.
 * Handles: authenticated requests (JWT Bearer), error parsing, 401 auth expiry handling.
 * Does NOT: contain business logic, manage React state, or call any API other than
 *            the OpenEscrow backend at NEXT_PUBLIC_API_URL.
 *
 * IMPORTANT: Every fetch() call in the entire web app MUST go through this module.
 * Raw fetch() calls outside this file are a FAILURE CONDITION per CLAUDE.md Section L.
 *
 * Auth token storage: localStorage (see auth-storage.ts for rationale).
 * On 401: clears stored auth and dispatches a custom 'auth:expired' window event
 *         so the AuthProvider can redirect to home without circular imports.
 */

import type {
  Deal,
  DealEvent,
  Milestone,
  Submission,
  RejectionNote,
  HealthResponse,
} from '@open-escrow/shared';
import { config } from './config';
import { getAuthToken, clearAuth } from './auth-storage';
import {
  ApiCallError,
  AuthExpiredError,
  NetworkError,
  isApiErrorBody,
} from './errors';

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Builds request headers for an API call, including the Authorization header
 * when a JWT is present in storage.
 * Content-Type: application/json is only set when hasBody is true — sending
 * that header with an empty body causes Fastify to reject the request with 400.
 *
 * @param hasBody - Whether the request includes a JSON body
 * @param extraHeaders - Optional additional headers to merge in
 * @returns A Record of HTTP headers
 */
function buildHeaders(hasBody: boolean, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...extraHeaders,
  };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Parses an API response, throwing typed errors for non-2xx status codes.
 * On 401: clears stored auth and dispatches 'auth:expired' window event.
 *
 * @param response - The raw fetch Response object
 * @returns The parsed JSON body typed as T
 * @throws {AuthExpiredError} On HTTP 401 responses
 * @throws {ApiCallError} On any non-2xx response
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new AuthExpiredError();
  }

  // Try to parse body as JSON regardless of status to capture error messages
  let body: unknown;
  const text = await response.text();
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON body (e.g. HTML error page from Next.js or proxy)
    body = { error: 'PARSE_ERROR', message: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    const errorBody = isApiErrorBody(body)
      ? body
      : { error: 'UNKNOWN_ERROR', message: `HTTP ${response.status}` };
    throw new ApiCallError(response.status, errorBody);
  }

  return body as T;
}

/**
 * Core fetch wrapper that adds timeout (10s), error handling, and auth headers.
 * This is the only function in the codebase that calls the native fetch() API.
 *
 * @param path - API path relative to the base URL, e.g. "/api/v1/deals"
 * @param options - Standard RequestInit options (method, body, headers, etc.)
 * @returns Parsed response body typed as T
 * @throws {NetworkError} On network-level failures (no response)
 * @throws {AuthExpiredError} On 401 response
 * @throws {ApiCallError} On any non-2xx response
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.apiUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const response = await fetch(url, {
      ...options,
      headers: buildHeaders(options.body !== undefined, options.headers as Record<string, string> | undefined),
      signal: controller.signal,
    });
    return await parseResponse<T>(response);
  } catch (err) {
    if (err instanceof AuthExpiredError || err instanceof ApiCallError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new NetworkError(new Error(`Request to ${path} timed out after 10 seconds`));
    }
    throw new NetworkError(err);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── API Response Types ────────────────────────────────────────────────────────

/** Response from POST /auth/nonce */
export interface NonceResponse {
  nonce: string;
}

/** Response from POST /auth/verify */
export interface AuthVerifyResponse {
  token: string;
}

/** Response from POST /telegram/generate-code */
export interface TelegramCodeResponse {
  oneTimeCode: string;
  expiresAt: string;
}

/** Response from POST /telegram/link */
export interface TelegramLinkResponse {
  success: boolean;
  message: string;
}

/** Response from GET /telegram/status */
export interface TelegramStatusResponse {
  /** True if a Telegram account is currently linked to this wallet */
  linked: boolean;
  /** The linked Telegram numeric user ID, or null if not linked */
  telegramUserId: string | null;
  /** ISO 8601 timestamp of when the account was linked, or null if not linked */
  linkedAt: string | null;
}

/**
 * Response from POST /deals/:id/agree — API returns the updated Deal directly.
 * The controller calls reply.send(deal), not reply.send({ deal }).
 */
export type AgreeResponse = Deal;

/**
 * Response from POST /deals/:id/fund — API returns the updated Deal directly.
 */
export type FundResponse = Deal;

/**
 * Response from POST /deals/:id/cancel — API returns the updated Deal directly.
 */
export type CancelResponse = Deal;

/** Response from POST /milestones/:id/submit */
export interface SubmitMilestoneResponse {
  milestone: Milestone;
  submission: Submission;
}

/** Response from POST /milestones/:id/approve */
export interface ApproveMilestoneResponse {
  milestone: Milestone;
}

/** Response from POST /milestones/:id/reject */
export interface RejectMilestoneResponse {
  milestone: Milestone;
  rejectionNote: RejectionNote;
}

// ─── Auth Endpoints ────────────────────────────────────────────────────────────

/** Auth API namespace — all authentication-related calls */
export const authApi = {
  /**
   * Requests a SIWE nonce for the given wallet address.
   * The nonce must be included in the SIWE message before signing.
   *
   * @param walletAddress - The wallet address requesting a nonce (checksummed or lowercase)
   * @returns Object containing the nonce string
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async getNonce(walletAddress: string): Promise<NonceResponse> {
    return request<NonceResponse>('/api/v1/auth/nonce', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    });
  },

  /**
   * Verifies a SIWE signature and exchanges it for a JWT.
   *
   * @param message - The raw SIWE message string that was signed
   * @param signature - The hex-encoded EIP-191 signature
   * @returns Object containing the JWT, userId, and walletAddress
   * @throws {ApiCallError} On non-2xx response (400 for invalid signature)
   * @throws {NetworkError} On network failure
   */
  async verify(message: string, signature: string): Promise<AuthVerifyResponse> {
    return request<AuthVerifyResponse>('/api/v1/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    });
  },
};

// ─── Deals Endpoints ───────────────────────────────────────────────────────────

/** Input for creating a new deal */
export interface CreateDealInput {
  freelancerAddress: string;
  tokenAddress: string;
  milestones: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string;
    amount: string;
  }>;
}

/** Deals API namespace */
export const dealsApi = {
  /**
   * Lists all deals for the authenticated user (as client or freelancer).
   *
   * @returns Array of Deal objects
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async list(): Promise<Deal[]> {
    return request<Deal[]>('/api/v1/deals');
  },

  /**
   * Creates a new deal with the specified milestones.
   * Only callable by a client (enforced by the API).
   *
   * @param input - Deal creation payload including freelancer address and milestones
   * @returns The newly created Deal object
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response (400 for invalid input)
   * @throws {NetworkError} On network failure
   */
  async create(input: CreateDealInput): Promise<Deal> {
    return request<Deal>('/api/v1/deals', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Retrieves a single deal by ID, including its milestones.
   *
   * @param dealId - The deal UUID
   * @returns The Deal object with milestones populated
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response (404 if not found or unauthorized)
   * @throws {NetworkError} On network failure
   */
  async get(dealId: string): Promise<Deal> {
    return request<Deal>(`/api/v1/deals/${encodeURIComponent(dealId)}`);
  },

  /**
   * Confirms freelancer agreement to the deal milestones.
   * Triggers the DRAFT → AGREED state transition.
   * Only callable by the deal's freelancer.
   *
   * @param dealId - The deal UUID to agree to
   * @returns Updated Deal object in AGREED status
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On 400 (invalid transition) or 403 (wrong role)
   * @throws {NetworkError} On network failure
   */
  async agree(dealId: string): Promise<AgreeResponse> {
    return request<AgreeResponse>(`/api/v1/deals/${encodeURIComponent(dealId)}/agree`, {
      method: 'POST',
    });
  },

  /**
   * Records that the client has funded the deal on-chain.
   * The API indexer will also detect this, but this endpoint allows
   * the frontend to confirm immediately after the on-chain tx.
   *
   * @param dealId - The deal UUID
   * @param txHash - The transaction hash of the funding transaction
   * @returns Updated Deal object
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async fund(dealId: string, txHash: string): Promise<FundResponse> {
    return request<FundResponse>(`/api/v1/deals/${encodeURIComponent(dealId)}/fund`, {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    });
  },

  /**
   * Cancels a deal. Refund rules depend on current deal status (see CLAUDE.md Section C).
   *
   * @param dealId - The deal UUID to cancel
   * @returns Updated Deal object in CANCELLED status
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On 400 (cannot cancel from current state) or 403 (wrong role)
   * @throws {NetworkError} On network failure
   */
  async cancel(dealId: string): Promise<CancelResponse> {
    return request<CancelResponse>(`/api/v1/deals/${encodeURIComponent(dealId)}/cancel`, {
      method: 'POST',
    });
  },

  /**
   * Retrieves the full audit trail (deal_events) for a deal.
   *
   * @param dealId - The deal UUID
   * @returns Array of DealEvent objects in chronological order
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async getTimeline(dealId: string): Promise<DealEvent[]> {
    return request<DealEvent[]>(`/api/v1/deals/${encodeURIComponent(dealId)}/timeline`);
  },
};

// ─── Milestones Endpoints ──────────────────────────────────────────────────────

/** Input for submitting a milestone */
export interface SubmitMilestoneInput {
  summary: string;
  links: string[];
}

/** Input for rejecting a milestone */
export interface RejectMilestoneInput {
  reasonCodes: string[];
  freeText: string;
}

/** Milestones API namespace */
export const milestonesApi = {
  /**
   * Submits a milestone for client review.
   * Triggers PENDING → SUBMITTED (or REVISION → SUBMITTED) state transition.
   * Only callable by the deal's freelancer.
   *
   * @param milestoneId - The milestone UUID
   * @param input - Submission payload with summary and delivery links
   * @returns Updated milestone and the new submission record
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On 400 (invalid transition) or 403 (wrong role)
   * @throws {NetworkError} On network failure
   */
  async submit(milestoneId: string, input: SubmitMilestoneInput): Promise<SubmitMilestoneResponse> {
    return request<SubmitMilestoneResponse>(
      `/api/v1/milestones/${encodeURIComponent(milestoneId)}/submit`,
      { method: 'POST', body: JSON.stringify(input) }
    );
  },

  /**
   * Approves a submitted milestone and triggers on-chain fund release.
   * Only callable by the deal's client.
   *
   * @param milestoneId - The milestone UUID
   * @returns Updated milestone in APPROVED status
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On 400 (invalid transition) or 403 (wrong role)
   * @throws {NetworkError} On network failure
   */
  async approve(milestoneId: string): Promise<ApproveMilestoneResponse> {
    return request<ApproveMilestoneResponse>(
      `/api/v1/milestones/${encodeURIComponent(milestoneId)}/approve`,
      { method: 'POST' }
    );
  },

  /**
   * Rejects a submitted milestone with structured reasons.
   * Automatically sets milestone to REVISION status after rejection.
   * Only callable by the deal's client.
   *
   * @param milestoneId - The milestone UUID
   * @param input - Rejection reasons and free-text feedback
   * @returns Updated milestone and the new rejection note
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On 400 (invalid transition) or 403 (wrong role)
   * @throws {NetworkError} On network failure
   */
  async reject(milestoneId: string, input: RejectMilestoneInput): Promise<RejectMilestoneResponse> {
    return request<RejectMilestoneResponse>(
      `/api/v1/milestones/${encodeURIComponent(milestoneId)}/reject`,
      { method: 'POST', body: JSON.stringify(input) }
    );
  },
};

// ─── Telegram Endpoints ────────────────────────────────────────────────────────

/** Telegram linking API namespace */
export const telegramApi = {
  /**
   * Generates a one-time code for linking a Telegram account.
   * The code expires after 15 minutes.
   *
   * @returns Object with the OTP code and its expiry timestamp
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async generateCode(): Promise<TelegramCodeResponse> {
    return request<TelegramCodeResponse>('/api/v1/telegram/generate-code', {
      method: 'POST',
    });
  },

  /**
   * Verifies an OTP submitted from the web dashboard to link a Telegram user ID.
   * The bot sends this code to the user, who pastes it here.
   *
   * @param code - The one-time code received from the Telegram bot
   * @returns Object confirming the link with the Telegram user ID
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On 400 (invalid/expired code) or non-2xx
   * @throws {NetworkError} On network failure
   */
  async link(oneTimeCode: string, telegramUserId: string): Promise<TelegramLinkResponse> {
    return request<TelegramLinkResponse>('/api/v1/telegram/link', {
      method: 'POST',
      body: JSON.stringify({ oneTimeCode, telegramUserId }),
    });
  },

  /**
   * Removes the Telegram link for the authenticated user.
   * Immediately revokes bot access for this user.
   *
   * @returns void (204 No Content from the API)
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async unlink(): Promise<void> {
    return request<void>('/api/v1/telegram/unlink', { method: 'DELETE' });
  },

  /**
   * Returns the current Telegram link status for the authenticated user.
   *
   * @returns Status object with linked flag, telegramUserId, and linkedAt timestamp
   * @throws {AuthExpiredError} If JWT is invalid or expired
   * @throws {ApiCallError} On non-2xx response
   * @throws {NetworkError} On network failure
   */
  async getStatus(): Promise<TelegramStatusResponse> {
    return request<TelegramStatusResponse>('/api/v1/telegram/status');
  },
};

// ─── Health Check ──────────────────────────────────────────────────────────────

/** Misc API namespace */
export const miscApi = {
  /**
   * Calls the health check endpoint to verify the API is reachable.
   *
   * @returns Health response with status and timestamp
   * @throws {NetworkError} On network failure
   * @throws {ApiCallError} On non-2xx response
   */
  async health(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/v1/health');
  },
};

