/**
 * api-client/index.ts — OpenEscrow Telegram Bot
 *
 * Handles: All HTTP calls from the bot to the OpenEscrow backend API.
 *          Provides a typed, retrying, timeout-bounded API client.
 *          Every bot action (list deals, submit, approve, reject, etc.) goes through here.
 * Does NOT: access the database directly, interact with the blockchain,
 *           or contain business logic beyond request formation and error mapping.
 *
 * Retry policy: 3 attempts with exponential backoff (1s, 2s, 4s).
 * Timeout: 10 seconds per request.
 * On non-retryable errors (4xx), surfaces the API error message to the caller.
 *
 * Dependencies:
 *   node fetch (built-in Node 18+) — no external HTTP dep needed
 */

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type {
  ListDealsResponse,
  GetDealResponse,
  GetTimelineResponse,
  SubmitMilestoneRequest,
  SubmitMilestoneResponse,
  RejectMilestoneRequest,
  RejectMilestoneResponse,
  ApproveMilestoneResponse,
  AgreeDealResponse,
  CancelDealResponse,
  ApiErrorResponse,
  BotSessionResponse,
} from './types.js';

const log = logger.child({ module: 'api-client' });

/** Maximum number of retry attempts for retryable requests (5xx or network errors). */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff in milliseconds. */
const BACKOFF_BASE_MS = 1000;

/** Request timeout in milliseconds — 10s per engineering rules. */
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Typed API Error ──────────────────────────────────────────────────────────

/**
 * Typed error thrown by the API client on non-2xx responses.
 * Callers can inspect `.statusCode` and `.apiError` for structured handling.
 */
export class ApiClientError extends Error {
  /** HTTP status code returned by the API. */
  public readonly statusCode: number;
  /** Parsed API error body, if available. */
  public readonly apiError: ApiErrorResponse | null;

