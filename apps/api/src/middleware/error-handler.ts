/**
 * middleware/error-handler.ts — OpenEscrow API
 *
 * Handles: Global Fastify error handler. Maps AppError instances to structured HTTP responses.
 *          Catches Zod validation errors from @fastify/type-provider-zod and formats them uniformly.
 * Does NOT: log errors (that is the responsibility of the service that throws),
 *            perform business logic, or modify application state.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError, httpStatusForCode } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'middleware.error-handler' });

/**
 * Global error handler registered with Fastify via `fastify.setErrorHandler(globalErrorHandler)`.
 * Produces a consistent JSON error envelope for all error types.
 *
 * Response shape:
 * - AppError:        { error: string, message: string, details?: object }
 * - Validation (400): { error: "VALIDATION_ERROR", message: string, details: { issues: array } }
 * - Unknown (500):   { error: "INTERNAL_ERROR", message: "An unexpected error occurred" }
 *
 * @param error - The error thrown by a route handler or plugin
 * @param request - The Fastify request that triggered the error
 * @param reply - The Fastify reply used to send the error response
 * @returns Promise<void>
 */
export async function globalErrorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // AppError: typed application error with known code and status mapping.
  if (error instanceof AppError) {
    const status = httpStatusForCode(error.code);

    // Only log 5xx as errors; 4xx are expected client errors, logged at warn level.
    if (status >= 500) {
      log.error(
        {
          module: 'middleware.error-handler',
          operation: 'globalErrorHandler',
          errorCode: error.code,
          path: request.url,
          method: request.method,
          error: error.message,
          details: error.details,
        },
        'Application error (5xx)'
      );
    } else {
      log.warn(
        {
          module: 'middleware.error-handler',
          operation: 'globalErrorHandler',
          errorCode: error.code,
          path: request.url,
          error: error.message,
        },
        'Application error (4xx)'
      );
    }

    await reply.status(status).send({
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  // Fastify / Zod validation errors (statusCode is set by Fastify).
  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode === 400 || fastifyError.validation) {
    log.warn(
      {
        module: 'middleware.error-handler',
        operation: 'globalErrorHandler',
        path: request.url,
        error: fastifyError.message,
      },
      'Validation error'
    );

    await reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: fastifyError.message,
      ...(fastifyError.validation ? { details: { issues: fastifyError.validation } } : {}),
    });
    return;
  }

  // JWT errors from @fastify/jwt.
  if (fastifyError.statusCode === 401) {
    await reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
    return;
  }

  // All other unexpected errors.
  log.error(
    {
      module: 'middleware.error-handler',
      operation: 'globalErrorHandler',
      path: request.url,
      method: request.method,
      error: error.message,
      stack: error.stack,
    },
    'Unhandled error'
  );

  await reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
