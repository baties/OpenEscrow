/**
 * scripts/reset-db.ts — OpenEscrow API
 *
 * Developer utility: truncates all database tables and resets sequences.
 * Handles: deleting all data from every table in FK-safe order (CASCADE).
 * Does NOT: drop or recreate tables (schema stays intact), run migrations,
 *            or work in production (exits immediately if NODE_ENV=production).
 *
 * Usage:
 *   pnpm db:reset             — truncates all tables (dev/test only)
 *
 * WARNING: This is destructive and irreversible. All deals, users, milestones,
 *          events, and Telegram links will be permanently deleted.
 */

import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

// Best-effort load of root .env
const envPath = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(envPath)) {
  const { config } = await import('dotenv');
  config({ path: envPath });
}

const NODE_ENV = process.env['NODE_ENV'] ?? 'development';
const DATABASE_URL = process.env['DATABASE_URL'];

// Safety guard — never run against production
if (NODE_ENV === 'production') {
  console.error('[reset-db] ERROR: db:reset is not allowed in NODE_ENV=production. Aborting.');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('[reset-db] ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function resetDatabase(): Promise<void> {
  console.log('[reset-db] ⚠️  Resetting all database tables...');
  console.log(`[reset-db] Environment: ${NODE_ENV}`);
  console.log('[reset-db] Tables to truncate: rejection_notes, submissions, deal_events,');
  console.log('           milestones, deals, telegram_links, users');

  const client = await pool.connect();
  try {
    // Truncate all tables in FK-safe order using CASCADE.
    // CASCADE handles any remaining FK references automatically.
    await client.query(`
      TRUNCATE TABLE
        rejection_notes,
        submissions,
        deal_events,
        milestones,
        deals,
        telegram_links,
        users
      RESTART IDENTITY CASCADE;
    `);

    console.log('[reset-db] ✅ All tables truncated successfully.');
    console.log('[reset-db] The database is now empty and ready for fresh testing.');
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase().catch((err: unknown) => {
  console.error('[reset-db] ERROR:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