  /**
   * Creates an API client error with HTTP status and optional parsed error body.
   *
   * @param statusCode - HTTP status code from the API response
   * @param apiError - Parsed JSON error body, or null if body was not JSON
   * @param message - Human-readable error summary
   */
  constructor(statusCode: number, apiError: ApiErrorResponse | null, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.apiError = apiError;
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

/**
 * Executes an HTTP request with timeout, retry on 5xx/network errors, and typed error handling.
 * 4xx responses are not retried — they surface as ApiClientError immediately.
 *
 * @param method - HTTP method (GET, POST, DELETE, etc.)
 * @param path - API path (e.g. '/api/v1/deals') — appended to API_BASE_URL
 * @param jwt - JWT token for Authorization header; null for public endpoints
 * @param body - Optional request body (JSON-serialized)
 * @returns Parsed response body as generic type T
 * @throws {ApiClientError} On 4xx or unrecoverable 5xx after retries
 * @throws {Error} On network timeout after all retries exhausted
 */
async function request<T>(
  method: string,
  path: string,
  jwt: string | null,
  body?: unknown
): Promise<T> {
  const url = `${env.API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (jwt !== null) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const fetchInit: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };
      if (body !== undefined) {
        fetchInit.body = JSON.stringify(body);
      }
      const response = await fetch(url, fetchInit);

      clearTimeout(timeoutId);

      // Parse response body — attempt JSON parse regardless of status
      let parsed: unknown;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        parsed = await response.json();
      } else {
        parsed = await response.text();
      }

      if (response.ok) {
        return parsed as T;
      }

      // 4xx — client error, not retryable
      if (response.status >= 400 && response.status < 500) {
        const apiErr = isApiErrorResponse(parsed) ? parsed : null;
        throw new ApiClientError(
          response.status,
          apiErr,
          `API error ${response.status}: ${apiErr?.message ?? String(parsed)}`
        );
      }

      // 5xx — server error, retryable
      lastError = new Error(`Server error ${response.status} on attempt ${attempt}`);
      log.warn(
        {
          module: 'api-client',
          operation: 'request',
          method,
          path,
          statusCode: response.status,
          attempt,
          maxRetries: MAX_RETRIES,
        },
        'Retryable server error — will retry'
      );
    } catch (err) {
      clearTimeout(timeoutId);

      // ApiClientError (4xx) — rethrow immediately, do not retry
      if (err instanceof ApiClientError) throw err;

      // AbortError — request timed out
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(
          `Request timed out after ${REQUEST_TIMEOUT_MS}ms (attempt ${attempt})`
        );
        log.warn(
          {
            module: 'api-client',
            operation: 'request',
            method,
            path,
            attempt,
            maxRetries: MAX_RETRIES,
            error: lastError.message,
          },
          'Request timeout — will retry'
        );
      } else if (err instanceof Error) {
        lastError = err;
        log.warn(
          {
            module: 'api-client',
            operation: 'request',
            method,
            path,
            attempt,
            maxRetries: MAX_RETRIES,
            error: err.message,
          },
          'Network error — will retry'
        );
      } else {
        lastError = new Error(String(err));
      }
    }

    // Exponential backoff before next attempt (skip on last attempt)
    if (attempt < MAX_RETRIES) {
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }
  }

  log.error(
    {
      module: 'api-client',
      operation: 'request',
      method,
      path,
      maxRetries: MAX_RETRIES,
      error: lastError.message,
    },
    'All retry attempts exhausted'
  );

  throw lastError;
}

/**
 * Type guard for ApiErrorResponse — checks if a parsed JSON value
 * matches the expected API error shape.
 *
 * @param value - Any parsed JSON value
 * @returns true if value has `error` (string) and `message` (string) properties
 */
function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as Record<string, unknown>)['error'] === 'string' &&
    'message' in value &&
    typeof (value as Record<string, unknown>)['message'] === 'string'
  );
}

/**
 * Resolves after the specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API client functions ──────────────────────────────────────────────

/**
 * Lists all active deals for the authenticated user (client + freelancer roles).
 * Calls GET /api/v1/deals.
 *
 * @param jwt - JWT token for the authenticated user
 * @returns Array of deals the user participates in
 * @throws {ApiClientError} On API error (401, 403, 5xx)
 */
export async function listDeals(jwt: string): Promise<ListDealsResponse> {
  log.info({ module: 'api-client', operation: 'listDeals' }, 'Fetching deals list');
  return request<ListDealsResponse>('GET', '/api/v1/deals', jwt);
}

/**
 * Retrieves a single deal by ID including its milestones.
 * Calls GET /api/v1/deals/:id.
 *
 * @param jwt - JWT token for the authenticated user
 * @param dealId - UUID of the deal to fetch
 * @returns Full deal object with milestones
 * @throws {ApiClientError} On 404 (not found), 403 (not participant), or other API errors
 */
export async function getDeal(jwt: string, dealId: string): Promise<GetDealResponse> {
  log.info({ module: 'api-client', operation: 'getDeal', dealId }, 'Fetching deal');
  return request<GetDealResponse>('GET', `/api/v1/deals/${dealId}`, jwt);
}

/**
 * Retrieves the audit trail (deal_events) for a deal.
 * Calls GET /api/v1/deals/:id/timeline.
 *
 * @param jwt - JWT token for the authenticated user
 * @param dealId - UUID of the deal
 * @returns Array of deal events ordered chronologically
 * @throws {ApiClientError} On 404, 403, or other API errors
 */
export async function getDealTimeline(jwt: string, dealId: string): Promise<GetTimelineResponse> {
  log.info(
    { module: 'api-client', operation: 'getDealTimeline', dealId },
    'Fetching deal timeline'
  );
  return request<GetTimelineResponse>('GET', `/api/v1/deals/${dealId}/timeline`, jwt);
}

/**
 * Confirms deal agreement (freelancer action — DRAFT → AGREED).
 * Calls POST /api/v1/deals/:id/agree.
 *
 * @param jwt - JWT token for the authenticated freelancer
 * @param dealId - UUID of the deal to agree to
 * @returns Updated deal object
 * @throws {ApiClientError} On 400 (invalid transition), 403 (not freelancer), 404, or 5xx
 */
export async function agreeToDeal(jwt: string, dealId: string): Promise<AgreeDealResponse> {
  log.info({ module: 'api-client', operation: 'agreeToDeal', dealId }, 'Agreeing to deal');
  return request<AgreeDealResponse>('POST', `/api/v1/deals/${dealId}/agree`, jwt);
}

/**
 * Cancels a deal. Either party can cancel per the state machine rules.
 * Calls POST /api/v1/deals/:id/cancel.
 *
 * @param jwt - JWT token for the authenticated user (client or freelancer)
 * @param dealId - UUID of the deal to cancel
 * @returns Updated (cancelled) deal object
 * @throws {ApiClientError} On 400 (invalid transition), 403, 404, or 5xx
 */
export async function cancelDeal(jwt: string, dealId: string): Promise<CancelDealResponse> {
  log.info({ module: 'api-client', operation: 'cancelDeal', dealId }, 'Cancelling deal');
  return request<CancelDealResponse>('POST', `/api/v1/deals/${dealId}/cancel`, jwt);
}

/**
 * Submits milestone deliverables (freelancer action — PENDING/REVISION → SUBMITTED).
 * Calls POST /api/v1/milestones/:id/submit.
 *
 * @param jwt - JWT token for the authenticated freelancer
 * @param milestoneId - UUID of the milestone to submit
 * @param body - Submission payload with summary and links
 * @returns Created submission record
 * @throws {ApiClientError} On 400 (invalid transition, validation), 403, 404, or 5xx
 */
export async function submitMilestone(
  jwt: string,
  milestoneId: string,
  body: SubmitMilestoneRequest
): Promise<SubmitMilestoneResponse> {
  log.info(
    { module: 'api-client', operation: 'submitMilestone', milestoneId },
    'Submitting milestone'
  );
  return request<SubmitMilestoneResponse>(
    'POST',
    `/api/v1/milestones/${milestoneId}/submit`,
    jwt,
    body
  );
}

/**
 * Approves a milestone (client action — SUBMITTED → APPROVED).
 * Calls POST /api/v1/milestones/:id/approve.
 *
 * @param jwt - JWT token for the authenticated client
 * @param milestoneId - UUID of the milestone to approve
 * @returns Updated milestone record
 * @throws {ApiClientError} On 400, 403 (not client), 404, or 5xx
 */
export async function approveMilestone(
  jwt: string,
  milestoneId: string
): Promise<ApproveMilestoneResponse> {
  log.info(
    { module: 'api-client', operation: 'approveMilestone', milestoneId },
    'Approving milestone'
  );
  return request<ApproveMilestoneResponse>(
    'POST',
    `/api/v1/milestones/${milestoneId}/approve`,
    jwt
  );
}

/**
 * Rejects a milestone with structured reasons (client action — SUBMITTED → REJECTED/REVISION).
 * Calls POST /api/v1/milestones/:id/reject.
 *
 * @param jwt - JWT token for the authenticated client
 * @param milestoneId - UUID of the milestone to reject
 * @param body - Rejection payload with reasonCodes and freeText
 * @returns Created rejection note record
 * @throws {ApiClientError} On 400 (invalid transition, validation), 403, 404, or 5xx
 */
export async function rejectMilestone(
  jwt: string,
  milestoneId: string,
  body: RejectMilestoneRequest
): Promise<RejectMilestoneResponse> {
  log.info(
    { module: 'api-client', operation: 'rejectMilestone', milestoneId },
    'Rejecting milestone'
  );
  return request<RejectMilestoneResponse>(
    'POST',
    `/api/v1/milestones/${milestoneId}/reject`,
    jwt,
    body
  );
}

/**
 * Requests a JWT for a linked Telegram user by calling POST /api/v1/telegram/bot-session.
 * Authenticates via the X-Bot-Secret header (shared secret between bot and API).
 * Returns null (404) if the given Telegram user ID is not yet linked to any wallet.
 *
 * @param telegramUserId - The Telegram numeric user ID as a string
 * @param botApiSecret - The BOT_API_SECRET shared with the API (from env)
 * @returns BotSessionResponse with token, userId, walletAddress; or null if not linked
 * @throws {ApiClientError} On 401 (wrong secret) or 5xx
 */
export async function getBotSession(
  telegramUserId: string,
  botApiSecret: string
): Promise<BotSessionResponse | null> {
  log.info(
    { module: 'api-client', operation: 'getBotSession' },
    'Requesting bot session for Telegram user'
  );

  const url = `${env.API_BASE_URL}/api/v1/telegram/bot-session`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bot-Secret': botApiSecret,
      },
      body: JSON.stringify({ telegramUserId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') ?? '';
    const parsed: unknown = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (response.status === 404) return null; // Not yet linked — normal state

    if (!response.ok) {
      const apiErr = isApiErrorResponse(parsed) ? parsed : null;
      throw new ApiClientError(
        response.status,
        apiErr,
        `Bot-session API error ${response.status}: ${apiErr?.message ?? String(parsed)}`
      );
    }

    return parsed as BotSessionResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof ApiClientError) throw err;
    throw new Error(
      `getBotSession network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
