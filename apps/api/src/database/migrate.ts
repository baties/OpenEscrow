/**
 * database/migrate.ts — OpenEscrow API
 *
 * Handles: Running pending Drizzle ORM migrations against the PostgreSQL database on startup.
 *          Exits process with a non-zero code if migrations fail.
 * Does NOT: define schema (see schema.ts), manage the connection pool (see index.ts),
 *            or seed data.
 */

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs all pending database migrations using drizzle-kit generated migration files.
 * Migrations folder is resolved relative to this file's location.
 * Logs success/failure and re-throws on error so the caller (index.ts) can handle shutdown.
 *
 * @returns Promise<void> — resolves when all migrations have been applied
 * @throws {Error} if any migration fails — caller should exit(1)
 */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');

  try {
    await migrate(db, { migrationsFolder });
  } catch (err) {
    throw err;
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
