/**
 * config/env.ts — OpenEscrow Telegram Bot
 *
 * Handles: Parsing and validation of all environment variables via Zod.
 *          Fails at startup with a clear error if any required variable is missing or invalid.
 * Does NOT: contain application logic, Telegraf setup, or API calls.
 *           Secrets are read from env only — never hardcoded.
 *
 * Environment variables (see .env.example for full documentation):
 *   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather (required)
 *   API_BASE_URL        — Base URL of the backend API (required)
 *   BOT_API_SECRET      — Shared secret matching the API's BOT_API_SECRET, used for bot-session calls
 *   POLL_INTERVAL_MS    — Notification polling interval in ms (default: 30000)
 *   LOG_LEVEL           — pino log level (default: info)
 *   NODE_ENV            — Node environment (default: development)
 */

import { z } from 'zod';

/**
 * Zod schema for all bot environment variables.
 * All secrets are required strings. Numeric values are coerced from strings.
 */
const envSchema = z.object({
  /** Node execution environment. */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Telegram bot token from @BotFather — never log this value. */
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(20, { message: 'TELEGRAM_BOT_TOKEN must be a valid bot token' }),

  /** Backend API base URL (e.g. http://api:3001 in Docker, http://localhost:3001 in dev). */
  API_BASE_URL: z
    .string()
    .url({ message: 'API_BASE_URL must be a valid URL' })
    .default('http://localhost:3001'),

  /**
   * Shared secret for bot-to-API authentication.
   * Must match the BOT_API_SECRET in the API's .env.
   * Used for POST /api/v1/telegram/bot-session calls.
   * Never log this value.
   */
  BOT_API_SECRET: z.string().min(32, { message: 'BOT_API_SECRET must be at least 32 characters' }),

  /** Polling interval for notification checks in milliseconds (MVP spec: 30 seconds). */
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30000),

  /** pino log level. */
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

/**
 * Typed environment configuration — import this instead of reading process.env directly.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates all bot environment variables at module load time.
 * If validation fails, logs the specific errors and exits the process immediately.
 * This ensures the bot never starts in a partially-configured state.
 *
 * @returns Validated and typed environment configuration
 * @throws Calls process.exit(1) on validation failure — never throws to caller
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('[bot/config/env] FATAL: Invalid environment configuration.');
    console.error('[bot/config/env] Missing or invalid variables:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

/** Validated, typed bot environment configuration. Singleton at module level. */
export const env = parseEnv();
