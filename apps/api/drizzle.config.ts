/**
 * drizzle.config.ts — OpenEscrow API
 *
 * Handles: Drizzle Kit configuration for migration generation and execution.
 *          Points drizzle-kit at the schema file and output directory.
 * Does NOT: run migrations at runtime (see database/migrate.ts),
 *            or manage the database connection pool (see database/index.ts).
 */

import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 * Run `pnpm db:generate` to generate migration files from schema changes.
 * Run `pnpm db:migrate` to apply pending migrations.
 *
 * DATABASE_URL must be set in the environment for migration commands.
 */
const config: Config = {
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  verbose: true,
  strict: true,
};

export default config;
