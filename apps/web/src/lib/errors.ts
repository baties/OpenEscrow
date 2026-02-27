/**
 * errors.ts — OpenEscrow Web Dashboard
 *
 * Client-side error types for the web application.
 * Handles: typed error classes, API error shape parsing, error message helpers.
 * Does NOT: log errors (use console.error with context at call site),
 *            interact with the API or any external service.
 */

/**
 * Shape of the error response body returned by the OpenEscrow API.
 * Matches the ApiError interface from @open-escrow/shared.
 */
export interface ApiErrorBody {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Shape of the invalid-transition error returned by the API on bad state changes.
 */
export interface InvalidTransitionErrorBody {
  error: 'INVALID_TRANSITION';
  from: string;
  to: string;
}

/**
 * Typed error class representing a failed API call.
 * Carries the HTTP status code and structured error body.
 */
export class ApiCallError extends Error {
  /** HTTP status code returned by the API */
  readonly status: number;
  /** Parsed error body from the API response */
  readonly body: ApiErrorBody;

  /**
   * Creates an ApiCallError.
   *
   * @param status - HTTP status code from the API response
   * @param body - Parsed error body from the API response
   */
  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
    this.name = 'ApiCallError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Typed error class for authentication failures (401 responses).
 * Used to trigger auth state clearing and redirect to home.
 */
export class AuthExpiredError extends Error {
  /**
   * Creates an AuthExpiredError.
   */
  constructor() {
    super('Authentication expired. Please reconnect your wallet.');
    this.name = 'AuthExpiredError';
  }
}

/**
 * Typed error class for network-level failures (no response from API).
 */
export class NetworkError extends Error {
  /** The original network error from fetch */
  readonly cause: unknown;

  /**
   * Creates a NetworkError.
   *
   * @param cause - The underlying network error that was thrown
   */
  constructor(cause: unknown) {
    super('Network error: unable to reach the API. Please check your connection.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Extracts a user-displayable message from any error type.
 * Falls back to a generic message if no specific message is available.
 *
 * @param err - Any caught error value
 * @returns A string suitable for display in the UI
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiCallError) {
    return err.body.message ?? err.body.error ?? `Request failed (HTTP ${err.status})`;
  }
  if (err instanceof AuthExpiredError) {
    return err.message;
  }
  if (err instanceof NetworkError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Type guard that checks whether an unknown value has the shape of an ApiErrorBody.
 *
 * @param value - The value to check
 * @returns True if value has error and message string properties
 */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as Record<string, unknown>)['error'] === 'string' &&
    'message' in value &&
    typeof (value as Record<string, unknown>)['message'] === 'string'
  );
}
