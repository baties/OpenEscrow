/**
 * index.ts — OpenEscrow API
 *
 * Handles: Application entry point. Builds the Fastify server, registers all plugins,
 *          runs database migrations, registers route handlers, and starts the HTTP server.
 *          Also starts the chain event indexer and handles graceful shutdown.
 * Does NOT: contain business logic (see modules/), define routes inline (see routers),
 *            or define schema (see database/schema.ts).
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { runMigrations, closePool } from './database/migrate.js';
import { globalErrorHandler } from './middleware/error-handler.js';
import { dealsRouter } from './modules/deals/deals.router.js';
import { milestonesRouter } from './modules/milestones/milestones.router.js';
import { telegramRouter } from './modules/telegram-link/telegram.router.js';
import { startIndexer, stopIndexer } from './chain/indexer.js';
import { handleGenerateNonce, handleVerify } from './modules/auth/verify.js';
import { GenerateNonceInputSchema, VerifyInputSchema } from './modules/auth/auth.schema.js';

const log = logger.child({ module: 'index' });

/**
 * Builds and configures the Fastify application instance.
 * Registers plugins, middleware, and all route modules under /api/v1/.
 * Separated from startServer() to make testing easier.
 *
 * @returns Configured Fastify instance (not yet listening)
 */
export async function buildApp() {
  const fastify = Fastify({
    logger: false, // Use our own pino logger, not Fastify's built-in.
    trustProxy: true,
  });

  // ─── Plugins ──────────────────────────────────────────────────────────────

  // CORS: locked to the web dashboard origin only — no wildcard in production.
  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // JWT: used for session auth after SIWE verification.
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRY,
    },
  });

  // Rate limiting: protects against brute-force and DDoS.
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ─── Global error handler ─────────────────────────────────────────────────

  fastify.setErrorHandler(globalErrorHandler);

  // ─── Health check (public — no auth) ─────────────────────────────────────

  /**
   * GET /api/v1/health
   * Public health check endpoint. Returns service status and timestamp.
   *
   * @returns { status: "ok", timestamp: ISO string }
   */
  fastify.get('/api/v1/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Auth routes (public — no auth required) ──────────────────────────────

  /**
   * POST /api/v1/auth/nonce
   * Returns a SIWE nonce for the given wallet address.
   * Validates body manually via Zod (Fastify schema option uses AJV, not Zod).
   *
   * @param request - Body: { walletAddress: string }
   * @returns { nonce: string }
   * @throws 400 if walletAddress is invalid
   */
  fastify.post(
    '/api/v1/auth/nonce',
    async (request, reply) => {
      const parsed = GenerateNonceInputSchema.safeParse(request.body);
      if (!parsed.success) {
        await reply.status(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
        return;
      }
      const nonce = handleGenerateNonce({ walletAddress: parsed.data.walletAddress });
      await reply.status(200).send({ nonce });
    },
  );

  /**
   * POST /api/v1/auth/verify
   * Verifies a SIWE-signed message and issues a JWT on success.
   * Validates body manually via Zod.
   *
   * @param request - Body: { message: string; signature: string }
   * @returns { token: string }
   * @throws 400 if message or signature are invalid
   */
  fastify.post(
    '/api/v1/auth/verify',
    async (request, reply) => {
      const parsed = VerifyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        await reply.status(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
        return;
      }
      const token = await handleVerify(
        { message: parsed.data.message, signature: parsed.data.signature },
        fastify,
      );
      await reply.status(200).send({ token });
    },
  );

  // ─── Feature routes (all under /api/v1) ──────────────────────────────────

  await fastify.register(dealsRouter, { prefix: '/api/v1' });
  await fastify.register(milestonesRouter, { prefix: '/api/v1' });
  await fastify.register(telegramRouter, { prefix: '/api/v1' });

  return fastify;
}

/**
 * Starts the OpenEscrow API server.
 * Runs DB migrations, builds the Fastify app, starts the chain indexer,
 * binds to the configured port, and sets up graceful shutdown handlers.
 *
 * @returns Promise<void>
 */
async function startServer(): Promise<void> {
  log.info({ module: 'index', operation: 'startServer' }, 'Starting OpenEscrow API server');

  // Run pending database migrations before accepting requests.
  log.info({ module: 'index', operation: 'startServer' }, 'Running database migrations');
  try {
    await runMigrations();
    log.info({ module: 'index', operation: 'startServer' }, 'Database migrations complete');
  } catch (err) {
    log.error({
      module: 'index',
      operation: 'startServer',
      error: err instanceof Error ? err.message : String(err),
    }, 'Database migration failed — exiting');
    process.exit(1);
  }

  // Build the application.
  let app: Awaited<ReturnType<typeof buildApp>>;
  try {
    app = await buildApp();
  } catch (err) {
    log.error({
      module: 'index',
      operation: 'startServer',
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to build Fastify app — exiting');
    process.exit(1);
  }

  // Start the chain event indexer.
  if (env.NODE_ENV !== 'test') {
    startIndexer();
  }

  // Start listening.
  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
    log.info({
      module: 'index',
      operation: 'startServer',
      port: env.API_PORT,
    }, `OpenEscrow API listening on port ${env.API_PORT}`);
  } catch (err) {
    log.error({
      module: 'index',
      operation: 'startServer',
      port: env.API_PORT,
      error: err instanceof Error ? err.message : String(err),
    }, 'Failed to start server — exiting');
    process.exit(1);
  }

  // ─── Graceful shutdown ─────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ module: 'index', operation: 'shutdown', signal }, 'Graceful shutdown initiated');

    stopIndexer();

    try {
      await app.close();
      await closePool();
      log.info({ module: 'index', operation: 'shutdown' }, 'Server shutdown complete');
      process.exit(0);
    } catch (err) {
      log.error({
        module: 'index',
        operation: 'shutdown',
        error: err instanceof Error ? err.message : String(err),
      }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only auto-start when this file is the entry point (not when imported by tests).
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  void startServer();
}
