/**
 * lib/errors.ts — OpenEscrow API
 *
 * Handles: Typed application error class used across all service and middleware layers.
 *          Provides structured error codes, messages, and optional details for API responses.
 * Does NOT: log errors (callers are responsible for logging before throwing),
 *            handle HTTP response formatting (see middleware/error-handler.ts).
 */

/**
 * All typed error codes used across the OpenEscrow API.
 * Grouped by domain for readability.
 */
export type AppErrorCode =
  // Auth
  | 'NONCE_NOT_FOUND'
  | 'INVALID_SIGNATURE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'JWT_INVALID'
  // Deals
  | 'DEAL_NOT_FOUND'
  | 'DEAL_CREATE_FAILED'
  | 'DEAL_AGREE_FAILED'
  | 'DEAL_FUND_FAILED'
  | 'DEAL_CANCEL_FAILED'
  | 'DEAL_TIMELINE_FAILED'
  | 'DEAL_LIST_FAILED'
  | 'DEAL_GET_FAILED'
  | 'INVALID_TRANSITION'
  | 'NOT_PARTICIPANT'
  // Milestones
  | 'MILESTONE_NOT_FOUND'
  | 'MILESTONE_SUBMIT_FAILED'
  | 'MILESTONE_APPROVE_FAILED'
  | 'MILESTONE_REJECT_FAILED'
  | 'MILESTONE_NO_SUBMISSION'
  // Telegram
  | 'TELEGRAM_GENERATE_FAILED'
  | 'TELEGRAM_LINK_FAILED'
  | 'TELEGRAM_UNLINK_FAILED'
  | 'TELEGRAM_CODE_INVALID'
  | 'TELEGRAM_CODE_EXPIRED'
  | 'TELEGRAM_CODE_USED'
  | 'TELEGRAM_ALREADY_LINKED'
  | 'TELEGRAM_NOT_LINKED'
  | 'TELEGRAM_STATUS_FAILED'
  // Messages
  | 'MESSAGE_ACCESS_FAILED'
  | 'MESSAGE_SEND_FAILED'
  | 'MESSAGE_LIST_FAILED'
  // Chain
  | 'CHAIN_TX_FAILED'
  | 'CHAIN_READ_FAILED'
  // Users
  | 'USERNAME_TAKEN'
  | 'USER_UPDATE_FAILED'
  // Generic
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'USER_CREATE_FAILED'
  | 'USER_NOT_FOUND';

/**
 * Typed application error class.
 * All service-layer errors should be thrown as AppError instances.
 * HTTP status codes are mapped in the error handler middleware.
 *
 * @example
 * throw new AppError('DEAL_NOT_FOUND', 'Deal does not exist', { dealId });
 */
export class AppError extends Error {
  /** Machine-readable error code for API responses and error handling. */
  public readonly code: AppErrorCode;

  /** Optional structured details for debugging or client display. */
  public readonly details?: Record<string, unknown>;

  /**
   * Creates a typed application error.
   *
   * @param code - Machine-readable error code from AppErrorCode union
   * @param message - Human-readable error description
   * @param details - Optional key-value map with debugging context
   */
  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }

    // Fix prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * HTTP status code mapping for AppError codes.
 * Centralised here so the error handler never has scattered conditionals.
 *
 * @param code - The AppError code to map
 * @returns HTTP status code (number)
 */
export function httpStatusForCode(code: AppErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'JWT_INVALID':
      return 401;

    case 'FORBIDDEN':
    case 'NOT_PARTICIPANT':
      return 403;

    case 'DEAL_NOT_FOUND':
    case 'MILESTONE_NOT_FOUND':
    case 'NONCE_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'NOT_FOUND':
      return 404;

    case 'INVALID_TRANSITION':
    case 'VALIDATION_ERROR':
    case 'INVALID_SIGNATURE':
    case 'TELEGRAM_CODE_INVALID':
    case 'TELEGRAM_CODE_EXPIRED':
    case 'TELEGRAM_CODE_USED':
    case 'TELEGRAM_ALREADY_LINKED':
    case 'TELEGRAM_NOT_LINKED':
    case 'MILESTONE_NO_SUBMISSION':
      return 400;

    default:
      return 500;
  }
}
