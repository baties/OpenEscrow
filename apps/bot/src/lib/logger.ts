/**
 * lib/logger.ts — OpenEscrow Telegram Bot
 *
 * Handles: Pino structured logger configuration for the bot.
 *          All modules import from here — never create ad-hoc loggers.
 * Does NOT: log sensitive data (tokens, OTPs, private keys).
 *            Redact config covers known sensitive field names.
 *
 * Dependencies:
 *   pino — structured JSON logging (same as apps/api, consistent log format)
 */

import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Shared pino logger instance for the bot.
 * Uses structured JSON format in production; pretty-print in development.
 * Redacts known sensitive field names so they never appear in logs.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'token',
      'jwt',
      'authorization',
      'oneTimeCode',
      'one_time_code',
      'password',
      'secret',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
