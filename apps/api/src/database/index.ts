/**
 * database/index.ts — OpenEscrow API
 *
 * Handles: Creating and exporting the Drizzle ORM database connection backed by node-postgres (pg).
 * Does NOT: define schema (see schema.ts), run migrations (see migrate.ts),
 *            or contain query logic (that lives in service files).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * The node-postgres connection pool.
 * Pool size is conservative for the single-server MVP deployment.
 * Connection timeout and idle timeout are set to avoid stale connections.
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/**
 * Drizzle ORM database instance with full schema attached.
 * All query operations must go through this instance — no raw SQL unless unavoidable.
 */
export const db = drizzle(pool, { schema });

/**
 * The pg Pool instance, exported for use in migrate.ts and health checks.
 */
export { pool };
