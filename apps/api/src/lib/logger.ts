/**
 * lib/logger.ts — OpenEscrow API
 *
 * Handles: Creating and exporting the root pino logger instance with structured JSON output.
 *          Configures redaction of sensitive field names to prevent secret leakage in logs.
 * Does NOT: contain business logic, define log levels per-module (callers set their own child loggers),
 *            or write to files (stdout only — Docker / log collector handles routing).
 */

import pino from 'pino';
import { env } from '../config/env.js';

/**
 * List of sensitive field paths that pino will redact from all log output.
 * These cover JWT tokens, auth headers, OTPs, and private key material.
 * Add new sensitive field names here — never log them directly.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-bot-secret"]',
  'jwt',
  'token',
  'password',
  'otp',
  'one_time_code',
  'oneTimeCode',
  'privateKey',
  'seedPhrase',
  'secret',
  'signature',
];

/**
 * Root application logger.
 * All modules should create a child logger via `logger.child({ module: 'module-name' })`.
 * Log level is controlled by the LOG_LEVEL environment variable.
 *
 * @example
 * import { logger } from '../lib/logger.js';
 * const log = logger.child({ module: 'deals.service' });
 * log.info({ operation: 'createDeal', clientId }, 'Deal created');
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
