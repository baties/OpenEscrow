/**
 * config/env.ts — OpenEscrow API
 *
 * Handles: Parsing and validation of all environment variables via Zod.
 *          Crashes at startup with a clear error if any required variable is missing or invalid.
 * Does NOT: contain application logic, database connections, or server setup.
 *            Secrets are read from env only — never hardcoded here.
 */

import { z } from 'zod';

/**
 * Zod schema for all required and optional environment variables.
 * All secrets (JWT_SECRET, BOT_API_SECRET) are required strings with minimum length.
 * RPC_URL and CONTRACT_ADDRESS are required for chain indexer operation.
 */
const envSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid PostgreSQL URL' }),

  // Auth
  JWT_SECRET: z.string().min(32, { message: 'JWT_SECRET must be at least 32 characters' }),
  JWT_EXPIRY: z.string().default('24h'),

  // CORS
  ALLOWED_ORIGIN: z.string().url({ message: 'ALLOWED_ORIGIN must be a valid URL' }),

  // Bot auth
  BOT_API_SECRET: z.string().min(32, { message: 'BOT_API_SECRET must be at least 32 characters' }),

  // Chain
  CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, { message: 'CONTRACT_ADDRESS must be a valid EVM address' }),
  RPC_URL: z.string().url({ message: 'RPC_URL must be a valid HTTP(S) URL' }),
  USDC_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, { message: 'USDC_ADDRESS must be a valid EVM address' }),
  USDT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/, { message: 'USDT_ADDRESS must be a valid EVM address' }),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(12000),
});

/**
 * The validated, typed environment configuration object.
 * Import this from other modules instead of reading `process.env` directly.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates all environment variables at module load time.
 * If validation fails, logs the specific errors and exits the process immediately.
 * This ensures the server never starts in a partially-configured state.
 *
 * @returns Validated and typed environment configuration
 * @throws Calls process.exit(1) on validation failure — never throws to caller
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('[config/env] FATAL: Invalid environment configuration.');
    console.error('[config/env] Missing or invalid variables:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
