/**
 * database/migrate.ts — OpenEscrow API
 *
 * Handles: Running pending Drizzle ORM migrations against the PostgreSQL database on startup.
 *          Retries the database connection up to 10 times (1-second delay) to handle
 *          the case where PostgreSQL is still starting when the API container launches.
 * Does NOT: define schema (see schema.ts), manage the connection pool (see index.ts),
 *            or seed data.
 */

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Max attempts to connect to Postgres before giving up. */
const MAX_ATTEMPTS = 10;
/** Delay in ms between connection attempts. */
const RETRY_DELAY_MS = 1000;

/**
 * Returns a human-readable error string from any thrown value.
 * Handles three cases:
 *  - AggregateError (Node.js ≥18 net failures): surfaces all individual sub-errors.
 *  - Drizzle-orm 0.33+ wraps the real pg error in `err.cause` when err.message is empty.
 *  - Standard Error or unknown values.
 *
 * @param err - The caught error value
 * @returns A non-empty string describing the error
 */
function describeError(err: unknown): string {
  // AggregateError is thrown by Node.js net when all address family connections fail.
  // Typical cause: PostgreSQL not running at DATABASE_URL host/port.
  if (err instanceof AggregateError) {
    const details = err.errors
      .map((e: unknown) => (e instanceof Error ? e.message : String(e)))
      .join('; ');
    return `Cannot reach database — check DATABASE_URL and ensure PostgreSQL is running. (${details})`;
  }
  if (err instanceof Error) {
    if (err.message) return err.message;
    // Drizzle wraps the underlying pg error in cause
    if (err.cause instanceof Error && err.cause.message) return err.cause.message;
    return err.name ?? 'Unknown Error';
  }
  return String(err);
}

/**
 * Runs all pending database migrations using drizzle-kit generated migration files.
 * Retries up to MAX_ATTEMPTS times with a 1-second delay between attempts so the
 * API can start cleanly even when PostgreSQL is still initialising.
 *
 * @returns Promise<void> — resolves when all migrations have been applied
 * @throws {Error} after MAX_ATTEMPTS failures — caller should exit(1)
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await migrate(db, { migrationsFolder });
      return; // success
    } catch (err) {
      const message = describeError(err);

      if (attempt < MAX_ATTEMPTS) {
        console.error(
          `[migrate] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message} — retrying in ${RETRY_DELAY_MS}ms`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        // Re-throw as a proper Error so index.ts logs a meaningful message
        throw new Error(`Migration failed after ${MAX_ATTEMPTS} attempts: ${message}`);
      }
    }
  }
}

/**
 * Terminates the database pool connection gracefully.
 * Called during server shutdown to release all pooled connections.
 *
 * @returns Promise<void>
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
